'use client';

import { useState } from 'react';

import { STATUS_LABELS, STATUS_SEQUENCE } from '@/components/admin/status-badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { updateOrderStatusAction } from '@/server/actions/order-actions';
import type { OrderStatus } from '@/lib/database.types';

/**
 * Order status control.
 *
 * `cancelled` is separated from the forward workflow in the picker itself —
 * it is listed after a visual break, not interleaved between "delivered" and
 * the others, because it is not a step in that sequence, it is an exit from
 * it. Selecting it asks for confirmation client-side (it restores stock and
 * cannot itself be undone) before the server is asked to do anything.
 */
export function OrderStatusForm({
  orderId,
  currentStatus,
}: {
  orderId: string;
  currentStatus: OrderStatus;
}) {
  const [status, setStatus] = useState<OrderStatus>(currentStatus);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  const cancelled = currentStatus === 'cancelled';

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (status === currentStatus) return;

    if (
      status === 'cancelled' &&
      !window.confirm(
        'Cancel this order? Stock for its items will be restored. This cannot be undone from here.',
      )
    ) {
      return;
    }

    setSubmitting(true);
    setResult(null);

    const res = await updateOrderStatusAction({ orderId, status });

    setResult(res.ok ? { ok: true, message: res.message } : { ok: false, message: res.error });
    setSubmitting(false);
  }

  if (cancelled) {
    return (
      <p className="mt-3 text-sm text-stone-500">
        This order is cancelled. Its status cannot be changed further.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-3">
      <label htmlFor="order-status" className="sr-only">
        Order status
      </label>
      <select
        id="order-status"
        value={status}
        onChange={(e) => {
          setStatus(e.target.value as OrderStatus);
          setResult(null);
        }}
        className="w-full rounded-lg border border-line bg-white px-3 py-2.5 text-sm focus:border-green-600"
      >
        {STATUS_SEQUENCE.map((s) => (
          <option key={s} value={s}>
            {STATUS_LABELS[s]}
          </option>
        ))}
        <option disabled>──────────</option>
        <option value="cancelled">{STATUS_LABELS.cancelled}</option>
      </select>

      <Button
        type="submit"
        size="sm"
        full
        className="mt-3"
        disabled={submitting || status === currentStatus}
        variant={status === 'cancelled' ? 'danger' : 'primary'}
      >
        {submitting ? 'Saving…' : status === 'cancelled' ? 'Cancel order' : 'Update status'}
      </Button>

      {result ? (
        <p
          role={result.ok ? 'status' : 'alert'}
          className={cn(
            'mt-3 text-sm',
            result.ok ? 'text-green-700' : 'text-[--color-danger]',
          )}
        >
          {result.message}
        </p>
      ) : null}
    </form>
  );
}
