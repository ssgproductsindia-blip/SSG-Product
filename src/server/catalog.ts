import 'server-only';

import { cache } from 'react';

import { publicEnv } from '@/lib/env';
import { createClient } from '@/lib/supabase/server';
import type { ProductImageRow, ProductVariantRow, StoreSettingsRow } from '@/lib/database.types';

/**
 * Storefront catalogue reads.
 *
 * These go through the RLS-bound client, not the service client. That is a
 * deliberate choice: it means the public pages are exercising the same
 * policies an anonymous visitor would hit, so a policy that accidentally
 * exposes an unpublished product shows up as a bug in development rather than
 * as a leak in production.
 *
 * Wrapped in React's `cache()` so a page that needs settings in both the
 * header and the footer issues one query, not two.
 */

export type CatalogVariant = Pick<
  ProductVariantRow,
  | 'id'
  | 'variant_name'
  | 'quantity_value'
  | 'quantity_unit'
  | 'mrp_paise'
  | 'selling_price_paise'
  | 'sku'
  | 'stock'
  | 'sort_order'
>;

export type CatalogImage = Pick<
  ProductImageRow,
  'id' | 'storage_path' | 'alt_text' | 'sort_order' | 'is_primary' | 'width' | 'height'
> & { url: string };

export type CatalogProduct = {
  id: string;
  name: string;
  slug: string;
  shortDescription: string | null;
  description: string | null;
  ingredients: string[];
  benefits: string[];
  usageInstructions: string | null;
  /** Label facts as a key/value map — shelf life, directions, and so on. */
  specifications: Record<string, string>;
  seoTitle: string | null;
  seoDescription: string | null;
  isFeatured: boolean;
  variants: CatalogVariant[];
  images: CatalogImage[];
  /** Cheapest purchasable variant, used for "From ₹199" on cards. */
  leadVariant: CatalogVariant | null;
};

/** Turns a storage path into a public CDN URL. */
export function imageUrl(storagePath: string): string {
  if (/^https?:\/\//.test(storagePath)) return storagePath;
  const base = publicEnv.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, '');
  const clean = storagePath.replace(/^\//, '');
  return `${base}/storage/v1/object/public/product-images/${clean}`;
}

type RawProduct = {
  id: string;
  name: string;
  slug: string;
  short_description: string | null;
  description: string | null;
  ingredients: string[];
  benefits: string[];
  usage_instructions: string | null;
  specifications: Record<string, string> | null;
  seo_title: string | null;
  seo_description: string | null;
  is_featured: boolean;
  sort_order: number;
  product_variants: (CatalogVariant & { is_active: boolean })[];
  product_images: Omit<CatalogImage, 'url'>[];
};

const SELECT = `
  id, name, slug, short_description, description, ingredients, benefits,
  usage_instructions, specifications, seo_title, seo_description, is_featured, sort_order,
  product_variants ( id, variant_name, quantity_value, quantity_unit,
                     mrp_paise, selling_price_paise, sku, stock, sort_order, is_active ),
  product_images ( id, storage_path, alt_text, sort_order, is_primary, width, height )
`;

function shape(raw: RawProduct): CatalogProduct {
  // RLS already filters inactive variants, but the flag is selected and
  // re-checked here so a future policy change cannot silently start listing
  // unpublished variants on the storefront.
  const variants = raw.product_variants
    .filter((v) => v.is_active)
    .sort((a, b) => a.sort_order - b.sort_order)
    .map(({ is_active: _ignored, ...v }) => v);

  const images = raw.product_images
    .sort((a, b) => Number(b.is_primary) - Number(a.is_primary) || a.sort_order - b.sort_order)
    .map((img) => ({ ...img, url: imageUrl(img.storage_path) }));

  // "From" price means the cheapest thing a customer can actually buy, so
  // out-of-stock variants are excluded — quoting a price for something
  // unbuyable is how a card promises ₹199 and the page delivers ₹430.
  const purchasable = variants.filter((v) => v.stock === null || v.stock > 0);
  const leadVariant =
    (purchasable.length > 0 ? purchasable : variants)
      .slice()
      .sort((a, b) => a.selling_price_paise - b.selling_price_paise)[0] ?? null;

  return {
    id: raw.id,
    name: raw.name,
    slug: raw.slug,
    shortDescription: raw.short_description,
    description: raw.description,
    ingredients: raw.ingredients ?? [],
    benefits: raw.benefits ?? [],
    usageInstructions: raw.usage_instructions,
    specifications: raw.specifications ?? {},
    seoTitle: raw.seo_title,
    seoDescription: raw.seo_description,
    isFeatured: raw.is_featured,
    variants,
    images,
    leadVariant,
  };
}

export const listProducts = cache(async (): Promise<CatalogProduct[]> => {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('products')
    .select(SELECT)
    .order('sort_order', { ascending: true });

  if (error) throw new Error(`Could not load products: ${error.message}`);

  return (data as unknown as RawProduct[])
    .map(shape)
    // A product with no purchasable variant has no price to show and no way
    // to be bought, so it is not listed at all.
    .filter((p) => p.variants.length > 0);
});

export const getProductBySlug = cache(
  async (slug: string): Promise<CatalogProduct | null> => {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from('products')
      .select(SELECT)
      .eq('slug', slug)
      .maybeSingle();

    if (error) throw new Error(`Could not load product: ${error.message}`);
    if (!data) return null;

    const product = shape(data as unknown as RawProduct);
    return product.variants.length > 0 ? product : null;
  },
);

/**
 * Store settings.
 *
 * Never throws. These values decorate the footer and contact page; if they
 * cannot be read, the right outcome is a footer without a WhatsApp button,
 * not a 500 on every route in the site.
 */
export const getStoreSettings = cache(async (): Promise<StoreSettingsRow | null> => {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from('store_settings')
      .select('*')
      .eq('id', true)
      .maybeSingle();

    return (data as StoreSettingsRow | null) ?? null;
  } catch {
    return null;
  }
});
