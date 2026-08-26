'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Plus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { saveCategoryAction, setCategoryActiveAction } from '@/server/actions/category-actions';

/**
 * Category editor.
 *
 * Same shape as the product variant editor (variants-editor.tsx): each
 * category is its own small form with its own save button, so fixing a typo
 * in one category's name cannot risk rewriting the other nine, and an "Add
 * category" row appends rather than replacing the list.
 */

export type CategoryRow = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  sort_order: number;
  is_active: boolean;
};

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export function CategoriesEditor({ categories }: { categories: CategoryRow[] }) {
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-stone-500">
          {categories.length} categor{categories.length === 1 ? 'y' : 'ies'}
        </p>
        {!adding ? (
          <Button type="button" variant="outline" size="sm" onClick={() => setAdding(true)}>
            <Plus className="size-4" aria-hidden />
            Add category
          </Button>
        ) : null}
      </div>

      {notice ? (
        <p
          role="status"
          className="mt-4 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800"
        >
          {notice}
        </p>
      ) : null}

      {categories.length === 0 && !adding ? (
        <p className="mt-5 rounded-xl border border-dashed border-line bg-white p-6 text-center text-sm text-stone-500">
          No categories yet.
        </p>
      ) : null}

      <div className="mt-5 space-y-4">
        {categories.map((category) => (
          <CategoryRowForm key={category.id} category={category} onDone={setNotice} />
        ))}

        {adding ? (
          <CategoryRowForm
            category={null}
            onDone={(msg) => {
              setNotice(msg);
              setAdding(false);
            }}
            onCancel={() => setAdding(false)}
          />
        ) : null}
      </div>
    </section>
  );
}

function CategoryRowForm({
  category,
  onDone,
  onCancel,
}: {
  category: CategoryRow | null;
  onDone: (message: string) => void;
  onCancel?: () => void;
}) {
  const router = useRouter();
  const isNew = !category;

  const [slug, setSlug] = useState(category?.slug ?? '');
  const [slugTouched, setSlugTouched] = useState(!isNew);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    const form = new FormData(event.currentTarget);
    const text = (name: string) => String(form.get(name) ?? '').trim();

    const result = await saveCategoryAction(category?.id ?? null, {
      name: text('name'),
      slug: text('slug'),
      description: text('description'),
      sortOrder: Number(text('sortOrder') || 0),
      isActive: form.get('isActive') === 'on',
    });

    setPending(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    onDone(result.message);
    router.refresh();
  }

  async function handleToggleActive() {
    if (!category) return;
    setPending(true);
    setError(null);

    const result = await setCategoryActiveAction(category.id, !category.is_active);

    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onDone(result.message);
    router.refresh();
  }

  return (
    <form
      onSubmit={handleSave}
      className={cn(
        'rounded-xl border p-4',
        isNew ? 'border-green-300 bg-green-50/40' : 'border-line bg-white',
        category && !category.is_active && 'opacity-70',
      )}
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <label className="lg:col-span-2">
          <span className="block text-xs font-medium text-stone-600">Name</span>
          <input
            name="name"
            required
            defaultValue={category?.name ?? ''}
            placeholder="Hair Care"
            onChange={(e) => {
              if (!slugTouched) setSlug(slugify(e.currentTarget.value));
            }}
            className="mt-1 w-full rounded-lg border border-line bg-white px-2.5 py-2 text-sm focus:border-green-600"
          />
        </label>

        <label className="lg:col-span-2">
          <span className="block text-xs font-medium text-stone-600">Slug</span>
          <input
            name="slug"
            required
            value={slug}
            onChange={(e) => {
              setSlugTouched(true);
              setSlug(e.currentTarget.value);
            }}
            placeholder="hair-care"
            className="mt-1 w-full rounded-lg border border-line bg-white px-2.5 py-2 text-sm focus:border-green-600"
          />
        </label>

        <label>
          <span className="block text-xs font-medium text-stone-600">Order</span>
          <input
            name="sortOrder"
            type="number"
            min={0}
            defaultValue={category?.sort_order ?? 0}
            className="mt-1 w-full rounded-lg border border-line bg-white px-2.5 py-2 text-sm focus:border-green-600"
          />
        </label>
      </div>

      <label className="mt-3 block">
        <span className="block text-xs font-medium text-stone-600">Description (optional)</span>
        <input
          name="description"
          defaultValue={category?.description ?? ''}
          className="mt-1 w-full rounded-lg border border-line bg-white px-2.5 py-2 text-sm focus:border-green-600"
        />
      </label>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2">
          <input
            name="isActive"
            type="checkbox"
            defaultChecked={category?.is_active ?? true}
            className="size-4 rounded border-line text-green-700 focus:ring-green-600"
          />
          <span className="text-xs font-medium text-stone-600">Visible in the store</span>
        </label>

        <div className="flex items-center gap-2">
          {!isNew ? (
            <Button
              type="button"
              size="sm"
              variant="subtle"
              disabled={pending}
              onClick={handleToggleActive}
            >
              {category?.is_active ? 'Archive' : 'Restore'}
            </Button>
          ) : null}

          <Button type="submit" size="sm" disabled={pending}>
            {pending ? 'Saving…' : isNew ? 'Add' : 'Save'}
          </Button>

          {isNew ? (
            <Button type="button" size="sm" variant="subtle" onClick={onCancel}>
              Cancel
            </Button>
          ) : null}
        </div>
      </div>

      {error ? (
        <p role="alert" className="mt-3 text-sm text-[--color-danger]">
          {error}
        </p>
      ) : null}
    </form>
  );
}
