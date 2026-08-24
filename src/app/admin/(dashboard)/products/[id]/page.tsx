import Link from 'next/link';
import { notFound } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/server';
import { imageUrl } from '@/server/catalog';

import { ProductForm, type ProductFormValues } from '../product-form';
import { ImagesEditor, type ImageRow } from './images-editor';
import { VariantsEditor, type VariantRow } from './variants-editor';

export const dynamic = 'force-dynamic';

export default async function EditProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('products')
    .select(
      `id, name, slug, short_description, description, ingredients, benefits,
       usage_instructions, seo_title, seo_description, is_active, is_featured, sort_order,
       product_variants ( id, variant_name, quantity_value, quantity_unit, mrp_paise,
                          selling_price_paise, sku, stock, is_active, sort_order ),
       product_images ( id, storage_path, alt_text, is_primary, sort_order )`,
    )
    .eq('id', id)
    .maybeSingle();

  if (error || !data) notFound();

  const product = data as unknown as {
    id: string;
    name: string;
    slug: string;
    short_description: string | null;
    description: string | null;
    ingredients: string[];
    benefits: string[];
    usage_instructions: string | null;
    seo_title: string | null;
    seo_description: string | null;
    is_active: boolean;
    is_featured: boolean;
    sort_order: number;
    product_variants: VariantRow[];
    product_images: Omit<ImageRow, 'url'>[];
  };

  const initial: ProductFormValues = {
    id: product.id,
    name: product.name,
    slug: product.slug,
    shortDescription: product.short_description ?? '',
    description: product.description ?? '',
    ingredients: product.ingredients ?? [],
    benefits: product.benefits ?? [],
    usageInstructions: product.usage_instructions ?? '',
    seoTitle: product.seo_title ?? '',
    seoDescription: product.seo_description ?? '',
    isActive: product.is_active,
    isFeatured: product.is_featured,
    sortOrder: product.sort_order,
  };

  const variants = [...product.product_variants].sort((a, b) => a.sort_order - b.sort_order);

  const images: ImageRow[] = [...product.product_images]
    .sort((a, b) => Number(b.is_primary) - Number(a.is_primary) || a.sort_order - b.sort_order)
    .map((img) => ({ ...img, url: imageUrl(img.storage_path) }));

  const sellable = variants.some((v) => v.is_active);

  return (
    <div className="mx-auto max-w-4xl">
      <nav aria-label="Breadcrumb" className="mb-6 text-sm">
        <Link href="/admin/products" className="text-stone-500 hover:text-green-800 hover:underline">
          ← Products
        </Link>
      </nav>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-earth-900">{product.name}</h1>
          <p className="mt-1 text-sm text-stone-500">/products/{product.slug}</p>
        </div>

        {product.is_active ? (
          <Button asChild variant="outline" size="sm">
            <Link href={`/products/${product.slug}`} target="_blank" rel="noopener noreferrer">
              View in store
            </Link>
          </Button>
        ) : null}
      </div>

      {/*
        A published product with no sellable variant renders a card with no
        price and no way to buy. Flagging it here is cheaper than a customer
        finding it.
      */}
      {product.is_active && !sellable ? (
        <p
          role="alert"
          className="mt-6 rounded-xl border border-gold-400/60 bg-[--color-warning-surface] px-4 py-3 text-sm text-[--color-warning]"
        >
          <strong className="font-semibold">This product is published but has no
          available size.</strong>{' '}
          Customers cannot buy it. Add a size below, or unpublish it.
        </p>
      ) : null}

      <div className="mt-8 space-y-8">
        <VariantsEditor productId={product.id} variants={variants} />
        <ImagesEditor productId={product.id} images={images} productName={product.name} />
        <ProductForm initial={initial} />
      </div>
    </div>
  );
}
