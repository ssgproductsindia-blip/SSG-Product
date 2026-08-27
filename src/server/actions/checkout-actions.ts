'use server';

import { headers } from 'next/headers';

import { paymentsConfigured, publicEnv } from '@/lib/env';
import { clientKey, rateLimit } from '@/lib/rate-limit';
import {
  createRazorpayOrder,
  fetchRazorpayOrderAmount,
  verifyPaymentSignature,
} from '@/lib/payments/razorpay';
import { cartSchema, checkoutSchema } from '@/lib/validation';
import { orderConfirmationEmail } from '@/lib/email/templates';
import { sendOrderEmail } from '@/lib/email/send';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { priceCart } from '@/server/pricing';

/**
 * Place an order.
 *
 * The whole money path is one database call. `create_order` validates
 * availability, re-reads every price, decrements stock, and writes the order,
 * items, snapshots and address inside one transaction with the variant rows
 * locked. Nothing this function receives from the browser influences a price —
 * the payload carries variant ids and quantities only.
 *
 * When Razorpay is configured, this function additionally REQUIRES a verified
 * payment before it will call create_order at all (see the `payment` branch
 * below) — an abandoned or failed checkout never creates an order, never
 * touches stock, and leaves nothing to clean up. When Razorpay is not
 * configured, behaviour is exactly what it was before payments existed:
 * order is created immediately, payment_status stays 'pending'.
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

// ---------------------------------------------------------------------------
// Step 1 (payments only): create a Razorpay order for the server-priced cart
// ---------------------------------------------------------------------------

export type CreatePaymentOrderResult =
  | { ok: true; razorpayOrderId: string; amountPaise: number; keyId: string }
  | { ok: false; error: string };

/**
 * Called before the Razorpay Checkout widget opens. Prices the cart from the
 * database — never from anything the browser sent — and asks Razorpay to
 * create an order for that exact figure. No SSG order exists yet at this
 * point; that only happens once a payment against this Razorpay order has
 * been verified, in placeOrderAction below.
 *
 * `shippingState` matters now that shipping is tiered (Tamil Nadu vs. rest of
 * India, see src/server/pricing.ts): the customer has already typed their
 * shipping address into the same checkout page by the time this is called, so
 * their state is known here. Pricing the Razorpay order without it would open
 * a payment for the DEFAULT rate even for a Tamil Nadu order, and
 * placeOrderAction's own repricing inside create_order would then compute a
 * different, correct total — surfacing as a spurious "amount mismatch" flag
 * on every single Tamil Nadu order rather than the real signal it is meant
 * to be.
 */
