'use server';

import { revalidatePath } from 'next/cache';

import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { storeSettingsSchema } from '@/lib/validation';
import { recordAudit, requireAdmin } from '@/server/auth';

/**
 * Store settings (brief §54).
 *
 * Only fields that actually drive something in the app are exposed here:
 * store name, WhatsApp, Instagram, contact email (where the Contact form
 * delivers to — see src/lib/email/contact.ts), address (shown on the Contact
 * page), and shipping (read by src/server/pricing.ts and create_order at
 * checkout) — a default rate plus an optional Tamil Nadu override, since
 * that is SSG's actual policy: cheaper within Tamil Nadu, one flat rate
 * everywhere else in India.
 *
 * `tax_config` exists as a column but has no reader anywhere in this
 * codebase — nothing computes tax on an order. Building a settings form for
 * it would look like tax is being handled when it is not, which is worse
 * than leaving it out entirely. It stays unexposed until real tax
 * calculation exists to configure.
 */

export type ActionResult =
  | { ok: true; message: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

/** Every route that reads store_settings, so a save is visible immediately. */
function revalidateSettingsConsumers() {
  // The header/footer render on every storefront page via the root layout,
  // so revalidating at the layout level catches all of them in one call
  // rather than enumerating each route that happens to render a <Logo> or
  // the footer today.
  revalidatePath('/', 'layout');
  revalidatePath('/admin/settings');
}

export async function updateStoreSettingsAction(input: unknown): Promise<ActionResult> {
  const admin = await requireAdmin();

  const parsed = storeSettingsSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join('.');
      if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { ok: false, error: 'Please check the highlighted fields.', fieldErrors };
  }

  const s = parsed.data;
  const supabase = await createClient();

  const { error } = await supabase
    .from('store_settings')
    .update({
      store_name: s.storeName,
      whatsapp: s.whatsapp || null,
      instagram_url: s.instagramUrl || null,
      email: s.email || null,
      address: s.address || null,
      shipping_flat_paise: s.shippingFlatPaise ?? null,
      shipping_tamil_nadu_paise: s.shippingTamilNaduPaise ?? null,
      free_shipping_threshold_paise: s.freeShippingThresholdPaise ?? null,
    })
    .eq('id', true);

  if (error) {
    return { ok: false, error: `Could not save settings: ${error.message}` };
  }

  await recordAudit(admin, {
    action: 'settings.updated',
    entityType: 'store_settings',
    metadata: {
      store_name: s.storeName,
      whatsapp: s.whatsapp || null,
      instagram_url: s.instagramUrl || null,
      email: s.email || null,
      shipping_flat_paise: s.shippingFlatPaise ?? null,
      shipping_tamil_nadu_paise: s.shippingTamilNaduPaise ?? null,
      free_shipping_threshold_paise: s.freeShippingThresholdPaise ?? null,
    },
  });

  revalidateSettingsConsumers();
  return { ok: true, message: 'Settings saved.' };
}

// ---------------------------------------------------------------------------
// Logo
// ---------------------------------------------------------------------------

const MAX_LOGO_BYTES = 4 * 1024 * 1024;
const ALLOWED_LOGO_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
  'image/svg+xml',
];

/**
 * Uploads a replacement logo to the `brand-assets` bucket and points
 * `store_settings.logo_path` at it.
 *
 * This does not touch the filesystem-installed logo at
 * public/brand/ssg-logo.*, and does not need to: <Logo> (src/components/
 * brand/logo.tsx) checks store_settings.logo_path FIRST and only falls back
 * to the installed file when it is null, so setting this here is a strict
 * override, and clearing it (removeLogoAction) restores exactly the previous
 * behaviour rather than leaving the site without a logo.
 */
export async function uploadLogoAction(formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();

  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: 'Choose an image to upload.' };
  }
  if (!ALLOWED_LOGO_TYPES.includes(file.type)) {
    return { ok: false, error: 'Logo must be JPEG, PNG, WebP, AVIF or SVG.' };
  }
  if (file.size > MAX_LOGO_BYTES) {
    return {
      ok: false,
      error: `That image is ${(file.size / 1024 / 1024).toFixed(1)} MB. Please keep the logo under 4 MB.`,
    };
  }

  const supabase = await createClient();
  const storage = createServiceClient();

  const { data: existing } = await supabase
    .from('store_settings')
    .select('logo_path')
    .eq('id', true)
    .maybeSingle();

  const extension = file.type.split('/')[1]?.replace('svg+xml', 'svg') ?? 'png';
  const path = `logo-${crypto.randomUUID()}.${extension}`;

  const { error: uploadError } = await storage.storage
    .from('brand-assets')
    .upload(path, file, { contentType: file.type, upsert: false });

  if (uploadError) {
    return { ok: false, error: `Upload failed: ${uploadError.message}` };
  }

  const { error: updateError } = await supabase
    .from('store_settings')
    .update({ logo_path: path })
    .eq('id', true);

  if (updateError) {
    // Do not leave an orphaned object behind if the row failed to update.
    await storage.storage.from('brand-assets').remove([path]);
    return { ok: false, error: `Could not save the logo: ${updateError.message}` };
  }

  // Remove the previous upload now that the row points at the new one — best
  // effort; a stray object here costs a few kilobytes, not correctness.
  if (existing?.logo_path) {
    await storage.storage.from('brand-assets').remove([existing.logo_path]);
  }

  await recordAudit(admin, {
    action: 'settings.logo_uploaded',
    entityType: 'store_settings',
    metadata: { path },
  });

  revalidateSettingsConsumers();
  return { ok: true, message: 'Logo updated across the site.' };
}

/** Reverts to the filesystem-installed logo (or the wordmark, if none exists). */
export async function removeLogoAction(): Promise<ActionResult> {
  const admin = await requireAdmin();
  const supabase = await createClient();
  const storage = createServiceClient();

  const { data: existing } = await supabase
    .from('store_settings')
    .select('logo_path')
    .eq('id', true)
    .maybeSingle();

  if (!existing?.logo_path) {
    return { ok: true, message: 'No custom logo is set.' };
  }

  const { error } = await supabase
    .from('store_settings')
    .update({ logo_path: null })
    .eq('id', true);

  if (error) {
    return { ok: false, error: `Could not remove the logo: ${error.message}` };
  }

  await storage.storage.from('brand-assets').remove([existing.logo_path]);

  await recordAudit(admin, {
    action: 'settings.logo_removed',
    entityType: 'store_settings',
  });

  revalidateSettingsConsumers();
  return { ok: true, message: 'Custom logo removed — showing the default logo again.' };
}
