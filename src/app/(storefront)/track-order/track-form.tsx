'use client';

import { useState } from 'react';
import { Package } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { OrderDetailCard } from '@/components/order/order-detail-card';
import { trackOrderAction, type TrackedOrder } from '@/server/actions/track-actions';

/**
 * Order tracking.
 *
 * One message for "wrong contact" and "no such order" — see the reasoning in
 * track-actions.ts. Distinguishing them would confirm which order numbers are
 * real to anyone probing the form.
 *
 * The result is rendered with <OrderDetailCard>, the same component the
 * signed-in account area uses for /account/orders/[id]. There is one
 * tracking display in this codebase, not two — this form and the account
 * page differ only in how they are authorized to see an order (contact
 * match here, session ownership there), never in how the order looks once
 * they can.
 */
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
        {order ? <OrderDetailCard order={order} /> : <Placeholder />}
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
