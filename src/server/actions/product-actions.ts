'use server';

import { revalidatePath } from 'next/cache';

import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { productSchema, variantSchema } from '@/lib/validation';
import { recordAudit, requireAdmin } from '@/server/auth';

/**
 * Admin product management.
 *
 * Every action here begins with requireAdmin(). That is not belt-and-braces
 * over the layout guard — a Server Action is a POST endpoint with a public
 * URL, reachable without ever rendering the page that contains its form. A
 * layout guard protects the page; it does nothing for the action.
 *
 * Writes go through the RLS-bound client wherever possible, so the admin
 * policies are genuinely exercised. The service client appears only for
 * Storage uploads, where the object owner must not be a user who could later
 * be removed.
 *
 * Prices arrive as rupee strings from the form and are converted to integer
 * paise by the schema before they touch the database.
 */

export type ActionResult =
  | { ok: true; message: string; id?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

/** Storefront paths that show product data and must be refreshed after a write. */
function revalidateStorefront(slug?: string | null) {
  revalidatePath('/');
  revalidatePath('/products');
  if (slug) revalidatePath(`/products/${slug}`);
  revalidatePath('/admin/products');
}

/**
 * Flattens Zod issues into `{ 'field.path': 'message' }` for the form.
 *
 * Zod v4 types `path` as PropertyKey[], which admits symbols. Symbol segments
 * cannot address a form field, so they are dropped rather than stringified
 * into something like "Symbol(x)" that would never match an input name.
 */
function fieldErrorsFrom(error: {
  issues: readonly { path: readonly PropertyKey[]; message: string }[];
}) {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path
      .filter((segment): segment is string | number => typeof segment !== 'symbol')
      .join('.');
    if (key && !out[key]) out[key] = issue.message;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------

export async function saveProductAction(
  productId: string | null,
  input: unknown,
): Promise<ActionResult> {
  const admin = await requireAdmin();

  const parsed = productSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Please check the highlighted fields.',
      fieldErrors: fieldErrorsFrom(parsed.error),
    };
  }

  const p = parsed.data;
  const supabase = await createClient();

  const row = {
    name: p.name,
    slug: p.slug,
    category_id: p.categoryId ?? null,
    short_description: p.shortDescription || null,
    description: p.description || null,
    ingredients: p.ingredients,
    benefits: p.benefits,
    usage_instructions: p.usageInstructions || null,
    seo_title: p.seoTitle || null,
    seo_description: p.seoDescription || null,
    is_active: p.isActive,
    is_featured: p.isFeatured,
    sort_order: p.sortOrder,
  };

  if (productId) {
    const { data: before } = await supabase
      .from('products')
      .select('slug, is_active')
      .eq('id', productId)
      .maybeSingle();

    const { error } = await supabase.from('products').update(row).eq('id', productId);
    if (error) return { ok: false, error: describeDbError(error.message) };

    await recordAudit(admin, {
      action: 'product.updated',
      entityType: 'product',
      entityId: productId,
      metadata: { slug: p.slug, published: p.isActive },
    });

    // Revalidate the old slug too, or the previous URL keeps serving a stale
    // page after a rename.
    revalidateStorefront(before?.slug);
    revalidateStorefront(p.slug);

    return { ok: true, message: 'Product saved.', id: productId };
  }

  const { data, error } = await supabase.from('products').insert(row).select('id').single();
  if (error) return { ok: false, error: describeDbError(error.message) };

  await recordAudit(admin, {
    action: 'product.created',
    entityType: 'product',
    entityId: data.id,
    metadata: { slug: p.slug },
  });

  revalidateStorefront(p.slug);
  return { ok: true, message: 'Product created. Add variants next.', id: data.id };
}

/**
 * Archive (unpublish) rather than delete.
 *
 * A product with historical orders must never be deleted: order_items keep
 * name and price snapshots, but the FK would null out and the admin would lose
 * the ability to trace an old order back to its product. Setting is_active
 * false removes it from the storefront and keeps the history intact.
 */
export async function archiveProductAction(productId: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('products')
    .update({ is_active: false })
    .eq('id', productId)
    .select('slug')
    .single();

  if (error) return { ok: false, error: describeDbError(error.message) };

  await recordAudit(admin, {
    action: 'product.archived',
    entityType: 'product',
    entityId: productId,
  });

  revalidateStorefront(data.slug);
  return { ok: true, message: 'Product unpublished. It is hidden from the store but not deleted.' };
}

export async function setProductPublishedAction(
  productId: string,
  published: boolean,
): Promise<ActionResult> {
  const admin = await requireAdmin();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('products')
    .update({ is_active: published })
    .eq('id', productId)
    .select('slug')
    .single();

  if (error) return { ok: false, error: describeDbError(error.message) };

  await recordAudit(admin, {
    action: published ? 'product.published' : 'product.unpublished',
    entityType: 'product',
    entityId: productId,
  });

  revalidateStorefront(data.slug);
  return { ok: true, message: published ? 'Product is live.' : 'Product hidden from the store.' };
}

// ---------------------------------------------------------------------------
// Variants
// ---------------------------------------------------------------------------

