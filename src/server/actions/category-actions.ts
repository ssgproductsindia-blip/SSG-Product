'use server';

import { revalidatePath } from 'next/cache';

import { createClient } from '@/lib/supabase/server';
import { categorySchema } from '@/lib/validation';
import { recordAudit, requireAdmin } from '@/server/auth';

/**
 * Admin category management (brief §51).
 *
 * Only archive/restore, never delete — the same reasoning as products and
 * variants. `products.category_id` is ON DELETE SET NULL, so a hard delete
 * would not even break anything technically, but it would silently strip the
 * category off every product that had it with no record of what happened.
 * Toggling is_active removes a category from the storefront (RLS: only
 * active categories are public) and from the picker on the product form,
 * while leaving every product's category_id and the category's own history
 * untouched.
 */

export type ActionResult =
  | { ok: true; message: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

function revalidateCategoryConsumers() {
  revalidatePath('/admin/categories');
  // The category picker on the product form reads the same table. Every
  // admin product page is already `force-dynamic` (re-queries on every
  // request regardless), so this is a safety net rather than load-bearing.
  revalidatePath('/admin/products/new');
}

export async function saveCategoryAction(
  categoryId: string | null,
  input: unknown,
): Promise<ActionResult> {
  const admin = await requireAdmin();

  const parsed = categorySchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join('.');
      if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { ok: false, error: 'Please check the highlighted fields.', fieldErrors };
  }

  const c = parsed.data;
  const supabase = await createClient();

  const row = {
    name: c.name,
    slug: c.slug,
    description: c.description || null,
    sort_order: c.sortOrder,
    is_active: c.isActive,
  };

  const { error } = categoryId
    ? await supabase.from('categories').update(row).eq('id', categoryId)
    : await supabase.from('categories').insert(row);

  if (error) {
    return { ok: false, error: describeDbError(error.message) };
  }

  await recordAudit(admin, {
    action: categoryId ? 'category.updated' : 'category.created',
    entityType: 'category',
    entityId: categoryId,
    metadata: { name: c.name, slug: c.slug },
  });

  revalidateCategoryConsumers();
  return { ok: true, message: categoryId ? 'Category saved.' : 'Category created.' };
}

export async function setCategoryActiveAction(
  categoryId: string,
  isActive: boolean,
): Promise<ActionResult> {
  const admin = await requireAdmin();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('categories')
    .update({ is_active: isActive })
    .eq('id', categoryId)
    .select('name')
    .single();

  if (error) {
    return { ok: false, error: describeDbError(error.message) };
  }

  await recordAudit(admin, {
    action: isActive ? 'category.restored' : 'category.archived',
    entityType: 'category',
    entityId: categoryId,
    metadata: { name: data.name },
  });

  revalidateCategoryConsumers();
  return {
    ok: true,
    message: isActive
      ? `"${data.name}" restored — visible again and selectable on products.`
      : `"${data.name}" archived — hidden from the storefront. Products already using it keep it; you just can't pick it for new ones until it's restored.`,
  };
}

function describeDbError(message: string): string {
  if (message.includes('categories_slug_key') || message.includes('duplicate key')) {
    return 'That URL slug is already used by another category. Choose a different one.';
  }
  if (message.includes('categories_slug_format')) {
    return 'Use lowercase letters, numbers and hyphens only.';
  }
  if (message.includes('row-level security')) {
    return 'You do not have permission to do that.';
  }
  return `Could not save: ${message}`;
}
