import 'server-only';

import { createServiceClient } from '@/lib/supabase/service';
import type { CartLineInput } from '@/lib/validation';

/**
 * Server-side pricing (brief §48).
 *
 * The contract: the browser sends `{ variantId, quantity }` and nothing more.
 * This module re-reads MRP, selling price, availability and product name from
 * the database and builds the order total from those values. Any price that
 * arrives from the client is not validated against the database — it is never
 * read at all, which is a stronger guarantee than validation, because there is
 * no code path where a client number can reach an order row.
 *
 * How the four money columns relate:
 *
 *   subtotal_paise = Σ selling_price × qty   what the customer actually pays for goods
 *   discount_paise = Σ (mrp − selling) × qty what they saved against MRP (informational)
 *   shipping_paise = from store_settings     0 when unconfigured; may depend on the
 *                                            destination state — see resolveShipping()
 *   total_paise    = subtotal + shipping     the amount due
 *
 * discount_paise is NOT subtracted from the total. It is a record of the saving
 * already baked into the selling price, shown to the customer as "You saved ₹X".
 */

export type PricedLine = {
  variantId: string;
  productId: string;
  productName: string;
  variantName: string;
  sku: string | null;
  mrpPaise: number;
  sellingPricePaise: number;
  quantity: number;
  subtotalPaise: number;
  slug: string;
};

export type PricingIssue = {
  variantId: string;
  /** Human-readable, safe to show the customer verbatim. */
  message: string;
  reason: 'not_found' | 'unavailable' | 'out_of_stock' | 'insufficient_stock';
  /** Present for insufficient_stock so the UI can offer to reduce quantity. */
  availableStock?: number;
};

export type PricingResult =
  | {
      ok: true;
      lines: PricedLine[];
      subtotalPaise: number;
      discountPaise: number;
      shippingPaise: number;
      totalPaise: number;
      shippingConfigured: boolean;
      /** True when a Tamil Nadu-specific rate exists but the destination
       *  state was not supplied — shippingPaise is a provisional default in
       *  that case, not a confirmed charge. See resolveShipping(). */
      shippingStateDependent: boolean;
    }
  | { ok: false; issues: PricingIssue[] };

/**
 * Prices a cart against live database state.
 *
 * Reads through the service client rather than the public one so that an
 * unpublished or deactivated variant is reported as "no longer available"
 * instead of silently vanishing into a "not found" — the customer gets a
 * accurate message about an item they may have had in their cart for days.
 */
export async function priceCart(
  lines: CartLineInput[],
  shippingState?: string | null,
): Promise<PricingResult> {
  if (lines.length === 0) {
    return { ok: false, issues: [] };
  }

  const supabase = createServiceClient();
  const variantIds = lines.map((l) => l.variantId);

  const { data: variants, error } = await supabase
    .from('product_variants')
    .select(
      `id, product_id, variant_name, mrp_paise, selling_price_paise, sku, stock, is_active,
       products ( id, name, slug, is_active )`,
    )
    .in('id', variantIds);

  if (error) {
    throw new Error(`Could not price the cart: ${error.message}`);
  }

  type JoinedVariant = {
    id: string;
    product_id: string;
    variant_name: string;
    mrp_paise: number;
    selling_price_paise: number;
    sku: string | null;
    stock: number | null;
    is_active: boolean;
    products: { id: string; name: string; slug: string; is_active: boolean } | null;
  };

  const byId = new Map<string, JoinedVariant>(
    (variants as unknown as JoinedVariant[]).map((v) => [v.id, v]),
  );

  const issues: PricingIssue[] = [];
  const priced: PricedLine[] = [];

  for (const line of lines) {
    const variant = byId.get(line.variantId);

    if (!variant || !variant.products) {
      issues.push({
        variantId: line.variantId,
        reason: 'not_found',
        message: 'This item is no longer in the catalogue.',
      });
      continue;
    }

    // Either flag being off makes the item unbuyable. Checking the parent
    // product too means unpublishing a product genuinely stops its sales
    // rather than only hiding it from the listing pages.
    if (!variant.is_active || !variant.products.is_active) {
      issues.push({
        variantId: line.variantId,
        reason: 'unavailable',
        message: `${variant.products.name} (${variant.variant_name}) is currently unavailable.`,
      });
      continue;
    }

    // stock === null means the owner is not tracking stock for this variant,
    // so there is no count to check against. See 0001_schema.sql.
    if (variant.stock !== null) {
      if (variant.stock <= 0) {
        issues.push({
          variantId: line.variantId,
          reason: 'out_of_stock',
          message: `${variant.products.name} (${variant.variant_name}) is out of stock.`,
          availableStock: 0,
        });
        continue;
      }
      if (variant.stock < line.quantity) {
        issues.push({
          variantId: line.variantId,
          reason: 'insufficient_stock',
          message: `Only ${variant.stock} left of ${variant.products.name} (${variant.variant_name}).`,
          availableStock: variant.stock,
        });
        continue;
      }
    }

    priced.push({
      variantId: variant.id,
      productId: variant.product_id,
      productName: variant.products.name,
      variantName: variant.variant_name,
      slug: variant.products.slug,
      sku: variant.sku,
      mrpPaise: variant.mrp_paise,
      sellingPricePaise: variant.selling_price_paise,
      quantity: line.quantity,
      subtotalPaise: variant.selling_price_paise * line.quantity,
    });
  }

  if (issues.length > 0) {
    return { ok: false, issues };
  }

  const subtotalPaise = priced.reduce((sum, l) => sum + l.subtotalPaise, 0);
  const discountPaise = priced.reduce(
    (sum, l) => sum + (l.mrpPaise - l.sellingPricePaise) * l.quantity,
    0,
  );

  const shipping = await resolveShipping(subtotalPaise, shippingState ?? null);

  return {
    ok: true,
    lines: priced,
    subtotalPaise,
    discountPaise,
    shippingPaise: shipping.shippingPaise,
    totalPaise: subtotalPaise + shipping.shippingPaise,
    shippingConfigured: shipping.configured,
    shippingStateDependent: shipping.stateDependent,
  };
}

