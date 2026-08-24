import type { Metadata } from 'next';
import Link from 'next/link';

import { StatusBadge } from '@/components/admin/status-badge';
import { formatPaise } from '@/lib/money';
import { getCustomer } from '@/server/customer-auth';
import { listCustomerOrders } from '@/server/customer-orders';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'My Orders',
  robots: { index: false, follow: false },
};

export default async function AccountOrdersPage() {
  const customer = (await getCustomer())!;
  const orders = await listCustomerOrders(customer.id);

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold text-earth-900">My Orders</h1>

      {orders.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-line bg-surface p-10 text-center">
          <p className="text-sm text-ink-muted">You haven&rsquo;t placed an order yet.</p>
          <Link
            href="/products"
            className="mt-3 inline-block text-sm font-medium text-green-800 hover:underline"
          >
            Browse products
          </Link>
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-2xl border border-line bg-surface">
          <table className="w-full min-w-2xl text-sm">
            <caption className="sr-only">Your orders</caption>
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-stone-500">
                <th scope="col" className="px-4 py-3 font-medium">Order</th>
                <th scope="col" className="px-4 py-3 font-medium">Date</th>
                <th scope="col" className="px-4 py-3 font-medium">Items</th>
                <th scope="col" className="px-4 py-3 font-medium">Status</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">Total</th>
                <th scope="col" className="px-4 py-3">
                  <span className="sr-only">View</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {orders.map((order) => (
                <tr key={order.orderNumber} className="hover:bg-stone-50">
                  <td className="px-4 py-3 font-medium text-earth-900">{order.orderNumber}</td>
                  <td className="px-4 py-3 text-stone-500">
                    {new Date(order.createdAt).toLocaleDateString('en-IN', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </td>
                  <td className="px-4 py-3 text-stone-700">
                    {order.firstProductName}
                    {order.itemCount > 1 ? ` +${order.itemCount - 1} more` : ''}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={order.status} />
                  </td>
                  <td className="px-4 py-3 text-right font-medium tabular-nums text-earth-900">
                    {formatPaise(order.totalPaise)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/account/orders/${order.orderNumber}`}
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
    </div>
  );
}
