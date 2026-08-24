'use client';

import { useState } from 'react';
import { Check, Package, Truck } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { formatPaise } from '@/lib/money';
import { cn } from '@/lib/utils';
import { trackOrderAction, type TrackedOrder } from '@/server/actions/track-actions';
import type { OrderStatus } from '@/lib/database.types';

/**
 * Order tracking.
 *
 * One message for "wrong contact" and "no such order" — see the reasoning in
 * track-actions.ts. Distinguishing them would confirm which order numbers are
 * real to anyone probing the form.
 */

/** The happy path, in order. `cancelled` is handled separately. */
const TIMELINE: { status: OrderStatus; label: string }[] = [
  { status: 'placed', label: 'Order placed' },
  { status: 'confirmed', label: 'Order confirmed' },
  { status: 'processing', label: 'Processing' },
  { status: 'packed', label: 'Packed' },
  { status: 'shipped', label: 'Shipped' },
  { status: 'out_for_delivery', label: 'Out for delivery' },
  { status: 'delivered', label: 'Delivered' },
];

export function TrackForm({ initialOrderNumber = '' }: { initialOrderNumber?: string }) {
  const [order, setOrder] = useState<TrackedOrder | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    const form = new FormData(event.currentTarget);
    const result = await trackOrderAction({
      orderNumber: String(form.get('orderNumber') ?? ''),
      contact: String(form.get('contact') ?? ''),
    });

    if (result.ok) {
      setOrder(result.order);
    } else {
      setOrder(null);
      setError(result.error);
    }
    setPending(false);
  }

  return (
    <div className="grid gap-12 lg:grid-cols-[20rem_1fr] lg:gap-16">
      <form onSubmit={handleSubmit} noValidate className="lg:sticky lg:top-28 lg:self-start">
        <div className="rounded-2xl border border-line bg-surface p-6">
          <div>
            <label htmlFor="orderNumber" className="block text-sm font-medium text-earth-900">
              Order number
            </label>
            <p id="orderNumber-hint" className="mt-1 text-xs text-ink-muted">
              From your confirmation email, e.g. SSG-20260824-0001
            </p>
            <input
              id="orderNumber"
              name="orderNumber"
              required
              defaultValue={initialOrderNumber}
              aria-describedby="orderNumber-hint"
              placeholder="SSG-20260824-0001"
              className="mt-2 w-full rounded-xl border border-line bg-surface px-3.5 py-3 text-base text-earth-900 placeholder:text-stone-400 focus:border-green-600"
            />
          </div>

          <div className="mt-5">
            <label htmlFor="contact" className="block text-sm font-medium text-earth-900">
              Email or phone
            </label>
            <p id="contact-hint" className="mt-1 text-xs text-ink-muted">
              Whichever you used when ordering.
            </p>
            <input
              id="contact"
              name="contact"
              required
              aria-describedby="contact-hint"
              className="mt-2 w-full rounded-xl border border-line bg-surface px-3.5 py-3 text-base text-earth-900 focus:border-green-600"
            />
          </div>

          <Button type="submit" size="lg" full className="mt-6" disabled={pending}>
            {pending ? 'Looking up…' : 'Track order'}
          </Button>

          {error ? (
            <p
              role="alert"
              className="mt-5 rounded-xl border border-[--color-danger]/25 bg-[--color-danger-surface] px-4 py-3 text-sm text-[--color-danger]"
            >
              {error}
            </p>
          ) : null}
        </div>
      </form>

      <div aria-live="polite">
        {order ? <OrderDetail order={order} /> : <Placeholder />}
      </div>
    </div>
  );
}

function Placeholder() {
  return (
    <div className="flex h-full min-h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-line bg-surface p-10 text-center">
      <Package className="size-8 text-green-300" aria-hidden />
      <p className="mt-4 font-display text-lg font-semibold text-earth-900">
        Enter your details to see your order
      </p>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-ink-muted">
        We ask for both the order number and your contact so nobody else can
        look up your delivery address.
      </p>
    </div>
  );
}