export async function saveVariantAction(
  productId: string,
  variantId: string | null,
  input: unknown,
): Promise<ActionResult> {
  const admin = await requireAdmin();

  const parsed = variantSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Please check the variant fields.',
      fieldErrors: fieldErrorsFrom(parsed.error),
    };
  }

  const v = parsed.data;
  const supabase = await createClient();

  const row = {
    product_id: productId,
    variant_name: v.variantName,
    quantity_value: v.quantityValue ?? null,
    quantity_unit: v.quantityUnit || null,
    mrp_paise: v.mrpPaise,
    selling_price_paise: v.sellingPricePaise,
    sku: v.sku || null,
    stock: v.stock ?? null,
    is_active: v.isActive,
    sort_order: v.sortOrder,
  };

  // Capture the previous price so the audit log records what actually changed.
  // "Someone edited a variant" is far less useful than "₹430 became ₹449".
  let previous: { mrp_paise: number; selling_price_paise: number } | null = null;
  if (variantId) {
    const { data } = await supabase
      .from('product_variants')
      .select('mrp_paise, selling_price_paise')
      .eq('id', variantId)
      .maybeSingle();
    previous = data ?? null;
  }

  const { error } = variantId
    ? await supabase.from('product_variants').update(row).eq('id', variantId)
    : await supabase.from('product_variants').insert(row);

  if (error) return { ok: false, error: describeDbError(error.message) };

  const priceChanged =
    previous &&
    (previous.mrp_paise !== v.mrpPaise || previous.selling_price_paise !== v.sellingPricePaise);

  await recordAudit(admin, {
    action: variantId ? (priceChanged ? 'variant.price_changed' : 'variant.updated') : 'variant.created',
    entityType: 'product_variant',
    entityId: variantId,
    metadata: priceChanged
      ? {
          variant: v.variantName,
          from: { mrp: previous!.mrp_paise, price: previous!.selling_price_paise },
          to: { mrp: v.mrpPaise, price: v.sellingPricePaise },
        }
      : { variant: v.variantName },
  });

  const { data: product } = await supabase
    .from('products')
    .select('slug')
    .eq('id', productId)
    .maybeSingle();

  revalidateStorefront(product?.slug);
  revalidatePath(`/admin/products/${productId}`);

  return {
    ok: true,
    message: priceChanged
      ? 'Price updated. The store shows the new price immediately; existing orders keep the price they were placed at.'
      : 'Variant saved.',
  };
}

/**
 * Variants are deactivated, not deleted, once they have been ordered.
 *
 * Deleting one would null the FK on historical order_items. The snapshots
 * survive, so the customer's order still reads correctly — but the link back
 * to the variant is gone forever, and that is not worth losing to tidy up a
 * list.
 */
export async function deleteVariantAction(variantId: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  const supabase = await createClient();

  const { count } = await supabase
    .from('order_items')
    .select('id', { count: 'exact', head: true })
    .eq('variant_id', variantId);

  if ((count ?? 0) > 0) {
    const { data, error } = await supabase
      .from('product_variants')
      .update({ is_active: false })
      .eq('id', variantId)
      .select('product_id, variant_name')
      .single();

    if (error) return { ok: false, error: describeDbError(error.message) };

    await recordAudit(admin, {
      action: 'variant.deactivated',
      entityType: 'product_variant',
      entityId: variantId,
      metadata: { reason: 'has order history', orders: count },
    });

    revalidatePath(`/admin/products/${data.product_id}`);
    revalidateStorefront();

    return {
      ok: true,
      message: `"${data.variant_name}" has been ordered before, so it was hidden rather than deleted — that keeps past orders traceable.`,
    };
  }

  const { data, error } = await supabase
    .from('product_variants')
    .delete()
    .eq('id', variantId)
    .select('product_id')
    .single();

  if (error) return { ok: false, error: describeDbError(error.message) };

  await recordAudit(admin, {
    action: 'variant.deleted',
    entityType: 'product_variant',
    entityId: variantId,
  });

  revalidatePath(`/admin/products/${data.product_id}`);
  revalidateStorefront();
  return { ok: true, message: 'Variant deleted.' };
}

// ---------------------------------------------------------------------------
// Images
// ---------------------------------------------------------------------------

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];

