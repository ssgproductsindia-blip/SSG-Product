import Link from 'next/link';
import { MapPin, MessageCircle, Package, User } from 'lucide-react';

import { getCustomer } from '@/server/customer-auth';
import { listCustomerOrders } from '@/server/customer-orders';
import { StatusBadge } from '@/components/admin/status-badge';
import { formatPaise } from '@/lib/money';

export const dynamic = 'force-dynamic';

/**
 * Account overview.
 *
 * requireCustomer() already ran in the layout, so `getCustomer()` here is
 * guaranteed non-null — it is called again only to read the display fields,
 * not to re-authorize.
 */
export default async function AccountOverviewPage() {
  const customer = (await getCustomer())!;
  const orders = await listCustomerOrders(customer.id);
  const recent = orders.slice(0, 3);

  const cards = [
    {
      href: '/account/orders',
      icon: Package,
      title: 'My Orders',
      body: orders.length > 0 ? `${orders.length} order${orders.length === 1 ? '' : 's'}` : 'View your orders',
    },
    {
      href: '/account/profile',
      icon: User,
      title: 'My Profile',
      body: customer.fullName || 'Add your details',
    },
    {
      href: '/account/addresses',
      icon: MapPin,
      title: 'Saved Addresses',
      body: 'Manage delivery addresses',
    },
    {
      href: '/contact',
      icon: MessageCircle,
      title: 'Need Help?',
      body: 'Contact SSG Products',
    },
  ] as const;

  return (
    <div>
      <ul className="grid gap-4 sm:grid-cols-2">
        {cards.map((card) => (
          <li key={card.href}>
            <Link
              href={card.href}
              className="flex items-start gap-4 rounded-2xl border border-line bg-surface p-5 transition-colors hover:border-green-300 hover:bg-green-50/40"
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-green-100 text-green-800">
                <card.icon className="size-5" aria-hidden />
              </span>
              <span>
                <span className="block font-display text-base font-semibold text-earth-900">
                  {card.title}
                </span>
                <span className="mt-0.5 block text-sm text-ink-muted">{card.body}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <section aria-labelledby="recent-orders-heading" className="mt-10">
        <div className="flex items-center justify-between">
          <h2 id="recent-orders-heading" className="font-display text-lg font-semibold text-earth-900">
            Recent orders
          </h2>
          {orders.length > 0 ? (
            <Link href="/account/orders" className="text-sm font-medium text-green-800 hover:underline">
              View all
            </Link>
          ) : null}
        </div>

        {recent.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-dashed border-line bg-surface p-8 text-center">
            <p className="text-sm text-ink-muted">You haven&rsquo;t placed an order yet.</p>
            <Link href="/products" className="mt-3 inline-block text-sm font-medium text-green-800 hover:underline">
              Browse products
            </Link>
          </div>
        ) : (
          <ul className="mt-4 space-y-3">
            {recent.map((order) => (
              <li key={order.orderNumber}>
                <Link
                  href={`/account/orders/${order.orderNumber}`}
                  className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-line bg-surface p-4 hover:border-green-300"
                >
                  <span className="font-medium text-earth-900">{order.orderNumber}</span>
                  <span className="text-sm text-ink-muted">{order.firstProductName}</span>
                  <span className="ml-auto text-sm font-medium tabular-nums text-earth-900">
                    {formatPaise(order.totalPaise)}
                  </span>
                  <StatusBadge status={order.status} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
