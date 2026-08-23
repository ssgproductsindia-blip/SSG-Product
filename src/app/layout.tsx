import type { Metadata } from 'next';
import { Fraunces, Inter } from 'next/font/google';

import { CartProvider } from '@/components/cart/cart-provider';
import { BRAND } from '@/lib/brand';
import { publicEnv } from '@/lib/env';

import './globals.css';

/**
 * Type pairing.
 *
 * Fraunces for display: a warm, slightly old-style serif that reads as
 * handmade and botanical rather than clinical — the right register for a
 * homemade herbal product, and a deliberate step away from the flat geometric
 * sans every generic storefront uses.
 *
 * Inter for body and UI, where legibility at 14–16px on a phone matters more
 * than character. Prices are set in `tabular-nums` throughout so digits do not
 * shift width when the customer changes variant.
 */
const display = Fraunces({
  variable: '--font-display',
  subsets: ['latin'],
  display: 'swap',
});

const body = Inter({
  variable: '--font-body',
  subsets: ['latin'],
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL(publicEnv.NEXT_PUBLIC_SITE_URL),
  title: {
    default: `${BRAND.name} — Homemade Herbal Hair Care`,
    template: `%s · ${BRAND.name}`,
  },
  description:
    'Homemade herbal hair care from SSG Products — Shikakai Herbal Powder and Herbal Hair Oil, blended from traditional ingredients.',
  openGraph: {
    type: 'website',
    siteName: BRAND.name,
    locale: 'en_IN',
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN" className={`${display.variable} ${body.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        {/*
          The skip link is the first focusable element on every page, so a
          keyboard or screen-reader user can jump past the header each time.
        */}
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        <CartProvider>{children}</CartProvider>
      </body>
    </html>
  );
}
