'use server';

import { headers } from 'next/headers';

import { publicEnv } from '@/lib/env';
import { clientKey, rateLimit } from '@/lib/rate-limit';
import { checkoutSchema } from '@/lib/validation';
import { orderConfirmationEmail } from '@/lib/email/templates';
import { sendOrderEmail } from '@/lib/email/send';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';

/**
 * Place an order.
 *
 * The whole money path is one database call. `create_order` validates
 * availability, re-reads every price, decrements stock, and writes the order,
 * items, snapshots and address inside one transaction with the variant rows
 * locked. Nothing this function receives from the browser influences a price —
 * the payload carries variant ids and quantities only.
 *
 * The confirmation email is deliberately sent AFTER the transaction commits,
 * and is deliberately not allowed to fail the order. An order that exists but
 * whose email bounced is a support task; an order rolled back because the mail
 * provider hiccuped is lost revenue and a customer who believes they bought
 * something.
 */

export type PlaceOrderResult =
  | {
      ok: true;
      orderNumber: string;
      /** True when the confirmation email actually went out. */
      emailSent: boolean;
      /** True when the order was linked to a signed-in customer account. */
      authenticated: boolean;
    }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

/** Maps a Postgres exception from create_order to customer-facing wording. */
function describeOrderError(message: string): string {
  if (message.includes('EMPTY_CART')) return 'Your cart is empty.';
  if (message.includes('TOO_MANY_ITEMS')) return 'That is too many different items for one order.';
  if (message.includes('INVALID_QUANTITY')) return 'One of the quantities is not valid.';

  if (message.includes('VARIANT_NOT_FOUND')) {
    return 'One of the items in your cart is no longer available. Please review your cart.';
  }

  if (message.includes('VARIANT_UNAVAILABLE:')) {
    const name = message.split('VARIANT_UNAVAILABLE:')[1]?.trim();
    return name
      ? `${name} is no longer available. Please remove it from your cart.`
      : 'An item in your cart is no longer available.';
  }

  if (message.includes('INSUFFICIENT_STOCK:')) {
    const name = message.split('INSUFFICIENT_STOCK:')[1]?.trim();
    return name
      ? `We do not have enough stock of ${name} to fill this order.`
      : 'We do not have enough stock to fill this order.';
  }

  // Anything unrecognised: never leak raw Postgres text to the customer.
  return 'We could not place your order. Please try again in a moment.';
}

export async function placeOrderAction(input: unknown): Promise<PlaceOrderResult> {
  const requestHeaders = await headers();

  // Order creation writes rows and decrements stock, so it is worth limiting
  // even loosely. See the honest caveats in src/lib/rate-limit.ts.
  const limit = rateLimit(clientKey(requestHeaders, 'checkout'), {
    limit: 10,
    windowMs: 10 * 60 * 1000,
  });

  if (!limit.allowed) {
    return {
      ok: false,
      error: `Too many attempts. Please wait ${limit.retryAfter} seconds and try again.`,
    };
  }

  const parsed = checkoutSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const path = issue.path.join('.');
      if (path && !fieldErrors[path]) fieldErrors[path] = issue.message;
    }
    return { ok: false, error: 'Please check the highlighted fields.', fieldErrors };
  }

  const { customer, shipping, items, notes } = parsed.data;

  // Resolve the buyer's identity from their own session cookie, never from
  // anything the client submitted in the payload. This is what makes
  // "associate the order with the authenticated customer" (brief §19) safe:
  // there is no field in the request a browser could edit to claim someone
  // else's account, because the id never travels through the request body.
  const sessionClient = await createClient();
  const {
    data: { user: sessionUser },
  } = await sessionClient.auth.getUser();

  const supabase = createServiceClient();

  const { data, error } = await supabase.rpc('create_order', {
    p_customer: { name: customer.name, email: customer.email, phone: customer.phone },
    p_shipping: {
      address: shipping.address,
      city: shipping.city,
      state: shipping.state,
      postal_code: shipping.postalCode,
      country: shipping.country,
    },
    p_items: items.map((i) => ({ variant_id: i.variantId, quantity: i.quantity })),
    p_notes: notes ?? null,
    p_auth_user_id: sessionUser?.id ?? null,
  } as never);

  if (error) {
    return { ok: false, error: describeOrderError(error.message) };
  }

  const result = data as unknown as {
    order_id: string;
    order_number: string;
    subtotal_paise: number;
    discount_paise: number;
    shipping_paise: number;
    total_paise: number;
  };

  // ---- Confirmation email -------------------------------------------------
  // Past the point of no return: the order exists. Any failure below is
  // reported, never allowed to imply the order did not happen.
  let emailSent = false;

  try {
    const { data: itemRows } = await supabase
      .from('order_items')
      .select(
        'product_name_snapshot, variant_name_snapshot, quantity, selling_price_paise_snapshot, subtotal_paise',
      )
      .eq('order_id', result.order_id);

    const email = orderConfirmationEmail({
      orderNumber: result.order_number,
      customerName: customer.name,
      items: (itemRows ?? []).map((row) => ({
        productName: row.product_name_snapshot,
        variantName: row.variant_name_snapshot,
        quantity: row.quantity,
        sellingPricePaise: row.selling_price_paise_snapshot,
        subtotalPaise: row.subtotal_paise,
      })),
      subtotalPaise: result.subtotal_paise,
      discountPaise: result.discount_paise,
      shippingPaise: result.shipping_paise,
      totalPaise: result.total_paise,
      shippingAddress: {
        address: shipping.address,
        city: shipping.city,
        state: shipping.state,
        postalCode: shipping.postalCode,
        country: shipping.country,
      },
      trackUrl: `${publicEnv.NEXT_PUBLIC_SITE_URL}/track-order?order=${encodeURIComponent(
        result.order_number,
      )}`,
    });

    const outcome = await sendOrderEmail({
      orderId: result.order_id,
      type: 'order_confirmation',
      to: customer.email,
      subject: email.subject,
      html: email.html,
      text: email.text,
    });

    emailSent = outcome.status === 'sent' || outcome.status === 'duplicate';
  } catch {
    // Swallowed on purpose — the order is already committed. The customer is
    // told on the confirmation screen that the email did not go out.
    emailSent = false;
  }

  return {
    ok: true,
    orderNumber: result.order_number,
    emailSent,
    authenticated: Boolean(sessionUser),
  };
}
