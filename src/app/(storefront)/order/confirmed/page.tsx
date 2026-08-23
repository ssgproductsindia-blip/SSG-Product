import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { CheckCircle2 } from 'lucide-react';

import { Button } from '@/components/ui/button';

export const metadata: Metadata = {
  title: 'Order confirmed',
  robots: { index: false, follow: false },
};

/**
 * Order confirmation.
 *
 * Deliberately shows the order NUMBER and nothing else about the order — no
 * address, no items, no total. The order number arrives in a query string,
 * which means it is in browser history, in any shared link, and in the
 * referrer header. Rendering order contents from an unauthenticated query
 * parameter would let anyone with a valid order number read a stranger's
 * delivery address.
 *
 * Full order details live behind /track-order, which requires the order
 * number AND the email or phone on the order.
 */
export default async function OrderConfirmedPage({
  searchParams,
}: {
  searchParams: Promise<{ order?: string; email?: string }>;
}) {
  const params = await searchParams;
  const orderNumber = params.order?.trim().toUpperCase() ?? '';

  // Validate the shape before echoing it back into the page.
  if (!/^SSG-\d{8}-\d{4}$/.test(orderNumber)) {
    redirect('/');
  }

  const emailSent = params.email === '1';

  return (
    <div className="mx-auto max-w-2xl px-4 py-16 text-center sm:px-6 sm:py-24">
      <CheckCircle2 className="mx-auto size-14 text-green-600" aria-hidden />

      <h1 className="mt-6 font-display text-3xl font-semibold tracking-tight text-earth-900 sm:text-4xl">
        Order placed
      </h1>

      <p className="mt-4 text-lg leading-relaxed text-stone-600">
        Thank you. Your order number is
      </p>

      <p className="mt-3 font-display text-2xl font-semibold tracking-tight text-green-800 tabular-nums">
        {orderNumber}
      </p>

      {emailSent ? (
        <p className="mt-6 text-sm leading-relaxed text-ink-muted">
          A confirmation email is on its way with your order details. Keep your
          order number — you&rsquo;ll need it to track your delivery.
        </p>
      ) : (
        /*
          The order is safely stored either way. Saying the email failed is
          strictly better than letting someone wait for a message that is never
          going to arrive.
        */
        <p
          role="status"
          className="mx-auto mt-6 max-w-md rounded-xl border border-gold-400/50 bg-[--color-warning-surface] px-4 py-3 text-sm leading-relaxed text-[--color-warning]"
        >
          <strong className="font-semibold">Your order is saved</strong>, but we
          could not send the confirmation email. Please write down your order
          number — you will need it to track your delivery, and we will be in
          touch.
        </p>
      )}

      <div className="mt-10 flex flex-wrap justify-center gap-3">
        <Button asChild size="lg">
          <Link href={`/track-order?order=${encodeURIComponent(orderNumber)}`}>
            Track this order
          </Link>
        </Button>
        <Button asChild size="lg" variant="outline">
          <Link href="/products">Continue shopping</Link>
        </Button>
      </div>
    </div>
  );
}
