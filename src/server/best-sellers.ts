import 'server-only';

import { cache } from 'react';

import { createServiceClient } from '@/lib/supabase/service';
import { listProducts, type CatalogProduct } from '@/server/catalog';

/**
 * "Frequently purchased" products, computed from real order history.
 *
 * Deliberately NOT in catalog.ts, whose own docstring commits every read
 * there to the RLS-bound client so a broken policy shows up as a storefront
 * bug rather than a leak. This function has to break that pattern on
 * purpose: `order_items` is customer-private and has no public SELECT
 * policy, so reaching it at all requires the service client — but what
 * leaves this function is only a sum of quantities per product, never a
 * customer name, address, or order number. That aggregate is the entire
 * justification for reaching for the service role here.
 *
 * Aggregated in application code rather than a SQL function: order volume on
 * a store this size is small enough that pulling every order_items row and
 * summing in JS is simpler than adding a migration for it, and cheap enough
 * not to matter. Revisit with a real GROUP BY if the table ever gets large.
 *
 * Returns an empty array when there is not enough order history yet — the
 * caller is expected to hide the section entirely rather than show a
 * "Popular picks" shelf with nothing behind it.
 */
export const getBestSellingProducts = cache(
  async (limit = 4): Promise<CatalogProduct[]> => {
    const supabase = createServiceClient();

    const { data, error } = await supabase
      .from('order_items')
      .select('product_id, quantity')
      .not('product_id', 'is', null);

    if (error || !data || data.length === 0) return [];

    const totals = new Map<string, number>();
    for (const row of data as { product_id: string; quantity: number }[]) {
      totals.set(row.product_id, (totals.get(row.product_id) ?? 0) + row.quantity);
    }

    const ranked = [...totals.entries()].sort((a, b) => b[1] - a[1]);

    // Cross-referenced against the live, RLS-filtered catalogue so a product
    // that has since been unpublished or archived never surfaces here just
    // because it sold once in the past.
    const catalogue = await listProducts();
    const byId = new Map(catalogue.map((p) => [p.id, p]));

    const result: CatalogProduct[] = [];
    for (const [productId] of ranked) {
      const product = byId.get(productId);
      if (product) result.push(product);
      if (result.length >= limit) break;
    }

    return result;
  },
);
