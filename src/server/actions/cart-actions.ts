'use server';

import { priceCart, type PricingResult } from '@/server/pricing';
import { cartSchema, type CartLineInput } from '@/lib/validation';

/**
 * Re-price a cart against live database state.
 *
 * Called by the cart page on load and whenever a quantity changes, so the
 * totals a customer sees are the ones the server would charge — not the
 * snapshot sitting in their localStorage from three days ago.
 *
 * This is a display concern. It is NOT what protects the order total: that is
 * `create_order`, which prices the cart again inside the same transaction
 * that writes the row. Two independent pricings, and the customer is only
 * ever charged the second one.
 */
export async function repriceCartAction(
  items: CartLineInput[],
): Promise<PricingResult | { ok: false; issues: []; invalid: string }> {
  const parsed = cartSchema.safeParse(items);

  if (!parsed.success) {
    return {
      ok: false,
      issues: [],
      invalid: parsed.error.issues[0]?.message ?? 'That cart could not be read.',
    };
  }

  try {
    return await priceCart(parsed.data);
  } catch {
    // The caller renders the last known snapshot with a warning rather than an
    // empty cart — losing someone's basket because a query timed out is worse
    // than showing a slightly stale total clearly marked as unverified.
    return {
      ok: false,
      issues: [],
      invalid: 'We could not check prices just now. Please refresh before checking out.',
    };
  }
}
