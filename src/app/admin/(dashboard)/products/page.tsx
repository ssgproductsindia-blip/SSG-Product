import Link from 'next/link';
import { Plus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { discountPercent, formatPaise } from '@/lib/money';
import { createClient } from '@/lib/supabase/server';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

type Row = {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
  is_featured: boolean;
  sort_order: number;
  product_variants: {
    id: string;
    variant_name: string;
    mrp_paise: number;
    selling_price_paise: number;
    stock: number | null;
    is_active: boolean;
  }[];
  product_images: { id: string }[];
};

export default async function AdminProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  const params = await searchParams;
  const query = (params.q ?? '').trim();
  const status = params.status ?? 'all';

  const supabase = await createClient();

  let request = supabase
    .from('products')
    .select(
      `id, name, slug, is_active, is_featured, sort_order,
       product_variants ( id, variant_name, mrp_paise, selling_price_paise, stock, is_active ),
       product_images ( id )`,
    )
    .order('sort_order', { ascending: true });

  if (query) {
    // Escape the PostgREST wildcards so a search for "50%" does not become a
    // pattern that matches everything.
    const safe = query.replace(/[%_,()]/g, '');
    if (safe) request = request.or(`name.ilike.%${safe}%,slug.ilike.%${safe}%`);
  }
  if (status === 'published') request = request.eq('is_active', true);
  if (status === 'hidden') request = request.eq('is_active', false);

  const { data, error } = await request;
  const products = (data ?? []) as unknown as Row[];

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-display text-2xl font-semibold text-earth-900">Products</h1>
        <Button asChild>
          <Link href="/admin/products/new">
            <Plus className="size-4" aria-hidden />
            Add product
          </Link>
        </Button>
      </div>

      {/* A GET form, so searches are linkable and the back button works. */}
      <form method="get" className="mt-6 flex flex-wrap gap-3">
        <div className="min-w-48 flex-1">
          <label htmlFor="q" className="sr-only">
            Search products
          </label>
          <input
            id="q"
            name="q"
            defaultValue={query}
            placeholder="Search by name or slug"
            className="w-full rounded-lg border border-line bg-white px-3 py-2.5 text-sm focus:border-green-600"
          />
        </div>
        <div>
          <label htmlFor="status" className="sr-only">
            Filter by status
          </label>
          <select
            id="status"
            name="status"
            defaultValue={status}
            className="rounded-lg border border-line bg-white px-3 py-2.5 text-sm focus:border-green-600"
          >
            <option value="all">All</option>
            <option value="published">Published</option>
            <option value="hidden">Hidden</option>
          </select>
        </div>
        <Button type="submit" variant="subtle">
          Filter
        </Button>
      </form>

      {error ? (
        <p role="alert" className="mt-6 rounded-xl border border-[--color-danger]/25 bg-[--color-danger-surface] p-5 text-sm text-[--color-danger]">
          Unable to load products: {error.message}
        </p>
      ) : products.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-line bg-white p-10 text-center">
          <p className="font-display text-lg font-semibold text-earth-900">
            {query || status !== 'all' ? 'No products match that filter.' : 'No products yet.'}
          </p>
          {!query && status === 'all' ? (
            <Button asChild className="mt-6">
              <Link href="/admin/products/new">Add your first product</Link>
            </Button>
          ) : null}
        </div>
      ) : (
        <ul className="mt-6 space-y-3">
          {products.map((product) => {
            const active = product.product_variants.filter((v) => v.is_active);
            const prices = active.map((v) => v.selling_price_paise);
            const low = prices.length ? Math.min(...prices) : null;
            const high = prices.length ? Math.max(...prices) : null;
            const outOfStock = active.filter((v) => v.stock !== null && v.stock <= 0).length;

            return (
              <li key={product.id}>
                <Link
                  href={`/admin/products/${product.id}`}
                  className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-2xl border border-line bg-white p-4 transition-colors hover:border-green-300"
                >
                  <div className="min-w-48 flex-1">
                    <p className="font-medium text-earth-900">{product.name}</p>
                    <p className="text-xs text-stone-500">/{product.slug}</p>
                  </div>

                  <div className="text-sm tabular-nums text-stone-700">
                    {low === null ? (
                      <span className="text-[--color-danger]">No variants</span>
                    ) : low === high ? (
                      formatPaise(low)
                    ) : (
                      `${formatPaise(low)} – ${formatPaise(high!)}`
                    )}
                  </div>

                  <div className="text-sm text-stone-500">
                    {active.length} variant{active.length === 1 ? '' : 's'}
                  </div>

                  <div className="text-sm text-stone-500">
                    {product.product_images.length === 0 ? (
                      <span className="text-[--color-warning]">No images</span>
                    ) : (
                      `${product.product_images.length} image${product.product_images.length === 1 ? '' : 's'}`
                    )}
                  </div>

                  {outOfStock > 0 ? (
                    <span className="rounded-full bg-[--color-danger-surface] px-2.5 py-1 text-xs font-medium text-[--color-danger]">
                      {outOfStock} out of stock
                    </span>
                  ) : null}

                  <span
                    className={cn(
                      'rounded-full px-2.5 py-1 text-xs font-medium',
                      product.is_active
                        ? 'bg-green-100 text-green-800'
                        : 'bg-stone-100 text-stone-600',
                    )}
                  >
                    {product.is_active ? 'Published' : 'Hidden'}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {products.length > 0 ? (
        <p className="mt-6 text-xs text-stone-500">
          Discounts shown on the store are calculated from MRP and selling price —{' '}
          {products[0].product_variants[0]
            ? `e.g. ${formatPaise(products[0].product_variants[0].mrp_paise)} → ${formatPaise(
                products[0].product_variants[0].selling_price_paise,
              )} shows as ${discountPercent(
                products[0].product_variants[0].mrp_paise,
                products[0].product_variants[0].selling_price_paise,
              )}% off.`
            : 'there is no separate discount field to keep in sync.'}
        </p>
      ) : null}
    </div>
  );
}
