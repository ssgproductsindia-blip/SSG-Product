import 'server-only';

import { createHmac, timingSafeEqual } from 'node:crypto';
import Razorpay from 'razorpay';

import { paymentsConfigured, serverEnv } from '@/lib/env';

/**
 * Razorpay integration.
 *
 * Every amount here is already in paise — Razorpay's own API takes amounts
 * in the smallest currency subunit, which is exactly this codebase's storage
 * unit throughout (see src/lib/money.ts). No conversion happens anywhere in
 * this file; a mismatch would be a silent 100x pricing bug, so the absence of
 * any `* 100` or `/ 100` here is deliberate, not an oversight.
 *
 * Signature verification is implemented directly with Node's `crypto` rather
 * than importing razorpay's own `validatePaymentVerification` helper (it
 * lives at an internal `dist/utils/...` path with no export map entry —
 * usable, but not part of the package's public contract, so a minor version
 * bump could relocate it). The algorithm is the one Razorpay itself
 * documents: HMAC-SHA256 of `"{order_id}|{payment_id}"` keyed on the account
 * secret, compared to the signature the client returns after payment.
 * `Razorpay.validateWebhookSignature` IS a genuinely public static method,
 * so the webhook path uses that one directly instead of reimplementing it.
 */

let client: Razorpay | null = null;

function getClient(): Razorpay {
  const env = serverEnv();
  if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) {
    throw new Error('Razorpay is not configured (RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET missing).');
  }
  client ??= new Razorpay({ key_id: env.RAZORPAY_KEY_ID, key_secret: env.RAZORPAY_KEY_SECRET });
  return client;
}

export type CreateRazorpayOrderResult =
  | { ok: true; razorpayOrderId: string; amountPaise: number }
  | { ok: false; error: string };

/**
 * Creates a Razorpay order for a server-computed amount.
 *
 * This is called AFTER the cart has already been priced from the database
 * (see server/pricing.ts) — the amount passed in here is never a number the
 * browser supplied, it is what the server itself just calculated. Razorpay's
 * own order amount then becomes a second, independent record of that same
 * figure, which is what the signature verification step below is actually
 * checking the customer paid.
 */
export async function createRazorpayOrder(
  amountPaise: number,
  receipt: string,
): Promise<CreateRazorpayOrderResult> {
  if (!paymentsConfigured()) {
    return { ok: false, error: 'Payments are not configured.' };
  }
  if (!Number.isInteger(amountPaise) || amountPaise <= 0) {
    return { ok: false, error: 'Invalid order amount.' };
  }

  try {
    const order = await getClient().orders.create({
      amount: amountPaise,
      currency: 'INR',
      receipt,
      // Capture is left to the account's dashboard-level default rather than
      // forced here, so changing it never requires a code deploy.
    });
    return { ok: true, razorpayOrderId: order.id, amountPaise: Number(order.amount) };
  } catch (cause) {
    return {
      ok: false,
      error: cause instanceof Error ? cause.message : 'Could not start payment.',
    };
  }
}

/**
 * Verifies the signature Razorpay's Checkout widget returns after a
 * successful payment.
 *
 * This is the entire trust boundary for "was this actually paid": anyone can
 * POST a fake `razorpay_payment_id` to a server action, but nobody without
 * the account's key secret can produce a signature that verifies against it.
 * An order is only ever marked paid downstream of this function returning
 * true.
 */
export function verifyPaymentSignature(args: {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
}): boolean {
  const env = serverEnv();
  if (!env.RAZORPAY_KEY_SECRET) return false;

  const expected = createHmac('sha256', env.RAZORPAY_KEY_SECRET)
    .update(`${args.razorpayOrderId}|${args.razorpayPaymentId}`)
    .digest('hex');

  const expectedBuf = Buffer.from(expected, 'hex');
  const actualBuf = Buffer.from(args.razorpaySignature, 'hex');

  // Constant-time comparison — a signature check that returns early on the
  // first mismatched byte leaks timing information an attacker can use to
  // forge a valid one byte at a time. Buffers of different lengths would
  // throw in timingSafeEqual, so that case is rejected explicitly first.
  if (expectedBuf.length !== actualBuf.length) return false;
  return timingSafeEqual(expectedBuf, actualBuf);
}

/**
 * Verifies an incoming webhook request against the webhook secret configured
 * separately in the Razorpay dashboard (Settings → Webhooks) — a different
 * secret from the account's API key secret. Must be called with the raw,
 * unparsed request body: re-serializing a parsed JSON object can reorder or
 * reformat it in ways that change the bytes being signed, which would make a
 * genuine webhook fail verification.
 */
export function verifyWebhookSignature(rawBody: string, signature: string | null): boolean {
  const env = serverEnv();
  if (!signature || !env.RAZORPAY_WEBHOOK_SECRET) return false;
  return Razorpay.validateWebhookSignature(rawBody, signature, env.RAZORPAY_WEBHOOK_SECRET);
}

/**
 * Reads back the amount actually associated with a Razorpay order, straight
 * from Razorpay's own servers rather than trusting a number carried through
 * the checkout flow in a request body. Used as a second, independent check
 * that what the customer paid still matches what `create_order` computes —
 * the signature alone proves the payment belongs to that order id, not that
 * nothing about the cart's pricing changed in the seconds since it was
 * created (a concurrent admin price edit, most plausibly).
 */
export async function fetchRazorpayOrderAmount(razorpayOrderId: string): Promise<number | null> {
  try {
    const order = await getClient().orders.fetch(razorpayOrderId);
    return Number(order.amount);
  } catch {
    return null;
  }
}
