import { Check, Truck } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { formatPaise } from '@/lib/money';
import { cn } from '@/lib/utils';
import type { OrderStatus } from '@/lib/database.types';

/**
 * Order detail + status timeline.
 *
 * Extracted from the original /track-order page so account order detail
 * (/account/orders/[id]) renders identically rather than reimplementing
 * tracking a second time — the brief is explicit that there should be one
 * tracking system, not two. Both the public tracking form and the
 * authenticated account view feed this the same shape of data; the only
 * difference between them is how that data was authorized (contact match vs.
 * session ownership), not how it is displayed.
 */

export type OrderDetailData = {
  orderNumber: string;
  status: OrderStatus;
  placedAt: string;
  subtotalPaise: number;
  discountPaise: number;
  shippingPaise: number;
  totalPaise: number;
  items: {
    productName: string;
    variantName: string;
    quantity: number;
    pricePaise: number;
    subtotalPaise: number;
  }[];
  shippingAddress: {
    name: string;
    address: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  } | null;
  shipment: {
    courierName: string;
    trackingId: string;
    trackingUrl: string | null;
    shippedAt: string;
  } | null;
};

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

export function OrderDetailCard({ order }: { order: OrderDetailData }) {
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
