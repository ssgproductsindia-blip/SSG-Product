'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

import { PaymentStatusBadge } from '@/components/admin/payment-status-badge';
import { STATUS_LABELS, STATUS_SEQUENCE, StatusBadge } from '@/components/admin/status-badge';
import { Button } from '@/components/ui/button';
import { formatPaise } from '@/lib/money';
import { cn } from '@/lib/utils';
import { bulkUpdateOrderStatusAction } from '@/server/actions/order-actions';
import type { OrderStatus, PaymentStatus } from '@/lib/database.types';

export type OrderRow = {
  id: string;
  order_number: string;
  created_at: string;
  status: OrderStatus;
  payment_status: PaymentStatus;
  total_paise: number;
  customers: { name: string; email: string } | null;
  order_items: { quantity: number }[];
  shipments: { courier_name: string; tracking_id: string } | null;
};

/**
 * The orders table, plus the checkbox-driven bulk status action above it.
 *
 * A client component so selection state can live in the browser, but the
 * data itself still comes from the server page as props — this component
 * never fetches on its own. After a bulk change, `router.refresh()` re-runs
 * the server page so the table reflects what the database actually has,
 * rather than the client guessing at the new state locally.
 *
 * Cancelled orders are shown but not selectable: their status cannot be
 * changed further (matches the single-order form's own rule), so offering a
 * checkbox for them would just produce a per-row failure in the bulk result.
 */
export function OrdersTable({ orders }: { orders: OrderRow[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkStatus, setBulkStatus] = useState<OrderStatus>('confirmed');
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  const selectableIds = orders.filter((o) => o.status !== 'cancelled').map((o) => o.id);
  const selectedCount = selected.size;
  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selected.has(id));

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(selectableIds));
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function applyBulkStatus() {
    if (selectedCount === 0) return;

    if (
      bulkStatus === 'cancelled' &&
      !window.confirm(
        `Cancel ${selectedCount} order${selectedCount === 1 ? '' : 's'}? Stock for their items will be restored. This cannot be undone from here.`,
      )
    ) {
      return;
    }

    setResult(null);
    startTransition(async () => {
      const res = await bulkUpdateOrderStatusAction({
        orderIds: Array.from(selected),
        status: bulkStatus,
      });
      setResult(res.ok ? { ok: true, message: res.message } : { ok: false, message: res.error });
      if (res.ok) setSelected(new Set());
      router.refresh();
    });
  }

  return (
    <>
      {selectedCount > 0 ? (
        <div className="mt-6 flex flex-wrap items-center gap-3 rounded-2xl border border-green-200 bg-green-50 px-4 py-3">
          <p className="text-sm font-medium text-green-900">
            {selectedCount} order{selectedCount === 1 ? '' : 's'} selected
          </p>
          <label htmlFor="bulk-status" className="sr-only">
            New status for selected orders
          </label>
          <select
            id="bulk-status"
            value={bulkStatus}
            onChange={(e) => setBulkStatus(e.target.value as OrderStatus)}
            className="rounded-lg border border-line bg-white px-3 py-2 text-sm focus:border-green-600"
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
            size="sm"
            variant={bulkStatus === 'cancelled' ? 'danger' : 'primary'}
            disabled={pending}
            onClick={applyBulkStatus}
          >
            {pending ? 'Applying…' : 'Apply'}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() => setSelected(new Set())}
          >
            Clear selection
          </Button>
        </div>
      ) : null}

      {result ? (
        <p
          role={result.ok ? 'status' : 'alert'}
          className={cn(
            'mt-4 text-sm',
            result.ok ? 'text-green-700' : 'text-[--color-danger]',
          )}
        >
          {result.message}
        </p>
      ) : null}

      <div className="mt-6 overflow-x-auto rounded-2xl border border-line bg-white">
        <table className="w-full min-w-3xl text-sm">
          <caption className="sr-only">Orders on this page</caption>
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-stone-500">
              <th scope="col" className="w-10 px-4 py-3">
                <input
                  ref={(el) => {
                    if (el) el.indeterminate = selectedCount > 0 && !allSelected;
                  }}
                  type="checkbox"
                  aria-label="Select all orders on this page"
                  checked={allSelected}
                  onChange={toggleAll}
                  disabled={selectableIds.length === 0}
                  className="size-4 rounded border-line accent-green-700"
                />
              </th>
              <th scope="col" className="px-4 py-3 font-medium">Order</th>
              <th scope="col" className="px-4 py-3 font-medium">Customer</th>
              <th scope="col" className="px-4 py-3 font-medium">Date</th>
              <th scope="col" className="px-4 py-3 text-right font-medium">Amount</th>
              <th scope="col" className="px-4 py-3 font-medium">Status</th>
              <th scope="col" className="px-4 py-3 font-medium">Payment</th>
              <th scope="col" className="px-4 py-3 font-medium">Tracking</th>
              <th scope="col" className="px-4 py-3 font-medium">
                <span className="sr-only">Action</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {orders.map((order) => (
              <tr key={order.id} className="hover:bg-stone-50">
                <td className="px-4 py-3">
                  <input
                    type="checkbox"
                    aria-label={`Select order ${order.order_number}`}
                    checked={selected.has(order.id)}
                    onChange={() => toggleOne(order.id)}
                    disabled={order.status === 'cancelled'}
                    className="size-4 rounded border-line accent-green-700"
                  />
                </td>
                <td className="px-4 py-3 font-medium text-earth-900">{order.order_number}</td>
                <td className="px-4 py-3">
                  <p className="text-stone-700">{order.customers?.name ?? '—'}</p>
                  <p className="text-xs text-stone-500">{order.customers?.email ?? ''}</p>
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-stone-500">
                  {new Date(order.created_at).toLocaleDateString('en-IN', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}
                </td>
                <td className="px-4 py-3 text-right font-medium tabular-nums text-earth-900">
                  {formatPaise(order.total_paise)}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={order.status} />
                </td>
                <td className="px-4 py-3">
                  <PaymentStatusBadge status={order.payment_status} />
                </td>
                <td className="px-4 py-3 text-xs text-stone-500">
                  {order.shipments ? (
                    <>
                      {order.shipments.courier_name}
                      <br />
                      {order.shipments.tracking_id}
                    </>
                  ) : (
                    '—'
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={`/admin/orders/${order.order_number}`}
                    className="font-medium text-green-800 hover:underline"
                  >
                    View
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
