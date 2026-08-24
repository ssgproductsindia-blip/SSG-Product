import Link from 'next/link';
import { notFound } from 'next/navigation';

import { OrderDetailCard } from '@/components/order/order-detail-card';
import { getCustomer } from '@/server/customer-auth';
import { getCustomerOrderDetail } from '@/server/customer-orders';

export const dynamic = 'force-dynamic';

export default async function AccountOrderDetailPage({
  params,
}: {
  params: Promise<{ orderNumber: string }>;
}) {
  const { orderNumber } = await params;
  const customer = (await getCustomer())!;

  const order = await getCustomerOrderDetail(customer.id, orderNumber);
  if (!order) notFound();

  return (
    <div>
      <nav aria-label="Breadcrumb" className="mb-6 text-sm">
        <Link href="/account/orders" className="text-stone-500 hover:text-green-800 hover:underline">
          ← My Orders
        </Link>
      </nav>

      <OrderDetailCard order={order} />
    </div>
  );
}
