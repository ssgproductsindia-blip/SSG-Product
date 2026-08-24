'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { CheckboxField, Field, TextAreaField } from '@/components/admin/field';
import { Button } from '@/components/ui/button';
import { saveProductAction } from '@/server/actions/product-actions';

/**
 * Product create/edit form.
 *
 * Ingredients and benefits are one-per-line textareas rather than a repeating
 * field widget. They are stored as text[], and a 17-line ingredient list is
 * far faster to paste from packaging into a textarea than to enter through
 * seventeen "add another" clicks.
 */

export type ProductFormValues = {
  id?: string;
  name: string;
  slug: string;
  shortDescription: string;
  description: string;
  ingredients: string[];
  benefits: string[];
  usageInstructions: string;
  seoTitle: string;
  seoDescription: string;
  isActive: boolean;
  isFeatured: boolean;
  sortOrder: number;
};

const EMPTY: ProductFormValues = {
  name: '',
  slug: '',
  shortDescription: '',
  description: '',
  ingredients: [],
  benefits: [],
  usageInstructions: '',
  seoTitle: '',
  seoDescription: '',
  isActive: false,
  isFeatured: false,
  sortOrder: 0,
};

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/^ssg\s+/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export function ProductForm({ initial }: { initial?: ProductFormValues }) {
  const router = useRouter();
  const values = initial ?? EMPTY;
  const isNew = !values.id;

  const [slug, setSlug] = useState(values.slug);
  // Stop auto-filling the slug once it has been edited by hand, or an existing
  // product's URL would silently change every time its name was tweaked.
  const [slugTouched, setSlugTouched] = useState(!isNew);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setMessage(null);
    setFieldErrors({});

    const form = new FormData(event.currentTarget);
    const text = (name: string) => String(form.get(name) ?? '').trim();

    const result = await saveProductAction(values.id ?? null, {
      name: text('name'),
      slug: text('slug'),
      shortDescription: text('shortDescription'),
      description: text('description'),
      ingredients: String(form.get('ingredients') ?? ''),
      benefits: String(form.get('benefits') ?? ''),
      usageInstructions: text('usageInstructions'),
      seoTitle: text('seoTitle'),
      seoDescription: text('seoDescription'),
      isActive: form.get('isActive') === 'on',
      isFeatured: form.get('isFeatured') === 'on',
      sortOrder: Number(form.get('sortOrder') ?? 0),
    });

    setPending(false);

    if (!result.ok) {
      setError(result.error);
      setFieldErrors(result.fieldErrors ?? {});
      return;
    }

    setMessage(result.message);

    // A new product has no variants yet, and cannot be sold without them, so
    // send the admin straight to the edit page where variants live.
    if (isNew && result.id) {
      router.push(`/admin/products/${result.id}`);
    } else {
      router.refresh();
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-8">
      {error ? (
        <p role="alert" className="rounded-xl border border-[--color-danger]/25 bg-[--color-danger-surface] px-4 py-3 text-sm text-[--color-danger]">
          {error}
        </p>
      ) : null}
      {message ? (
        <p role="status" className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          {message}
        </p>
      ) : null}

      <section className="rounded-2xl border border-line bg-white p-6">
        <h2 className="font-display text-lg font-semibold text-earth-900">Basics</h2>
        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <Field
            name="name"
            label="Product name"
            required
            defaultValue={values.name}
            error={fieldErrors.name}
            className="sm:col-span-2"
            onChange={(event) => {
              if (!slugTouched) setSlug(slugify(event.currentTarget.value));
            }}
          />
          <Field
            name="slug"
            label="URL slug"
            required
            value={slug}
            onChange={(event) => {
              setSlugTouched(true);
              setSlug(event.currentTarget.value);
            }}
            hint={`Store address: /products/${slug || '…'}`}
            error={fieldErrors.slug}
            className="sm:col-span-2"
          />
          <TextAreaField
            name="shortDescription"
            label="Short description"
            optional
            rows={2}
            defaultValue={values.shortDescription}
            hint="One line, shown on product cards and under the title."
            error={fieldErrors.shortDescription}
            className="sm:col-span-2"
          />
          <TextAreaField
            name="description"
            label="Full description"
            optional
            rows={5}
            defaultValue={values.description}
            error={fieldErrors.description}
            className="sm:col-span-2"
          />
        </div>
      </section>

      <section className="rounded-2xl border border-line bg-white p-6">
        <h2 className="font-display text-lg font-semibold text-earth-900">
          Ingredients &amp; benefits
        </h2>
        <p className="mt-1 text-sm text-stone-500">
          One per line. Copy these from the product label — do not add claims
          that are not printed on the packaging.
        </p>
        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <TextAreaField
            name="ingredients"
            label="Ingredients"
            optional
            rows={8}
            defaultValue={values.ingredients.join('\n')}
            hint="e.g. Shikakai, then Tulasi on the next line"
            error={fieldErrors.ingredients}
          />
          <TextAreaField
            name="benefits"
            label="Benefits"
            optional
            rows={8}
            defaultValue={values.benefits.join('\n')}
            hint="Only what appears on the label."
            error={fieldErrors.benefits}
          />
          <TextAreaField
            name="usageInstructions"
            label="How to use"
            optional
            rows={3}
            defaultValue={values.usageInstructions}
            error={fieldErrors.usageInstructions}
            className="sm:col-span-2"
          />
        </div>
      </section>

      <section className="rounded-2xl border border-line bg-white p-6">
        <h2 className="font-display text-lg font-semibold text-earth-900">Search listing</h2>
        <p className="mt-1 text-sm text-stone-500">
          Leave blank to use the product name and short description.
        </p>
        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <Field
            name="seoTitle"
            label="Page title"
            optional
            maxLength={70}
            defaultValue={values.seoTitle}
            hint="Up to 70 characters."
            error={fieldErrors.seoTitle}
          />
          <Field
            name="seoDescription"
            label="Meta description"
            optional
            maxLength={180}
            defaultValue={values.seoDescription}
            hint="Up to 180 characters."
            error={fieldErrors.seoDescription}
          />
        </div>
      </section>

      <section className="rounded-2xl border border-line bg-white p-6">
        <h2 className="font-display text-lg font-semibold text-earth-900">Visibility</h2>
        <div className="mt-5 space-y-4">
          <CheckboxField
            name="isActive"
            label="Published"
            hint="Visible in the store. A product with no variants cannot be bought even when published."
            defaultChecked={values.isActive}
          />
          <CheckboxField
            name="isFeatured"
            label="Featured on the homepage"
            defaultChecked={values.isFeatured}
          />
          <Field
            name="sortOrder"
            label="Sort order"
            type="number"
            min={0}
            max={9999}
            defaultValue={String(values.sortOrder)}
            hint="Lower numbers appear first."
            error={fieldErrors.sortOrder}
            className="max-w-40"
          />
        </div>
      </section>

      <div className="flex gap-3">
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? 'Saving…' : isNew ? 'Create product' : 'Save changes'}
        </Button>
        <Button type="button" variant="subtle" size="lg" onClick={() => router.back()}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
