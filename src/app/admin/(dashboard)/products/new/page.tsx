import Link from 'next/link';

import { createClient } from '@/lib/supabase/server';

import { ProductForm, type CategoryOption } from '../product-form';

export const dynamic = 'force-dynamic';

export default async function NewProductPage() {
  const supabase = await createClient();

  // All categories, not only active ones — an admin picking a category for a
  // brand-new product has no "currently assigned" category to preserve, but
  // fetching the same way as the edit page keeps this one query shape instead
  // of two slightly different ones to maintain.
  const { data } = await supabase
    .from('categories')
    .select('id, name, is_active')
    .order('sort_order', { ascending: true });

  const categories = (data ?? []) as CategoryOption[];

  return (
    <div className="mx-auto max-w-3xl">
      <nav aria-label="Breadcrumb" className="mb-6 text-sm">
        <Link href="/admin/products" className="text-stone-500 hover:text-green-800 hover:underline">
          ← Products
        </Link>
      </nav>

      <h1 className="font-display text-2xl font-semibold text-earth-900">Add product</h1>
      <p className="mt-2 text-sm text-stone-500">
        Create the product first, then add its sizes and prices. It stays hidden
        from the store until you publish it.
      </p>

      <div className="mt-8">
        <ProductForm categories={categories} />
      </div>
    </div>
  );
}
