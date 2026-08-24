import type { Metadata } from 'next';

import { TrackForm } from './track-form';

export const metadata: Metadata = {
  title: 'Track your order',
  description: 'Check the status of your SSG Products order.',
  alternates: { canonical: '/track-order' },
  // Indexable — customers search for this. Nothing is exposed without the
  // order number and the contact on the order.
  robots: { index: true, follow: true },
};

export default async function TrackOrderPage({
  searchParams,
}: {
  searchParams: Promise<{ order?: string }>;
}) {
  const params = await searchParams;

  // Pre-fill only the order number, never the contact. The whole point of
  // asking for two things is that one of them is not in the URL.
  const initial = /^SSG-\d{8}-\d{4}$/i.test(params.order ?? '')
    ? (params.order as string).toUpperCase()
    : '';

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
      <header className="max-w-xl">
        <h1 className="font-display text-3xl font-semibold tracking-tight text-earth-900 sm:text-4xl">
          Track your order
        </h1>
        <p className="mt-4 text-lg leading-relaxed text-stone-600">
          Enter your order number along with the email or phone number you used
          when ordering.
        </p>
      </header>

      <div className="mt-10">
        <TrackForm initialOrderNumber={initial} />
      </div>
    </div>
  );
}