/**
 * True for any reasonable way a customer might type "Tamil Nadu" into a free
 * text field: full name, run together, abbreviated, any casing or spacing.
 * Strips everything but letters before comparing, so this is also exactly
 * what the SQL side of create_order (0010_tiered_shipping.sql) does — the two
 * MUST agree, or the amount priced before payment and the amount create_order
 * actually charges could diverge.
 */
function isTamilNadu(state: string): boolean {
  const normalized = state.toLowerCase().replace(/[^a-z]/g, '');
  return normalized === 'tamilnadu' || normalized === 'tn';
}

/**
 * Shipping cost from store settings.
 *
 * The brief (§74) forbids inventing a shipping cost, so a store with neither
 * rate configured charges nothing and reports `configured: false`.
 *
 * SSG's real policy is two rates, not one — cheaper within Tamil Nadu, more
 * outside it — so a single number is only ever the full story when either
 * (a) only the default rate is set (no tiering), or (b) the caller has
 * supplied a destination state. When tiering is active and the state is not
 * yet known (the cart page, before an address exists), `stateDependent: true`
 * says so: `shippingPaise` in that case is the default/non-Tamil-Nadu rate,
 * offered as a provisional figure, not a confirmed charge — the UI must not
 * present it as settled. See cart-view.tsx's "Calculated at checkout" case.
 */
async function resolveShipping(
  subtotalPaise: number,
  state: string | null,
): Promise<{ shippingPaise: number; configured: boolean; stateDependent: boolean }> {
  const supabase = createServiceClient();

  const { data } = await supabase
    .from('store_settings')
    .select('shipping_flat_paise, shipping_tamil_nadu_paise, free_shipping_threshold_paise')
    .eq('id', true)
    .maybeSingle();

  const defaultRate = data?.shipping_flat_paise ?? null;
  if (defaultRate === null) {
    return { shippingPaise: 0, configured: false, stateDependent: false };
  }

  const tamilNaduRate = data?.shipping_tamil_nadu_paise ?? null;
  const tieringActive = tamilNaduRate !== null;
  const stateKnown = state !== null && state.trim() !== '';

  const rate = tieringActive && stateKnown && isTamilNadu(state) ? tamilNaduRate : defaultRate;

  const threshold = data?.free_shipping_threshold_paise ?? null;
  if (threshold !== null && subtotalPaise >= threshold) {
    // Free is free regardless of destination — no need to flag this as
    // state-dependent even when tiering is active and the state is unknown.
    return { shippingPaise: 0, configured: true, stateDependent: false };
  }

  return {
    shippingPaise: rate,
    configured: true,
    stateDependent: tieringActive && !stateKnown,
  };
}
