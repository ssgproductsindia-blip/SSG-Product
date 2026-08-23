'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Check, Minus, Plus, ShoppingBag } from 'lucide-react';

import { useCart } from '@/components/cart/cart-provider';
import { Button } from '@/components/ui/button';
import { Price } from '@/components/ui/price';
import { cn } from '@/lib/utils';
import type { CatalogProduct, CatalogVariant } from '@/server/catalog';

/**
 * Variant selection, quantity and add-to-cart.
 *
 * Changing the variant updates price, MRP, discount and stock together,
 * because all four are read from the same selected variant object — there is
 * no separate price state that could be updated a render later than the
 * selection and briefly show one variant's price against another's name.
 *
 * The variant list is a real radiogroup: arrow keys move between pack sizes
 * and the roving tabindex keeps the group a single tab stop, which is how a
 * native radio group behaves and what a screen-reader user will expect.
 */

function isPurchasable(variant: CatalogVariant): boolean {
  return variant.stock === null || variant.stock > 0;
}

export function PurchasePanel({ product }: { product: CatalogProduct }) {
  const router = useRouter();
  const { add } = useCart();

  // Default to the first purchasable variant so the page does not open on an
  // out-of-stock size with the buy button already disabled.
  const initial =
    product.variants.find(isPurchasable) ?? product.variants[0] ?? null;

  const [selectedId, setSelectedId] = useState(initial?.id ?? '');
  const [quantity, setQuantity] = useState(1);
  const [justAdded, setJustAdded] = useState(false);
  const addedTimer = useRef<number | null>(null);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const selected =
    product.variants.find((v) => v.id === selectedId) ?? initial;

  useEffect(() => {
    return () => {
      if (addedTimer.current) window.clearTimeout(addedTimer.current);
    };
  }, []);

  if (!selected) return null;

  const available = isPurchasable(selected);
  const maxQuantity = Math.min(99, selected.stock ?? 99);
  const lowStock =
    selected.stock !== null && selected.stock > 0 && selected.stock <= 5;

  const snapshot = {
    variantId: selected.id,
    productName: product.name,
    productSlug: product.slug,
    variantName: selected.variant_name,
    sellingPricePaise: selected.selling_price_paise,
    mrpPaise: selected.mrp_paise,
    imageUrl: product.images[0]?.url ?? null,
  };

  function handleAdd() {
    add(snapshot, quantity);
    setJustAdded(true);
    if (addedTimer.current) window.clearTimeout(addedTimer.current);
    addedTimer.current = window.setTimeout(() => setJustAdded(false), 2400);
  }

  function handleBuyNow() {
    add(snapshot, quantity);
    router.push('/checkout');
  }

  /** Arrow-key navigation across the variant radiogroup. */
  function handleKeyDown(event: React.KeyboardEvent, index: number) {
    const keys = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'];
    if (!keys.includes(event.key)) return;
    event.preventDefault();

    const forward = event.key === 'ArrowRight' || event.key === 'ArrowDown';
    const next =
      (index + (forward ? 1 : -1) + product.variants.length) % product.variants.length;

    setSelectedId(product.variants[next].id);
    setQuantity(1);
    optionRefs.current[next]?.focus();
  }

  return (
    <div className="flex flex-col gap-7">
      <Price
        mrpPaise={selected.mrp_paise}
        sellingPricePaise={selected.selling_price_paise}
        size="lg"
        showSavings
      />

      {/* ---- Variant selector ---------------------------------------- */}
      {product.variants.length > 1 ? (
        <div>
          <div
            id="variant-label"
            className="text-sm font-semibold text-earth-900"
          >
            {product.variants[0]?.quantity_unit === 'ml'
              ? 'Choose size'
              : 'Choose pack size'}
          </div>

          <div
            role="radiogroup"
            aria-labelledby="variant-label"
            className="mt-3 flex flex-wrap gap-2.5"
          >
            {product.variants.map((variant, index) => {
              const isSelected = variant.id === selected.id;
              const buyable = isPurchasable(variant);

              return (
                <button
                  key={variant.id}
                  ref={(node) => {
                    optionRefs.current[index] = node;
                  }}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  // Roving tabindex: only the selected option is tabbable, so
                  // the whole group is one stop in the tab order.
                  tabIndex={isSelected ? 0 : -1}
                  onClick={() => {
                    setSelectedId(variant.id);
                    setQuantity(1);
                  }}
                  onKeyDown={(event) => handleKeyDown(event, index)}
                  className={cn(
                    'relative min-w-20 rounded-xl border px-4 py-3 text-sm font-medium transition-all duration-200',
                    isSelected
                      ? 'border-green-700 bg-green-50 text-green-900 ring-1 ring-green-700'
                      : 'border-line bg-surface text-stone-700 hover:border-green-300 hover:bg-green-50/50',
                    !buyable && 'opacity-55',
                  )}
                >
                  {variant.variant_name}
                  {!buyable ? (
                    <span className="mt-0.5 block text-[0.7rem] font-normal text-stone-500">
                      Out of stock
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* ---- Availability -------------------------------------------- */}
      {!available ? (
        <p
          role="status"
          className="rounded-xl border border-[--color-danger]/25 bg-[--color-danger-surface] px-4 py-3 text-sm font-medium text-[--color-danger]"
        >
          This size is out of stock.
        </p>
      ) : lowStock ? (
        <p role="status" className="text-sm font-medium text-[--color-warning]">
          Only {selected.stock} left.
        </p>
      ) : null}

      {/* ---- Quantity ------------------------------------------------- */}
      <div className="flex flex-wrap items-center gap-4">
        <span id="qty-label" className="text-sm font-semibold text-earth-900">
          Quantity
        </span>

        <div className="flex items-center rounded-full border border-line bg-surface">
          <button
            type="button"
            onClick={() => setQuantity((q) => Math.max(1, q - 1))}
            disabled={quantity <= 1 || !available}
            aria-label="Decrease quantity"
            className="flex size-11 items-center justify-center rounded-full text-stone-700 transition-colors hover:bg-green-50 disabled:opacity-40 disabled:hover:bg-transparent"
          >
            <Minus className="size-4" aria-hidden />
          </button>

          {/*
            aria-live so a screen reader announces the new number when the
            buttons change it — otherwise the change is silent.
          */}
          <span
            aria-live="polite"
            aria-labelledby="qty-label"
            className="w-10 text-center text-base font-semibold tabular-nums text-earth-900"
          >
            {quantity}
          </span>

          <button
            type="button"
            onClick={() => setQuantity((q) => Math.min(maxQuantity, q + 1))}
            disabled={quantity >= maxQuantity || !available}
            aria-label="Increase quantity"
            className="flex size-11 items-center justify-center rounded-full text-stone-700 transition-colors hover:bg-green-50 disabled:opacity-40 disabled:hover:bg-transparent"
          >
            <Plus className="size-4" aria-hidden />
          </button>
        </div>
      </div>

      {/* ---- Actions --------------------------------------------------- */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <Button
          size="lg"
          onClick={handleAdd}
          disabled={!available}
          className="flex-1"
          aria-live="polite"
        >
          {justAdded ? (
            <>
              <Check className="size-4" aria-hidden />
              Added to cart
            </>
          ) : (
            <>
              <ShoppingBag className="size-4" aria-hidden />
              Add to cart
            </>
          )}
        </Button>

        <Button
          size="lg"
          variant="secondary"
          onClick={handleBuyNow}
          disabled={!available}
          className="flex-1"
        >
          Buy now
        </Button>
      </div>
    </div>
  );
}