export async function createPaymentOrderAction(
  items: unknown,
  shippingState?: unknown,
): Promise<CreatePaymentOrderResult> {
  if (!paymentsConfigured()) {
    return { ok: false, error: 'Online payment is not enabled.' };
  }

  const requestHeaders = await headers();
  const limit = rateLimit(clientKey(requestHeaders, 'razorpay-order'), {
    limit: 12,
    windowMs: 10 * 60 * 1000,
  });
  if (!limit.allowed) {
    return {
      ok: false,
      error: `Too many attempts. Please wait ${limit.retryAfter} seconds and try again.`,
    };
  }

  const parsedItems = cartSchema.safeParse(items);
  if (!parsedItems.success) {
    return { ok: false, error: parsedItems.error.issues[0]?.message ?? 'Your cart looks invalid.' };
  }

  const state = typeof shippingState === 'string' ? shippingState.trim().slice(0, 120) : null;

  const priced = await priceCart(parsedItems.data, state);
  if (!priced.ok) {
    return {
      ok: false,
      error: priced.issues[0]?.message ?? 'Could not price your cart. Please refresh and try again.',
    };
  }

  const receipt = `cart-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const result = await createRazorpayOrder(priced.totalPaise, receipt);
  if (!result.ok) return { ok: false, error: result.error };

  return {
    ok: true,
    razorpayOrderId: result.razorpayOrderId,
    amountPaise: result.amountPaise,
    // Safe to hand to the client: this is the public key, not the secret —
    // see the note on NEXT_PUBLIC_RAZORPAY_KEY_ID in src/lib/env.ts.
    keyId: publicEnv.NEXT_PUBLIC_RAZORPAY_KEY_ID ?? '',
  };
}

// ---------------------------------------------------------------------------
// Step 2: place the order (guest checkout, or after a verified payment)
// ---------------------------------------------------------------------------

export async function placeOrderAction(input: unknown): Promise<PlaceOrderResult> {
  const requestHeaders = await headers();

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

  const { customer, shipping, items, notes, payment } = parsed.data;
  const paymentsOn = paymentsConfigured();

  // ---- Payment verification, when Razorpay is on -------------------------
  // This is the entire gate. If payments are configured, an order can only
  // ever be created downstream of a signature that verifies — never from a
  // client claiming "I paid", regardless of what the request body says.
  let paymentFields: {
    payment_status: 'paid';
    payment_provider: 'razorpay';
    payment_reference: string;
    razorpay_order_id: string;
  } | null = null;

  if (paymentsOn) {
    if (!payment) {
      return { ok: false, error: 'Payment is required to place this order.' };
    }

    const verified = verifyPaymentSignature({
      razorpayOrderId: payment.razorpayOrderId,
      razorpayPaymentId: payment.razorpayPaymentId,
      razorpaySignature: payment.razorpaySignature,
    });

    if (!verified) {
      return {
        ok: false,
        error:
          'We could not verify your payment. If an amount was deducted, please contact us with your payment reference before trying again.',
      };
    }

    paymentFields = {
      payment_status: 'paid',
      payment_provider: 'razorpay',
      payment_reference: payment.razorpayPaymentId,
      razorpay_order_id: payment.razorpayOrderId,
    };
  }

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
    ...(paymentFields
      ? {
          p_payment_status: paymentFields.payment_status,
          p_payment_provider: paymentFields.payment_provider,
          p_payment_reference: paymentFields.payment_reference,
          p_razorpay_order_id: paymentFields.razorpay_order_id,
        }
      : {}),
  } as never);

  if (error) {
    // The customer already paid and the order still failed to create — this
    // is not an ordinary "out of stock, please retry" failure, it is a
    // captured payment with nothing to show for it. That must never be
    // reported with the same wording as a routine failure, and it must never
    // be allowed to vanish unrecorded: an admin needs to see this and
    // refund or manually fulfil it.
    if (paymentFields) {
      try {
        await supabase.from('admin_audit_logs').insert({
          admin_user_id: null,
          admin_email: null,
          action: 'payment.captured_without_order',
          entity_type: 'razorpay_payment',
          entity_id: paymentFields.payment_reference,
          metadata: {
            razorpay_order_id: paymentFields.razorpay_order_id,
            customer_email: customer.email,
            customer_phone: customer.phone,
            reason: error.message,
          },
        });
      } catch {
        // Even the audit write failing must not hide the underlying problem
        // from the customer — the message below still tells them plainly.
      }

      return {
        ok: false,
        error:
          'Your payment was successful, but we could not complete your order automatically. We have been notified and will contact you shortly — please keep your payment confirmation.',
      };
    }

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

  // ---- Reconciliation: does what was paid match what was charged? --------
  // The signature only proves this payment belongs to that Razorpay order —
  // not that nothing about pricing changed in the seconds between creating
  // the Razorpay order and create_order's own independent repricing (a
  // concurrent admin price edit, most plausibly). The order still stands
  // either way — the customer already paid and denying them the product over
  // a race condition would be worse — but a mismatch is flagged for a human
  // rather than silently ignored.
  if (paymentFields) {
    const paidAmount = await fetchRazorpayOrderAmount(paymentFields.razorpay_order_id);
    if (paidAmount !== null && paidAmount !== result.total_paise) {
      try {
        await supabase.from('admin_audit_logs').insert({
          action: 'payment.amount_mismatch',
          entity_type: 'order',
          entity_id: result.order_id,
          metadata: {
            paid_paise: paidAmount,
            charged_paise: result.total_paise,
            razorpay_payment_id: paymentFields.payment_reference,
          },
        });
      } catch {
        // Non-fatal — the order already exists and is paid; this is purely
        // a bookkeeping flag for later reconciliation.
      }
    }
  }

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
