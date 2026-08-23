import type { Metadata } from 'next';

import { CartView } from './cart-view';

export const metadata: Metadata = {
  title: 'Your cart',
  // A cart is per-visitor and has nothing to rank for.
  robots: { index: false, follow: true },
};

export default function CartPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
      <h1 className="font-display text-3xl font-semibold tracking-tight text-earth-900 sm:text-4xl">
        Your cart
      </h1>
      <div className="mt-10">
        <CartView />
      </div>
    </div>
  );
}
