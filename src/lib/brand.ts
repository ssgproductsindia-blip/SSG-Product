/**
 * Fixed brand facts, transcribed from the SSG packaging and artwork.
 *
 * Only what actually appears on the physical product lives here. Anything
 * changeable by the owner (WhatsApp number, Instagram, store email, address)
 * belongs in `store_settings` in the database, not in this file — those are
 * settings, not identity.
 *
 * Nothing in here may be embellished. "Be Young and Live Happy" is the pouch
 * tagline verbatim; it is not a claim about outcomes and must not be reworded
 * into one.
 */

export const BRAND = {
  name: 'SSG Products',

  /** Printed beneath the logo on the pouch label. */
  tagline: 'Be Young and Live Happy',

  /** The logo lockup's own sub-line, seen on the later packaging revision. */
  logoTagline: 'Organic Is Our Religion',

  /** The circular badge at the top-left of the label. */
  naturalBadge: '100% Natural',
} as const;

/**
 * Logo asset path.
 *
 * The SSG logo — the tree with exposed roots — is an existing brand asset and
 * must not be redrawn (brief §6). This points at the real file; until it is
 * placed there, `<Logo>` falls back to a plain typographic wordmark.
 *
 * A wordmark is the honest fallback: it is the *absence* of the logo, not an
 * approximation of it. Drawing a lookalike tree in SVG would be exactly the
 * "generic AI logo" the brief rules out, and would ship a subtly wrong mark
 * that nobody would notice until it was on packaging.
 *
 * To install the real logo, save a transparent PNG or SVG to:
 *     public/brand/ssg-logo.png
 */
export const LOGO_SRC = '/brand/ssg-logo.png';

/** Builds a wa.me deep link from a stored phone number. */
export function whatsappUrl(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 10) return null;
  // wa.me wants the country code with no plus. Assume +91 when a bare
  // 10-digit Indian mobile is stored.
  const withCountry = digits.length === 10 ? `91${digits}` : digits;
  return `https://wa.me/${withCountry}`;
}

/** Formats a stored phone number for display: +91 81489 93990 */
export function formatPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  const local = digits.length > 10 ? digits.slice(-10) : digits;
  if (local.length !== 10) return phone;
  return `+91 ${local.slice(0, 5)} ${local.slice(5)}`;
}
