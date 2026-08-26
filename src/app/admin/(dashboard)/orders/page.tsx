import Link from 'next/link';

import { PaymentStatusBadge } from '@/components/admin/payment-status-badge';
import { StatusBadge } from '@/components/admin/status-badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { formatPaise } from '@/lib/money';
import { createClient } from '@/lib/supabase/server';
import { cn } from '@/lib/utils';
import type { OrderStatus, PaymentStatus } from '@/lib/database.types';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 20;

type OrderRow = {
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
 * Resolves a search term to matching customer ids before the main query.
 *
 * `orders` has no name/email column of its own — those live on the related
 * `customers` row. PostgREST can filter an embedded resource, but only turns
 * that into a filter on the PARENT rows when the relationship is hinted
 * `!inner`, and mixing that with a plain `order_number` condition in one
 * `.or()` string is exactly the kind of query that reads as correct and
 * silently returns the wrong rows. Resolving customer ids first and folding
 * them into a plain `customer_id.in.(...)` condition keeps the real query a
 * single ordinary filter on `orders` itself — the case this function is
 * guarding against is worth the extra round trip.
 */
async function resolveCustomerIds(
  supabase: Awaited<ReturnType<typeof createClient>>,
  term: string,
): Promise<string[]> {
  const safe = term.replace(/[%_,()]/g, '');
  if (!safe) return [];

  const { data } = await supabase
    .from('customers')
    .select('id')
    .or(`name.ilike.%${safe}%,email.ilike.%${safe}%`)
    .limit(100);

  return (data ?? []).map((c) => c.id);
}

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; payment?: string; page?: string }>;
}) {
  const params = await searchParams;
  const query = (params.q ?? '').trim();
  const statusFilter = (params.status ?? 'all') as OrderStatus | 'all';
  const paymentFilter = (params.payment ?? 'all') as PaymentStatus | 'all';
  const page = Math.max(1, Number.parseInt(params.page ?? '1', 10) || 1);

  const supabase = await createClient();

  let request = supabase
    .from('orders')
    .select(
      `id, order_number, created_at, status, payment_status, total_paise,
       customers ( name, email ),
       order_items ( quantity ),
       shipments ( courier_name, tracking_id )`,
      { count: 'exact' },
    )
    .order('created_at', { ascending: false });

  if (statusFilter !== 'all') request = request.eq('status', statusFilter);
  if (paymentFilter !== 'all') request = request.eq('payment_status', paymentFilter);

  if (query) {
    const safe = query.replace(/[%_,()]/g, '');
    const customerIds = await resolveCustomerIds(supabase, query);

    const conditions: string[] = [];
    if (safe) conditions.push(`order_number.ilike.%${safe}%`);
    if (customerIds.length > 0) conditions.push(`customer_id.in.(${customerIds.join(',')})`);

    // Both stripped to nothing (e.g. a search of only punctuation) — match
    // nothing rather than silently ignoring the filter and showing everyone.
    if (conditions.length === 0) {
      request = request.eq('id', '00000000-0000-0000-0000-000000000000');
    } else {
      request = request.or(conditions.join(','));
    }
  }

  const from = (page - 1) * PAGE_SIZE;
  const { data, error, count } = await request.range(from, from + PAGE_SIZE - 1);

  const orders = (data ?? []) as unknown as OrderRow[];
  const total = count ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  /** Preserves the current filters when building a pagination link. */
  function pageHref(target: number): string {
    const p = new URLSearchParams();
    if (query) p.set('q', query);
    if (statusFilter !== 'all') p.set('status', statusFilter);
    if (paymentFilter !== 'all') p.set('payment', paymentFilter);
    if (target > 1) p.set('page', String(target));
    const qs = p.toString();
    return qs ? `/admin/orders?${qs}` : '/admin/orders';
  }

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold text-earth-900">Orders</h1>

      {/* A GET form, so a filtered view is linkable and survives a refresh. */}
      <form method="get" className="mt-6 flex flex-wrap gap-3">
        <div className="min-w-56 flex-1">
          <label htmlFor="q" className="sr-only">
            Search orders
          </label>
          <input
            id="q"
            name="q"
            defaultValue={query}
            placeholder="Order number, customer name or email"
            className="w-full rounded-lg border border-line bg-white px-3 py-2.5 text-sm focus:border-green-600"
          />
        </div>
        <div>
          <label htmlFor="status" className="sr-only">
            Order status
          </label>
          <select
            id="status"
            name="status"
            defaultValue={statusFilter}
            className="rounded-lg border border-line bg-white px-3 py-2.5 text-sm focus:border-green-600"
          >
            <option value="all">All statuses</option>
            <option value="placed">Placed</option>
            <option value="confirmed">Confirmed</option>
            <option value="processing">Processing</option>
            <option value="packed">Packed</option>
            <option value="shipped">Shipped</option>
            <option value="out_for_delivery">Out for delivery</option>
            <option value="delivered">Delivered</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
        <div>
          <label htmlFor="payment" className="sr-only">
            Payment status
          </label>
          <select
            id="payment"
            name="payment"
            defaultValue={paymentFilter}
            className="rounded-lg border border-line bg-white px-3 py-2.5 text-sm focus:border-green-600"
          >
            <option value="all">All payments</option>
            <option value="pending">Pending</option>
            <option value="paid">Paid</option>
            <option value="failed">Failed</option>
            <option value="refunded">Refunded</option>
          </select>
        </div>
        <Button type="submit" variant="subtle">
          Filter
        </Button>
      </form>

      {error ? (
        <p
          role="alert"
          className="mt-6 rounded-xl border border-[--color-danger]/25 bg-[--color-danger-surface] p-5 text-sm text-[--color-danger]"
        >
          Unable to load orders: {error.message}
        </p>
      ) : orders.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-line bg-white p-10 text-center">
          <p className="font-display text-lg font-semibold text-earth-900">
            {query || statusFilter !== 'all' || paymentFilter !== 'all'
              ? 'No orders match that filter.'
              : 'No orders yet.'}
          </p>
          <p className="mt-2 text-sm text-stone-500">
            {query || statusFilter !== 'all' || paymentFilter !== 'all'
              ? ''
              : 'They will appear here as customers check out.'}
          </p>
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-2xl border border-line bg-white">
          <table className="w-full min-w-3xl text-sm">
            <caption className="sr-only">
              Orders{query ? ` matching "${query}"` : ''}, page {page} of {pageCount}
            </caption>
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-stone-500">
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
      )}

      {pageCount > 1 ? (
        <nav
          aria-label="Orders pagination"
          className="mt-6 flex items-center justify-between text-sm text-stone-600"
        >
          <p>
            Page {page} of {pageCount} — {total} order{total === 1 ? '' : 's'}
          </p>
          <div className="flex gap-2">
            <PageLink disabled={page <= 1} href={pageHref(Math.max(1, page - 1))}>
              Previous
            </PageLink>
            <PageLink disabled={page >= pageCount} href={pageHref(Math.min(pageCount, page + 1))}>
              Next
            </PageLink>
          </div>
        </nav>
      ) : null}
    </div>
  );
}

/**
 * A pagination link that is genuinely inert when disabled.
 *
 * `<Button asChild disabled>` wrapping a `Link` does not work: the CSS
 * `disabled:` variant only matches real form controls, and Next's `Link`
 * still renders a clickable `<a>` regardless of any `disabled` attribute
 * handed to it. Rendering a plain, unlinked `<span>` in that case is what
 * actually stops navigation, not just what looks like it does.
 */
function PageLink({
  href,
  disabled,
  children,
}: {
  href: string;
  disabled: boolean;
  children: React.ReactNode;
}) {
  const classes = buttonVariants({ variant: 'subtle', size: 'sm' });

  if (disabled) {
    return (
      <span aria-disabled="true" className={cn(classes, 'opacity-50')}>
        {children}
      </span>
    );
  }

  return (
    <Link href={href} className={classes}>
      {children}
    </Link>
  );
}
