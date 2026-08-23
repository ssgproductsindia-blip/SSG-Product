import type { Metadata } from 'next';

import { paymentsConfigured } from '@/lib/env';

import { CheckoutForm } from './checkout-form';

export const metadata: Metadata = {
  title: 'Checkout',
  robots: { index: false, follow: false },
};

export default function CheckoutPage() {
  // Resolved on the server: whether payments are live is a function of which
  // secrets exist, and that must never be decided in the browser.
  const paymentsEnabled = paymentsConfigured();

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
      <h1 className="font-display text-3xl font-semibold tracking-tight text-earth-900 sm:text-4xl">
        Checkout
      </h1>
      <div className="mt-10">
        <CheckoutForm paymentsEnabled={paymentsEnabled} />
      </div>
    </div>
  );
}
