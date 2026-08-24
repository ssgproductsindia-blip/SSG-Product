import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';

import { formatPaise } from '@/lib/money';
import { createClient } from '@/lib/supabase/server';
import { StatusBadge } from '@/components/admin/status-badge';
import { cn } from '@/lib/utils';
import type { OrderStatus } from '@/lib/database.types';

export const dynamic = 'force-dynamic';

/**
 * Admin dashboard.
 *
 * Reads through the RLS-bound client, so every figure here is one an admin is
 * actually permitted to see. If a policy were wrong, this page would break
 * loudly in development rather than quietly working via a service key that
 * ignores policies entirely.
 */
export default async function AdminDashboardPage() {
  const supabase = await createClient();

  const [ordersResult, productsResult, recentResult] = await Promise.all([
    supabase.from('orders').select('status, total_paise, payment_status'),
    supabase.from('products').select('id, is_active'),
    supabase
      .from('orders')
      .select('id, order_number, total_paise, status, created_at, customers(name)')
      .order('created_at', { ascending: false })
      .limit(8),
  ]);

  const orders = ordersResult.data ?? [];
  const products = productsResult.data ?? [];
  const recent = (recentResult.data ?? []) as unknown as {
    id: string;
    order_number: string;
    total_paise: number;
    status: OrderStatus;
    created_at: string;
    customers: { name: string } | null;
  }[];

  const countBy = (status: OrderStatus) => orders.filter((o) => o.status === status).length;

  // Cancelled orders are excluded from revenue. Counting them would report
  // money that was never collected and will never be collected.
  const grossPaise = orders
    .filter((o) => o.status !== 'cancelled')
    .reduce((sum, o) => sum + o.total_paise, 0);

  const awaitingShipment =
    countBy('placed') + countBy('confirmed') + countBy('processing') + countBy('packed');

  const stats = [
    { label: 'Total orders', value: String(orders.length) },
    { label: 'Awaiting shipment', value: String(awaitingShipment), highlight: awaitingShipment > 0 },
    { label: 'Shipped', value: String(countBy('shipped') + countBy('out_for_delivery')) },
    { label: 'Delivered', value: String(countBy('delivered')) },
    { label: 'Order value', value: formatPaise(grossPaise), hint: 'Excludes cancelled' },
    {
      label: 'Products',
      value: `${products.filter((p) => p.is_active).length} / ${products.length}`,
      hint: 'Published / total',
    },
  ];

  const unpaid = orders.filter(
    (o) => o.payment_status === 'pending' && o.status !== 'cancelled',
  ).length;

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold text-earth-900">Dashboard</h1>

      <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {stats.map((stat) => (
          <li
            key={stat.label}
            className={cn(
              'rounded-2xl border bg-white p-5',
              stat.highlight ? 'border-gold-400' : 'border-line',
            )}
          >
            <p className="text-sm text-stone-500">{stat.label}</p>
            <p className="mt-1.5 font-display text-2xl font-semibold text-earth-900 tabular-nums">
              {stat.value}
            </p>
            {stat.hint ? <p className="mt-1 text-xs text-stone-400">{stat.hint}</p> : null}
          </li>
        ))}
      </ul>

      {/*
        Payments are not wired up yet, so every order is legitimately unpaid.
        Surfacing it stops that state from being mistaken for a payment bug —
        and stops it being forgotten once Razorpay is live.
      */}
      {unpaid > 0 ? (
        <p className="mt-6 flex items-start gap-3 rounded-2xl border border-gold-400/60 bg-[--color-warning-surface] p-5 text-sm text-[--color-warning]">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            <strong className="font-semibold">
              {unpaid} order{unpaid === 1 ? '' : 's'} awaiting payment.
            </strong>{' '}
            Online payment is not enabled yet, so orders are recorded as unpaid
            and must be collected manually.
          </span>
        </p>
      ) : null}

      <section aria-labelledby="recent-heading" className="mt-10">
        <div className="flex items-center justify-between">
          <h2 id="recent-heading" className="font-display text-lg font-semibold text-earth-900">
            Recent orders
          </h2>
          <Link href="/admin/orders" className="text-sm font-medium text-green-800 hover:underline">
            View all
          </Link>
        </div>

        {recent.length === 0 ? (
          <p className="mt-4 rounded-2xl border border-dashed border-line bg-white p-8 text-center text-sm text-stone-500">
            No orders yet. They will appear here as customers check out.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-2xl border border-line bg-white">
            <table className="w-full min-w-xl text-sm">
              <caption className="sr-only">The eight most recent orders</caption>
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-stone-500">
                  <th scope="col" className="px-4 py-3 font-medium">Order</th>
                  <th scope="col" className="px-4 py-3 font-medium">Customer</th>
                  <th scope="col" className="px-4 py-3 font-medium">Date</th>
                  <th scope="col" className="px-4 py-3 font-medium">Status</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {recent.map((order) => (
                  <tr key={order.id} className="hover:bg-stone-50">
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/orders/${order.order_number}`}
                        className="font-medium text-green-800 hover:underline"
                      >
                        {order.order_number}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-stone-700">{order.customers?.name ?? '—'}</td>
                    <td className="px-4 py-3 text-stone-500">
                      {new Date(order.created_at).toLocaleDateString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                      })}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={order.status} />
                    </td>
                    <td className="px-4 py-3 text-right font-medium tabular-nums text-earth-900">
                      {formatPaise(order.total_paise)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

