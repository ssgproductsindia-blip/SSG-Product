'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { discountPercent, paiseToRupeeInput, rupeesToPaise } from '@/lib/money';
import { deleteVariantAction, saveVariantAction } from '@/server/actions/product-actions';
import { cn } from '@/lib/utils';

/**
 * Variant editor.
 *
 * Each variant is its own small form with its own save button, rather than one
 * giant form for the whole product. Changing one price then saving should not
 * risk rewriting four other rows, and a validation error on the 1 KG size
 * should not block saving a correction to the 200g one.
 *
 * The discount percentage updates live as you type. It is computed from the
 * two prices and is never stored — the same function the storefront uses.
 */

export type VariantRow = {
  id: string;
  variant_name: string;
  quantity_value: number | null;
  quantity_unit: string | null;
  mrp_paise: number;
  selling_price_paise: number;
  sku: string | null;
  stock: number | null;
  is_active: boolean;
  sort_order: number;
};

export function VariantsEditor({
  productId,
  variants,
}: {
  productId: string;
  variants: VariantRow[];
}) {
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  return (
    <section className="rounded-2xl border border-line bg-white p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold text-earth-900">
            Sizes &amp; prices
          </h2>
          <p className="mt-1 text-sm text-stone-500">
            A product needs at least one variant before it can be bought.
          </p>
        </div>
        {!adding ? (
          <Button type="button" variant="outline" size="sm" onClick={() => setAdding(true)}>
            <Plus className="size-4" aria-hidden />
            Add size
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

      {variants.length === 0 && !adding ? (
        <p className="mt-5 rounded-xl border border-dashed border-line p-6 text-center text-sm text-stone-500">
          No sizes yet. Add one so customers can buy this product.
        </p>
      ) : null}

      <div className="mt-5 space-y-4">
        {variants.map((variant) => (
          <VariantRowForm
            key={variant.id}
            productId={productId}
            variant={variant}
            onDone={setNotice}
          />
        ))}

        {adding ? (
          <VariantRowForm
            productId={productId}
            variant={null}
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

function VariantRowForm({
  productId,
  variant,
  onDone,
  onCancel,
}: {
  productId: string;
  variant: VariantRow | null;
  onDone: (message: string) => void;
  onCancel?: () => void;
}) {
  const router = useRouter();
  const isNew = !variant;

  const [mrp, setMrp] = useState(variant ? paiseToRupeeInput(variant.mrp_paise) : '');
  const [price, setPrice] = useState(
    variant ? paiseToRupeeInput(variant.selling_price_paise) : '',
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mrpPaise = rupeesToPaise(mrp);
  const pricePaise = rupeesToPaise(price);
  const percent =
    mrpPaise !== null && pricePaise !== null ? discountPercent(mrpPaise, pricePaise) : null;
  const priceAboveMrp = mrpPaise !== null && pricePaise !== null && pricePaise > mrpPaise;

  async function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    const form = new FormData(event.currentTarget);
    const text = (name: string) => String(form.get(name) ?? '').trim();

    const mrpValue = rupeesToPaise(text('mrp'));
    const priceValue = rupeesToPaise(text('price'));

    if (mrpValue === null || priceValue === null) {
      setError('Enter both prices as plain numbers, e.g. 430 or 430.50');
      setPending(false);
      return;
    }

    const stockRaw = text('stock');

    const result = await saveVariantAction(productId, variant?.id ?? null, {
      variantName: text('variantName'),
      quantityValue: text('quantityValue') ? Number(text('quantityValue')) : null,
      quantityUnit: text('quantityUnit') || null,
      mrpPaise: mrpValue,
      sellingPricePaise: priceValue,
      sku: text('sku') || null,
      // Empty means "not tracked", which is different from zero. Zero would
      // mark the variant out of stock and stop it being sold.
      stock: stockRaw === '' ? null : Number(stockRaw),
      isActive: form.get('isActive') === 'on',
      sortOrder: Number(text('sortOrder') || 0),
    });

    setPending(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    onDone(result.message);
    router.refresh();
  }

  async function handleDelete() {
    if (!variant) return;
    setPending(true);
    const result = await deleteVariantAction(variant.id);
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
        isNew ? 'border-green-300 bg-green-50/40' : 'border-line',
        variant && !variant.is_active && 'opacity-70',
      )}
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <label className="lg:col-span-1">
          <span className="block text-xs font-medium text-stone-600">Size name</span>
          <input
            name="variantName"
            required
            defaultValue={variant?.variant_name ?? ''}
            placeholder="500g"
            className="mt-1 w-full rounded-lg border border-line bg-white px-2.5 py-2 text-sm focus:border-green-600"
          />
        </label>

        <label>
          <span className="block text-xs font-medium text-stone-600">Amount</span>
          <input
            name="quantityValue"
            type="number"
            step="0.01"
            defaultValue={variant?.quantity_value ?? ''}
            placeholder="500"
            className="mt-1 w-full rounded-lg border border-line bg-white px-2.5 py-2 text-sm focus:border-green-600"
          />
        </label>

        <label>
          <span className="block text-xs font-medium text-stone-600">Unit</span>
          <input
            name="quantityUnit"
            defaultValue={variant?.quantity_unit ?? ''}
            placeholder="g / ml / kg"
            className="mt-1 w-full rounded-lg border border-line bg-white px-2.5 py-2 text-sm focus:border-green-600"
          />
        </label>

        <label>
          <span className="block text-xs font-medium text-stone-600">MRP (₹)</span>
          <input
            name="mrp"
            required
            inputMode="decimal"
            value={mrp}
            onChange={(e) => setMrp(e.currentTarget.value)}
            placeholder="600"
            className="mt-1 w-full rounded-lg border border-line bg-white px-2.5 py-2 text-sm focus:border-green-600"
          />
        </label>

        <label>
          <span className="block text-xs font-medium text-stone-600">Selling price (₹)</span>
          <input
            name="price"
            required
            inputMode="decimal"
            value={price}
            onChange={(e) => setPrice(e.currentTarget.value)}
            placeholder="430"
            className={cn(
              'mt-1 w-full rounded-lg border bg-white px-2.5 py-2 text-sm focus:border-green-600',
              priceAboveMrp ? 'border-[--color-danger]' : 'border-line',
            )}
          />
        </label>

        <div className="flex items-end pb-2">
          {priceAboveMrp ? (
            <span className="text-xs font-medium text-[--color-danger]">Above MRP</span>
          ) : percent !== null && percent > 0 ? (
            <span className="rounded-full bg-green-100 px-2 py-1 text-xs font-semibold text-green-800">
              {percent}% OFF
            </span>
          ) : (
            <span className="text-xs text-stone-400">No discount</span>
          )}
        </div>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <label>
          <span className="block text-xs font-medium text-stone-600">SKU</span>
          <input
            name="sku"
            defaultValue={variant?.sku ?? ''}
            className="mt-1 w-full rounded-lg border border-line bg-white px-2.5 py-2 text-sm focus:border-green-600"
          />
        </label>

        <label>
          <span className="block text-xs font-medium text-stone-600">Stock</span>
          <input
            name="stock"
            type="number"
            min={0}
            defaultValue={variant?.stock ?? ''}
            placeholder="untracked"
            className="mt-1 w-full rounded-lg border border-line bg-white px-2.5 py-2 text-sm focus:border-green-600"
          />
          <span className="mt-0.5 block text-[0.65rem] leading-tight text-stone-400">
            Blank = not tracked. 0 = out of stock.
          </span>
        </label>

        <label>
          <span className="block text-xs font-medium text-stone-600">Order</span>
          <input
            name="sortOrder"
            type="number"
            min={0}
            defaultValue={variant?.sort_order ?? 0}
            className="mt-1 w-full rounded-lg border border-line bg-white px-2.5 py-2 text-sm focus:border-green-600"
          />
        </label>

        <label className="flex items-center gap-2 pt-5">
          <input
            name="isActive"
            type="checkbox"
            defaultChecked={variant?.is_active ?? true}
            className="size-4 rounded border-line text-green-700 focus:ring-green-600"
          />
          <span className="text-xs font-medium text-stone-600">Available</span>
        </label>

        <div className="flex items-end gap-2 lg:col-span-2">
          <Button type="submit" size="sm" disabled={pending || priceAboveMrp}>
            {pending ? 'Saving…' : isNew ? 'Add' : 'Save'}
          </Button>

          {isNew ? (
            <Button type="button" size="sm" variant="subtle" onClick={onCancel}>
              Cancel
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              variant="subtle"
              disabled={pending}
              onClick={handleDelete}
              aria-label={`Remove ${variant?.variant_name}`}
            >
              <Trash2 className="size-3.5" aria-hidden />
            </Button>
          )}
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