export async function uploadProductImageAction(
  productId: string,
  formData: FormData,
): Promise<ActionResult> {
  const admin = await requireAdmin();

  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: 'Choose an image to upload.' };
  }

  // Validate server-side. The bucket also restricts MIME types, but the
  // browser's `accept` attribute is a hint to the file picker and nothing
  // more — it stops nobody who posts to this action directly.
  if (!ALLOWED_TYPES.includes(file.type)) {
    return { ok: false, error: 'Images must be JPEG, PNG, WebP or AVIF.' };
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return {
      ok: false,
      error: `That image is ${(file.size / 1024 / 1024).toFixed(1)} MB. Please keep images under 8 MB.`,
    };
  }

  const supabase = await createClient();
  const storage = createServiceClient();

  const extension = file.type.split('/')[1]?.replace('jpeg', 'jpg') ?? 'jpg';
  // Random name, not the uploaded filename: user-supplied names carry path
  // separators, unicode tricks and collisions. Nothing here needs the original.
  const path = `${productId}/${crypto.randomUUID()}.${extension}`;

  const { error: uploadError } = await storage.storage
    .from('product-images')
    .upload(path, file, { contentType: file.type, upsert: false });

  if (uploadError) {
    return { ok: false, error: `Upload failed: ${uploadError.message}` };
  }

  const { count } = await supabase
    .from('product_images')
    .select('id', { count: 'exact', head: true })
    .eq('product_id', productId);

  const isFirst = (count ?? 0) === 0;

  const { error: rowError } = await supabase.from('product_images').insert({
    product_id: productId,
    storage_path: path,
    alt_text: null,
    sort_order: count ?? 0,
    // The first image becomes primary automatically, so a product is never
    // left with photography but no card image.
    is_primary: isFirst,
  });

  if (rowError) {
    // Do not leave an orphaned object in the bucket.
    await storage.storage.from('product-images').remove([path]);
    return { ok: false, error: describeDbError(rowError.message) };
  }

  await recordAudit(admin, {
    action: 'product_image.uploaded',
    entityType: 'product',
    entityId: productId,
    metadata: { path, primary: isFirst },
  });

  revalidatePath(`/admin/products/${productId}`);
  revalidateStorefront();

  return { ok: true, message: isFirst ? 'Image uploaded and set as the main image.' : 'Image uploaded.' };
}

export async function setPrimaryImageAction(
  productId: string,
  imageId: string,
): Promise<ActionResult> {
  const admin = await requireAdmin();
  const supabase = await createClient();

  // The database has a unique index allowing one primary per product, so the
  // old one must be cleared before the new one is set.
  const { error: clearError } = await supabase
    .from('product_images')
    .update({ is_primary: false })
    .eq('product_id', productId)
    .eq('is_primary', true);

  if (clearError) return { ok: false, error: describeDbError(clearError.message) };

  const { error } = await supabase
    .from('product_images')
    .update({ is_primary: true })
    .eq('id', imageId);

  if (error) return { ok: false, error: describeDbError(error.message) };

  await recordAudit(admin, {
    action: 'product_image.set_primary',
    entityType: 'product',
    entityId: productId,
    metadata: { imageId },
  });

  revalidatePath(`/admin/products/${productId}`);
  revalidateStorefront();
  return { ok: true, message: 'Main image updated.' };
}

export async function deleteProductImageAction(
  productId: string,
  imageId: string,
): Promise<ActionResult> {
  const admin = await requireAdmin();
  const supabase = await createClient();

  const { data: image, error: readError } = await supabase
    .from('product_images')
    .select('storage_path, is_primary')
    .eq('id', imageId)
    .single();

  if (readError) return { ok: false, error: describeDbError(readError.message) };

  const { error } = await supabase.from('product_images').delete().eq('id', imageId);
  if (error) return { ok: false, error: describeDbError(error.message) };

  // Remove the object too. A failure here is not worth surfacing to the admin:
  // the image is gone from the site, and a stray object costs a few kilobytes.
  await createServiceClient().storage.from('product-images').remove([image.storage_path]);

  // Promote another image so the product does not end up with photography but
  // no main image, which would show the placeholder on cards.
  if (image.is_primary) {
    const { data: next } = await supabase
      .from('product_images')
      .select('id')
      .eq('product_id', productId)
      .order('sort_order', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (next) {
      await supabase.from('product_images').update({ is_primary: true }).eq('id', next.id);
    }
  }

  await recordAudit(admin, {
    action: 'product_image.deleted',
    entityType: 'product',
    entityId: productId,
    metadata: { imageId },
  });

  revalidatePath(`/admin/products/${productId}`);
  revalidateStorefront();
  return { ok: true, message: 'Image removed.' };
}

export async function updateImageAltAction(
  productId: string,
  imageId: string,
  altText: string,
): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();

  const { error } = await supabase
    .from('product_images')
    .update({ alt_text: altText.trim().slice(0, 200) || null })
    .eq('id', imageId);

  if (error) return { ok: false, error: describeDbError(error.message) };

  revalidatePath(`/admin/products/${productId}`);
  revalidateStorefront();
  return { ok: true, message: 'Description saved.' };
}

// ---------------------------------------------------------------------------

/** Turns Postgres constraint failures into something an owner can act on. */
function describeDbError(message: string): string {
  if (message.includes('products_slug_key') || message.includes('duplicate key')) {
    if (message.includes('slug')) {
      return 'That URL slug is already used by another product. Choose a different one.';
    }
    if (message.includes('sku')) {
      return 'That SKU is already used by another variant.';
    }
    return 'That value is already in use.';
  }
  if (message.includes('products_slug_reserved')) {
    return 'That slug is reserved by a site route. Choose another.';
  }
  if (message.includes('variants_selling_lte_mrp')) {
    return 'Selling price cannot be higher than MRP.';
  }
  if (message.includes('row-level security')) {
    return 'You do not have permission to do that.';
  }
  return `Could not save: ${message}`;
}
