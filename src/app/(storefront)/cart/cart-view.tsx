'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useMemo, useState, useTransition } from 'react';
import { Minus, Plus, Trash2 } from 'lucide-react';

import { useCart } from '@/components/cart/cart-provider';
import { Button } from '@/components/ui/button';
import { formatPaise } from '@/lib/money';
import { repriceCartAction } from '@/server/actions/cart-actions';
import type { PricingResult } from '@/server/pricing';

/**
 * Cart.
 *
 * On mount, and after any quantity change, the cart is re-priced on the
 * server. The customer sees live prices and live availability, not whatever
 * was cached in localStorage when they added the item.
 *
 * When re-pricing turns up a problem — a variant went out of stock, or was
 * unpublished — the affected lines are named and checkout is blocked. The
 * alternative, letting them proceed and failing at order creation, wastes the
 * customer's address entry to tell them something we already knew here.
 */
type Reprice = PricingResult | { ok: false; issues: []; invalid: string };

export function CartView() {
  const { items, setQuantity, remove, hydrated, indicativeSubtotalPaise } = useCart();
  const [isPending, startTransition] = useTransition();

  /**
   * A pricing result is stored together with the cart it describes.
   *
   * Without this, quickly clicking "+" twice fires two overlapping repricings,
   * and if the first resolves last the customer sees the total for the
   * previous quantity. Tagging each result and discarding any that no longer
   * matches the cart makes out-of-order responses harmless.
   */
  const signature = useMemo(
    () => items.map((i) => `${i.variantId}:${i.quantity}`).join('|'),
    [items],
  );

  const [entry, setEntry] = useState<{ signature: string; result: Reprice } | null>(null);

  useEffect(() => {
    if (!hydrated || items.length === 0) return;

    let cancelled = false;
    const payload = items.map((i) => ({ variantId: i.variantId, quantity: i.quantity }));

    startTransition(async () => {
      const result = await repriceCartAction(payload);
      if (!cancelled) setEntry({ signature, result });
    });

    return () => {
      cancelled = true;
    };
  }, [hydrated, items, signature]);

  // Only trust a result that describes the cart as it stands right now.
  const priced = entry && entry.signature === signature ? entry.result : null;

  // Nothing is rendered until localStorage has been read, so the server HTML
  // and the first client render agree.
  if (!hydrated) {
    return <p className="py-16 text-center text-ink-muted">Loading your cart…</p>;
  }

  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-line bg-surface px-6 py-16 text-center">
        <p className="font-display text-xl font-semibold text-earth-900">Your cart is empty.</p>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-ink-muted">
          Once you add something, it will stay here even if you close the tab.
        </p>
        <Button asChild size="lg" className="mt-8">
          <Link href="/products">Browse products</Link>
        </Button>
      </div>
    );
  }

  const repriceFailed = priced !== null && 'invalid' in priced;
  const hasIssues = priced !== null && priced.ok === false && !('invalid' in priced);
  const verified = priced !== null && priced.ok === true;

  const subtotal = verified ? priced.subtotalPaise : indicativeSubtotalPaise;
  const savings = verified ? priced.discountPaise : 0;
  const shipping = verified ? priced.shippingPaise : 0;
  // Configured but state-dependent (Tamil Nadu vs. rest of India) and no
  // address collected yet means `shipping` above is only the default rate —
  // showing it as settled would be wrong for every Tamil Nadu order.
  const shippingKnown = verified && priced.shippingConfigured && !priced.shippingStateDependent;
  const total = verified ? priced.totalPaise : indicativeSubtotalPaise;

  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_22rem] lg:gap-14">
      <section aria-label="Cart items">
        <ul className="divide-y divide-line border-y border-line">
          {items.map((item) => {
            const issue =
              hasIssues && !('invalid' in priced)
                ? priced.issues.find((i) => i.variantId === item.variantId)
                : undefined;

            return (
              <li key={item.variantId} className="flex gap-4 py-5">
                <div className="relative size-20 shrink-0 overflow-hidden rounded-xl bg-green-50 sm:size-24">
                  {item.imageUrl ? (
                    <Image
                      src={item.imageUrl}
                      alt=""
                      fill
                      sizes="96px"
                      className="object-cover"
                    />
                  ) : (
                    <span
                      aria-hidden
                      className="flex h-full items-center justify-center font-display text-2xl font-semibold text-green-200"
                    >
                      {item.productName.replace(/^SSG\s+/i, '').charAt(0)}
                    </span>
                  )}
                </div>

                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <h2 className="text-sm font-semibold text-earth-900 sm:text-base">
                    <Link
                      href={`/products/${item.productSlug}`}
                      className="hover:text-green-800 hover:underline"
                    >
                      {item.productName}
                    </Link>
                  </h2>
                  <p className="text-sm text-ink-muted">{item.variantName}</p>

                  {issue ? (
                    <p role="alert" className="text-sm font-medium text-[--color-danger]">
                      {issue.message}
                    </p>
                  ) : null}

                  <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-2">
                    <div className="flex items-center rounded-full border border-line">
                      <button
                        type="button"
                        onClick={() => setQuantity(item.variantId, item.quantity - 1)}
                        aria-label={`Decrease quantity of ${item.productName} ${item.variantName}`}
                        className="flex size-9 items-center justify-center rounded-full text-stone-700 hover:bg-green-50"
                      >
                        <Minus className="size-3.5" aria-hidden />
                      </button>
                      <span className="w-8 text-center text-sm font-semibold tabular-nums">
                        {item.quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => setQuantity(item.variantId, item.quantity + 1)}
                        disabled={item.quantity >= 99}
                        aria-label={`Increase quantity of ${item.productName} ${item.variantName}`}
                        className="flex size-9 items-center justify-center rounded-full text-stone-700 hover:bg-green-50 disabled:opacity-40"
                      >
                        <Plus className="size-3.5" aria-hidden />
                      </button>

                      <button
                        type="button"
                        onClick={() => remove(item.variantId)}
                        aria-label={`Remove ${item.productName} ${item.variantName} from cart`}
                        className="ml-1 flex size-9 items-center justify-center rounded-full text-stone-500 hover:bg-[--color-danger-surface] hover:text-[--color-danger]"
                      >
                        <Trash2 className="size-3.5" aria-hidden />
                      </button>
                    </div>

                    <p className="text-sm font-semibold tabular-nums text-earth-900">
                      {formatPaise(item.sellingPricePaise * item.quantity)}
                    </p>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>

        <Button asChild variant="ghost" className="mt-6">
          <Link href="/products">← Continue shopping</Link>
        </Button>
      </section>

      {/* ---- Summary ------------------------------------------------------ */}
      <aside aria-labelledby="summary-heading" className="lg:sticky lg:top-28 lg:self-start">
        <div className="rounded-2xl border border-line bg-surface p-6">
          <h2 id="summary-heading" className="font-display text-lg font-semibold text-earth-900">
            Order summary
          </h2>

          <dl className="mt-5 space-y-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-ink-muted">Subtotal</dt>
              <dd className="font-medium tabular-nums text-earth-900">{formatPaise(subtotal)}</dd>
            </div>

            {savings > 0 ? (
              <div className="flex justify-between">
                <dt className="text-green-700">You save</dt>
                <dd className="font-medium tabular-nums text-green-700">
                  −{formatPaise(savings)}
                </dd>
              </div>
            ) : null}

            <div className="flex justify-between">
              <dt className="text-ink-muted">Shipping</dt>
              <dd className="font-medium tabular-nums text-earth-900">
                {/*
                  An unconfigured shipping rate says so. Printing "FREE" would
                  be a promise the store owner never made. A state-dependent
                  rate (Tamil Nadu vs. rest of India) with no address yet gets
                  its own distinct wording — it is not unconfigured, it is
                  just not confirmed for THIS customer until checkout knows
                  where they are shipping to.
                */}
                {!verified
                  ? '—'
                  : shippingKnown
                    ? shipping === 0
                      ? 'Free'
                      : formatPaise(shipping)
                    : priced && priced.ok && priced.shippingStateDependent
                      ? 'Confirmed at checkout'
                      : 'Calculated separately'}
              </dd>
            </div>

            <div className="flex justify-between border-t border-line pt-3">
              <dt className="font-display text-base font-semibold text-earth-900">Total</dt>
              <dd className="font-display text-lg font-semibold tabular-nums text-earth-900">
                {formatPaise(total)}
              </dd>
            </div>
          </dl>

          {repriceFailed ? (
            <p
              role="alert"
              className="mt-5 rounded-xl border border-gold-400/50 bg-[--color-warning-surface] px-4 py-3 text-sm text-[--color-warning]"
            >
              {(priced as { invalid: string }).invalid}
            </p>
          ) : null}

          {hasIssues ? (
            <p
              role="alert"
              className="mt-5 rounded-xl border border-[--color-danger]/25 bg-[--color-danger-surface] px-4 py-3 text-sm text-[--color-danger]"
            >
              Please remove or adjust the items marked above before checking out.
            </p>
          ) : null}

          <Button
            asChild={!hasIssues && !repriceFailed}
            size="lg"
            full
            className="mt-6"
            disabled={hasIssues || repriceFailed || isPending}
          >
            {hasIssues || repriceFailed ? (
              <span>Checkout unavailable</span>
            ) : (
              <Link href="/checkout">{isPending ? 'Checking prices…' : 'Proceed to checkout'}</Link>
            )}
          </Button>

          <p className="mt-4 text-xs leading-relaxed text-ink-muted">
            Prices are confirmed against our records again when your order is
            placed.
          </p>
        </div>
      </aside>
    </div>
  );
}
