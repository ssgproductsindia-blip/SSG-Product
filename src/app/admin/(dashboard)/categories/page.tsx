import { createClient } from '@/lib/supabase/server';

import { CategoriesEditor, type CategoryRow } from './categories-editor';

export const dynamic = 'force-dynamic';

/**
 * Category management (brief §51).
 *
 * Reads through the RLS-bound client, and deliberately does NOT filter on
 * is_active — the public storefront policy already hides inactive categories
 * from anon, but the admin managing them needs to see archived ones too, or
 * "restore" would have nothing to restore.
 */
export default async function AdminCategoriesPage() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('categories')
    .select('id, name, slug, description, sort_order, is_active')
    .order('sort_order', { ascending: true });

  const categories = (data ?? []) as CategoryRow[];

  return (
    <div className="max-w-3xl">
      <h1 className="font-display text-2xl font-semibold text-earth-900">Categories</h1>
      <p className="mt-2 text-sm text-stone-500">
        Organise products into categories. A product does not need one —
        this is optional structure, not a requirement to publish.
      </p>

      {error ? (
        <p
          role="alert"
          className="mt-6 rounded-xl border border-[--color-danger]/25 bg-[--color-danger-surface] p-5 text-sm text-[--color-danger]"
        >
          Unable to load categories: {error.message}
        </p>
      ) : (
        <div className="mt-6">
          <CategoriesEditor categories={categories} />
        </div>
      )}
    </div>
  );
}
