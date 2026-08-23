/**
 * Money handling for SSG Products.
 *
 * Every amount in this codebase is an integer number of paise. ₹389 is 38900.
 * There are no floating-point rupee values anywhere — not in the database, not
 * in props, not in the cart. `0.1 + 0.2 !== 0.3` is not a curiosity to work
 * around with rounding helpers; it is a reason never to let a rupee amount
 * become a float in the first place.
 *
 * Conversion to a human-readable string happens here and nowhere else.
 */

/** A whole number of paise. Nominal type to make accidental rupee values loud. */
export type Paise = number;

const RUPEE = '₹';

/**
 * Formats paise as an Indian-locale rupee string: 38900 -> "₹389".
 *
 * Whole rupees are rendered without decimals, because that is how prices are
 * written on Indian packaging and in every price the brief supplied. Amounts
 * with a paise remainder keep two decimals so nothing is silently hidden.
 */
export function formatPaise(paise: Paise): string {
  if (!Number.isFinite(paise)) return `${RUPEE}0`;

  const negative = paise < 0;
  const abs = Math.abs(Math.round(paise));
  const rupees = Math.floor(abs / 100);
  const remainder = abs % 100;

  const formatted = new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: remainder === 0 ? 0 : 2,
    maximumFractionDigits: remainder === 0 ? 0 : 2,
  }).format(remainder === 0 ? rupees : abs / 100);

  return `${negative ? '-' : ''}${RUPEE}${formatted}`;
}

/** Rupees to paise, for admin forms. Returns null for anything unusable. */
export function rupeesToPaise(input: string | number): Paise | null {
  const raw = typeof input === 'number' ? String(input) : input.trim();
  if (raw === '') return null;

  // Accept "1,299.50", "₹1299", "1299" — reject anything else outright rather
  // than letting Number() coerce a typo into a plausible-looking price.
  const cleaned = raw.replace(/[₹,\s]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;

  const value = Number(cleaned);
  if (!Number.isFinite(value)) return null;

  // Round rather than truncate: 12.999 would otherwise become ₹12.99.
  return Math.round(value * 100);
}

/** Paise to a plain rupee string for populating admin form inputs. */
export function paiseToRupeeInput(paise: Paise): string {
  const abs = Math.abs(paise);
  return abs % 100 === 0 ? String(abs / 100) : (abs / 100).toFixed(2);
}

/**
 * Discount percentage, computed — never stored.
 *
 * Brief §25: round to the nearest whole number. The supplied figures check out
 * against this: 200g is (24000-19900)/24000 = 17.08% -> 17%, 500g is 28.33% ->
 * 28%, and 1 KG is 20.63% -> 21%.
 *
 * Returns 0 when there is no saving, so callers can treat 0 as "show no badge"
 * without also having to handle null.
 */
export function discountPercent(mrpPaise: Paise, sellingPaise: Paise): number {
  if (!Number.isFinite(mrpPaise) || !Number.isFinite(sellingPaise)) return 0;
  if (mrpPaise <= 0 || sellingPaise >= mrpPaise) return 0;
  return Math.round(((mrpPaise - sellingPaise) / mrpPaise) * 100);
}

/** Absolute saving in paise. */
export function savingsPaise(mrpPaise: Paise, sellingPaise: Paise): Paise {
  return Math.max(0, mrpPaise - sellingPaise);
}

/** True when the price is genuinely below MRP and worth surfacing a badge for. */
export function hasDiscount(mrpPaise: Paise, sellingPaise: Paise): boolean {
  return discountPercent(mrpPaise, sellingPaise) > 0;
}