function OrderDetail({ order }: { order: TrackedOrder }) {
  const cancelled = order.status === 'cancelled';
  const currentIndex = TIMELINE.findIndex((step) => step.status === order.status);

  return (
    <div className="rounded-2xl border border-line bg-surface p-6 sm:p-8">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="font-display text-2xl font-semibold text-earth-900">
          {order.orderNumber}
        </h2>
        <p className="text-sm text-ink-muted">
          Placed{' '}
          {new Date(order.placedAt).toLocaleDateString('en-IN', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })}
        </p>
      </div>

      {/* ---- Timeline ---------------------------------------------------- */}
      {cancelled ? (
        <p className="mt-6 rounded-xl border border-[--color-danger]/25 bg-[--color-danger-surface] px-4 py-3 text-sm font-medium text-[--color-danger]">
          This order was cancelled.
        </p>
      ) : (
        <ol className="mt-8 space-y-0">
          {TIMELINE.map((step, index) => {
            const done = index <= currentIndex;
            const isCurrent = index === currentIndex;
            const isLast = index === TIMELINE.length - 1;

            return (
              <li key={step.status} className="flex gap-4">
                <div className="flex flex-col items-center">
                  <span
                    className={cn(
                      'flex size-7 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
                      done
                        ? 'border-green-600 bg-green-600 text-white'
                        : 'border-stone-300 bg-surface text-transparent',
                    )}
                  >
                    <Check className="size-3.5" aria-hidden />
                  </span>
                  {!isLast ? (
                    <span
                      aria-hidden
                      className={cn(
                        'w-0.5 flex-1 transition-colors',
                        index < currentIndex ? 'bg-green-600' : 'bg-stone-200',
                      )}
                      style={{ minHeight: '1.75rem' }}
                    />
                  ) : null}
                </div>

                <p
                  className={cn(
                    'pb-6 text-sm',
                    isCurrent
                      ? 'font-semibold text-earth-900'
                      : done
                        ? 'text-stone-600'
                        : 'text-stone-400',
                  )}
                >
                  {step.label}
                  {isCurrent ? <span className="sr-only"> — current status</span> : null}
                </p>
              </li>
            );
          })}
        </ol>
      )}

      {/* ---- Shipment ---------------------------------------------------- */}
      {order.shipment ? (
        <div className="mt-2 rounded-xl bg-green-50 p-5">
          <h3 className="flex items-center gap-2 font-display text-base font-semibold text-green-900">
            <Truck className="size-4" aria-hidden />
            Shipment
          </h3>
          <dl className="mt-3 space-y-1.5 text-sm">
            <div className="flex gap-2">
              <dt className="text-ink-muted">Courier:</dt>
              <dd className="font-medium text-earth-900">{order.shipment.courierName}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-ink-muted">Tracking ID:</dt>
              <dd className="font-medium text-earth-900">{order.shipment.trackingId}</dd>
            </div>
          </dl>
          {order.shipment.trackingUrl ? (
            <Button asChild size="sm" className="mt-4">
              <a href={order.shipment.trackingUrl} target="_blank" rel="noopener noreferrer">
                Track shipment
              </a>
            </Button>
          ) : null}
        </div>
      ) : null}

      {/* ---- Items ------------------------------------------------------- */}
      <h3 className="mt-8 font-display text-base font-semibold text-earth-900">Items</h3>
      <ul className="mt-3 divide-y divide-line border-y border-line">
        {order.items.map((item, index) => (
          <li key={`${item.productName}-${index}`} className="flex justify-between gap-4 py-3 text-sm">
            <span className="text-stone-700">
              {item.productName}
              <span className="block text-xs text-ink-muted">
                {item.variantName} × {item.quantity}
              </span>
            </span>
            <span className="shrink-0 font-medium tabular-nums text-earth-900">
              {formatPaise(item.subtotalPaise)}
            </span>
          </li>
        ))}
      </ul>

      <dl className="mt-4 space-y-2 text-sm">
        <div className="flex justify-between">
          <dt className="text-ink-muted">Subtotal</dt>
          <dd className="tabular-nums text-earth-900">{formatPaise(order.subtotalPaise)}</dd>
        </div>
        {order.discountPaise > 0 ? (
          <div className="flex justify-between text-green-700">
            <dt>You saved</dt>
            <dd className="tabular-nums">−{formatPaise(order.discountPaise)}</dd>
          </div>
        ) : null}
        <div className="flex justify-between">
          <dt className="text-ink-muted">Shipping</dt>
          <dd className="tabular-nums text-earth-900">
            {order.shippingPaise > 0 ? formatPaise(order.shippingPaise) : 'Free'}
          </dd>
        </div>
        <div className="flex justify-between border-t border-line pt-2">
          <dt className="font-display font-semibold text-earth-900">Total</dt>
          <dd className="font-display font-semibold tabular-nums text-earth-900">
            {formatPaise(order.totalPaise)}
          </dd>
        </div>
      </dl>

      {order.shippingAddress ? (
        <>
          <h3 className="mt-8 font-display text-base font-semibold text-earth-900">
            Delivering to
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-stone-600">
            {order.shippingAddress.name}
            <br />
            {order.shippingAddress.address}
            <br />
            {order.shippingAddress.city}, {order.shippingAddress.state}{' '}
            {order.shippingAddress.postalCode}
            <br />
            {order.shippingAddress.country}
          </p>
        </>
      ) : null}
    </div>
  );
}
