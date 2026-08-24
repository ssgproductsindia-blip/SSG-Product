import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { OrderStatus } from '@/lib/database.types';
import type { OrderDetailData } from '@/components/order/order-detail-card';

/**
 * Order queries for the signed-in customer's own account.
 *
 * Reads go through the RLS-bound client under the caller's own session, so
 * `orders_owner_select` (0005_customer_accounts.sql) is the real boundary —
 * it only ever returns rows where `auth_user_id` matches the caller. The
 * `.eq('auth_user_id', customerId)` filters added here are defense in depth,
 * not the actual security control: if the RLS policy were ever wrong, a
 * customer would still only ever be asking for rows scoped to themselves,
 * because customerId is their own session's id, never a value taken from a
 * URL or client input.
 */

export type OrderSummary = {
  orderNumber: string;
  status: OrderStatus;
  createdAt: string;
  totalPaise: number;
  itemCount: number;
  firstProductName: string;
};

export async function listCustomerOrders(customerId: string): Promise<OrderSummary[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('orders')
    .select('order_number, status, created_at, total_paise, order_items ( product_name_snapshot, quantity )')
    .eq('auth_user_id', customerId)
    .order('created_at', { ascending: false });

  if (error || !data) return [];

  return (
    data as unknown as {
      order_number: string;
      status: OrderStatus;
      created_at: string;
      total_paise: number;
      order_items: { product_name_snapshot: string; quantity: number }[];
    }[]
  ).map((row) => ({
    orderNumber: row.order_number,
    status: row.status,
    createdAt: row.created_at,
    totalPaise: row.total_paise,
    itemCount: row.order_items.reduce((n, i) => n + i.quantity, 0),
    firstProductName: row.order_items[0]?.product_name_snapshot ?? 'Order',
  }));
}

export async function getCustomerOrderDetail(
  customerId: string,
  orderNumber: string,
): Promise<OrderDetailData | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('orders')
    .select(
      `order_number, status, created_at, subtotal_paise, discount_paise, shipping_paise, total_paise,
       order_items ( product_name_snapshot, variant_name_snapshot, quantity, selling_price_paise_snapshot, subtotal_paise ),
       shipping_addresses ( name, address, city, state, postal_code, country ),
       shipments ( courier_name, tracking_id, tracking_url, shipped_at )`,
    )
    .eq('auth_user_id', customerId)
    .eq('order_number', orderNumber.toUpperCase())
    .maybeSingle();

  if (error || !data) return null;

  const raw = data as unknown as {
    order_number: string;
    status: OrderStatus;
    created_at: string;
    subtotal_paise: number;
    discount_paise: number;
    shipping_paise: number;
    total_paise: number;
    order_items: {
      product_name_snapshot: string;
      variant_name_snapshot: string;
      quantity: number;
      selling_price_paise_snapshot: number;
      subtotal_paise: number;
    }[];
    shipping_addresses: {
      name: string;
      address: string;
      city: string;
      state: string;
      postal_code: string;
      country: string;
    } | null;
    shipments: {
      courier_name: string;
      tracking_id: string;
      tracking_url: string | null;
      shipped_at: string;
    } | null;
  };

  return {
    orderNumber: raw.order_number,
    status: raw.status,
    placedAt: raw.created_at,
    subtotalPaise: raw.subtotal_paise,
    discountPaise: raw.discount_paise,
    shippingPaise: raw.shipping_paise,
    totalPaise: raw.total_paise,
    items: raw.order_items.map((i) => ({
      productName: i.product_name_snapshot,
      variantName: i.variant_name_snapshot,
      quantity: i.quantity,
      pricePaise: i.selling_price_paise_snapshot,
      subtotalPaise: i.subtotal_paise,
    })),
    shippingAddress: raw.shipping_addresses
      ? {
          name: raw.shipping_addresses.name,
          address: raw.shipping_addresses.address,
          city: raw.shipping_addresses.city,
          state: raw.shipping_addresses.state,
          postalCode: raw.shipping_addresses.postal_code,
          country: raw.shipping_addresses.country,
        }
      : null,
    shipment: raw.shipments
      ? {
          courierName: raw.shipments.courier_name,
          trackingId: raw.shipments.tracking_id,
          trackingUrl: raw.shipments.tracking_url,
          shippedAt: raw.shipments.shipped_at,
        }
      : null,
  };
}
