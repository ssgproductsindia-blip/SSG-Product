'use server';

import { headers } from 'next/headers';

import { clientKey, rateLimit } from '@/lib/rate-limit';
import { trackOrderSchema } from '@/lib/validation';
import { createClient } from '@/lib/supabase/server';
import type { OrderStatus } from '@/lib/database.types';

/**
 * Order tracking lookup.
 *
 * Runs through the ANONYMOUS client on purpose. `lookup_order` is a
 * security-definer function whose own ownership check is the gate, so routing
 * this through the service client would gain nothing and would mean a bug
 * here could expose orders rather than merely fail.
 *
 * The function returns an identical null for "wrong contact" and "no such
 * order", and this action preserves that: one message for both cases. Telling
 * someone "that order exists, but the email is wrong" would turn the form
 * into an oracle for discovering valid order numbers.
 */

export type TrackedOrder = {
  orderNumber: string;
  status: OrderStatus;
  placedAt: string;
  customerName: string;
  subtotalPaise: number;
  discountPaise: number;
  shippingPaise: number;
  totalPaise: number;
  items: {
    productName: string;
    variantName: string;
    quantity: number;
    pricePaise: number;
    subtotalPaise: number;
  }[];
  shippingAddress: {
    name: string;
    address: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  } | null;
  shipment: {
    courierName: string;
    trackingId: string;
    trackingUrl: string | null;
    shippedAt: string;
  } | null;
};

export type TrackResult =
  | { ok: true; order: TrackedOrder }
  | { ok: false; error: string };

const NOT_FOUND =
  'We could not find an order with those details. Check the order number and the email or phone used when ordering.';

export async function trackOrderAction(input: unknown): Promise<TrackResult> {
  const requestHeaders = await headers();

  // Tighter than checkout: this is the endpoint someone would hammer to guess
  // order numbers. See the honest limits documented in src/lib/rate-limit.ts —
  // the ownership check is what makes guessing fail, this just raises the cost.
  const limit = rateLimit(clientKey(requestHeaders, 'track'), {
    limit: 12,
    windowMs: 5 * 60 * 1000,
  });

  if (!limit.allowed) {
    return {
      ok: false,
      error: `Too many attempts. Please wait ${limit.retryAfter} seconds and try again.`,
    };
  }

  const parsed = trackOrderSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Please check your details.' };
  }

  const supabase = await createClient();

  const { data, error } = await supabase.rpc('lookup_order', {
    p_order_number: parsed.data.orderNumber,
    p_contact: parsed.data.contact,
  });

  if (error) {
    return { ok: false, error: 'We could not look that up just now. Please try again shortly.' };
  }

  if (!data) {
    return { ok: false, error: NOT_FOUND };
  }

  const raw = data as unknown as {
    order_number: string;
    status: OrderStatus;
    placed_at: string;
    customer_name: string;
    subtotal_paise: number;
    discount_paise: number;
    shipping_paise: number;
    total_paise: number;
    items: {
      product_name: string;
      variant_name: string;
      quantity: number;
      price_paise: number;
      subtotal_paise: number;
    }[];
    shipping_address: {
      name: string;
      address: string;
      city: string;
      state: string;
      postal_code: string;
      country: string;
    } | null;
    shipment: {
      courier_name: string;
      tracking_id: string;
      tracking_url: string | null;
      shipped_at: string;
    } | null;
  };

  return {
    ok: true,
    order: {
      orderNumber: raw.order_number,
      status: raw.status,
      placedAt: raw.placed_at,
      customerName: raw.customer_name,
      subtotalPaise: raw.subtotal_paise,
      discountPaise: raw.discount_paise,
      shippingPaise: raw.shipping_paise,
      totalPaise: raw.total_paise,
      items: (raw.items ?? []).map((i) => ({
        productName: i.product_name,
        variantName: i.variant_name,
        quantity: i.quantity,
        pricePaise: i.price_paise,
        subtotalPaise: i.subtotal_paise,
      })),
      shippingAddress: raw.shipping_address
        ? {
            name: raw.shipping_address.name,
            address: raw.shipping_address.address,
            city: raw.shipping_address.city,
            state: raw.shipping_address.state,
            postalCode: raw.shipping_address.postal_code,
            country: raw.shipping_address.country,
          }
        : null,
      shipment: raw.shipment
        ? {
            courierName: raw.shipment.courier_name,
            trackingId: raw.shipment.tracking_id,
            trackingUrl: raw.shipment.tracking_url,
            shippedAt: raw.shipment.shipped_at,
          }
        : null,
    },
  };
}
