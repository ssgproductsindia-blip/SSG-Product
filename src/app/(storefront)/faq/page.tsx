import type { Metadata } from 'next';
import Link from 'next/link';

import { ConfigurableNotice } from '@/components/content/configurable-notice';
import { BRAND } from '@/lib/brand';

export const metadata: Metadata = {
  title: 'FAQ',
  description: `Frequently asked questions about ${BRAND.name} orders, shipping, products and returns.`,
  alternates: { canonical: '/faq' },
};

/**
 * FAQ.
 *
 * Native <details>/<summary> rather than a hand-rolled accordion — it is
 * keyboard operable, exposes the expanded/collapsed state to assistive tech
 * automatically, and needs no JavaScript at all, which is the simplest way to
 * satisfy "accessible accordion" rather than reimplementing what the platform
 * already does correctly.
 *
 * Answers about what this system actually does (tracking, variants) are
 * written as fact. Answers about business policy that has not been supplied
 * (payment methods, return windows) carry a ConfigurableNotice instead of an
 * invented policy — the brief is explicit that no official SSG policy may be
 * fabricated here.
 */

type Faq = { q: string; a: React.ReactNode };
type Section = { title: string; items: Faq[] };

const SECTIONS: Section[] = [
  {
    title: 'Orders',
    items: [
      {
        q: 'How do I place an order?',
        a: (
          <p>
            Choose a product, pick a pack size, and select{' '}
            <strong>Add to Cart</strong> or <strong>Buy Now</strong>. At
            checkout, enter your details and shipping address to confirm the
            order — no account is required.
          </p>
        ),
      },
      {
        q: 'Do I need an account to order?',
        a: (
          <p>
            No. You can check out as a guest. Creating a{' '}
            <Link href="/signup" className="text-green-800 hover:underline">
              free account
            </Link>{' '}
            lets you save addresses and see all your orders in one place.
          </p>
        ),
      },
      {
        q: 'I placed an order as a guest. Can I still see it later?',
        a: (
          <p>
            Yes — use{' '}
            <Link href="/track-order" className="text-green-800 hover:underline">
              Track Order
            </Link>{' '}
            with your order number and the email or phone you used at
            checkout.
          </p>
        ),
      },
    ],
  },
  {
    title: 'Shipping',
    items: [
      {
        q: 'How can I track my order?',
        a: (
          <p>
            Every order gets a unique order number. Use it on the{' '}
            <Link href="/track-order" className="text-green-800 hover:underline">
              Track Order
            </Link>{' '}
            page, or in{' '}
            <Link href="/account/orders" className="text-green-800 hover:underline">
              My Orders
            </Link>{' '}
            if you&rsquo;re signed in. Once a courier is assigned you&rsquo;ll
            also receive a shipping email with the tracking ID.
          </p>
        ),
      },
      {
        q: 'How long does delivery take, and what does shipping cost?',
        a: (
          <ConfigurableNotice>
            Delivery times and shipping charges have not been finalised yet.
            See the{' '}
            <Link href="/shipping" className="underline">
              Shipping Information
            </Link>{' '}
            page for details as they are confirmed.
          </ConfigurableNotice>
        ),
      },
    ],
  },
  {
    title: 'Products',
    items: [
      {
        q: 'How do I choose a product variant?',
        a: (
          <p>
            Each product page lists the available pack sizes. Selecting one
            updates the price, MRP and discount shown, and the size you pick
            stays attached to that item in your cart.
          </p>
        ),
      },
      {
        q: 'What is in each product?',
        a: (
          <p>
            The full ingredient list is printed on every product page, taken
            directly from the packaging.
          </p>
        ),
      },
    ],
  },
  {
    title: 'Payments',
    items: [
      {
        q: 'What payment methods are supported?',
        a: (
          <ConfigurableNotice>
            Online payment is not enabled yet. Orders are currently recorded
            and confirmed by the team directly — you will be contacted to
            arrange payment before dispatch.
          </ConfigurableNotice>
        ),
      },
    ],
  },
  {
    title: 'Returns',
    items: [
      {
        q: 'What is the return or refund process?',
        a: (
          <ConfigurableNotice>
            Our official return and refund policy has not been published yet.
            See the{' '}
            <Link href="/returns" className="underline">
              Returns &amp; Refunds
            </Link>{' '}
            page, and contact us directly for any issue with an order in the
            meantime.
          </ConfigurableNotice>
        ),
      },
    ],
  },
];

export default function FaqPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
      <h1 className="font-display text-3xl font-semibold tracking-tight text-earth-900 sm:text-4xl">
        Frequently Asked Questions
      </h1>

      <div className="mt-10 space-y-10">
        {SECTIONS.map((section) => (
          <section key={section.title} aria-labelledby={`faq-${section.title}`}>
            <h2
              id={`faq-${section.title}`}
              className="font-display text-xl font-semibold text-earth-900"
            >
              {section.title}
            </h2>
            <div className="mt-3 divide-y divide-line border-y border-line">
              {section.items.map((item) => (
                <details key={item.q} className="group py-4">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-left font-medium text-earth-900 marker:content-none">
                    {item.q}
                    <span
                      aria-hidden
                      className="shrink-0 text-xl leading-none text-green-700 transition-transform group-open:rotate-45"
                    >
                      +
                    </span>
                  </summary>
                  <div className="mt-3 text-sm leading-relaxed text-stone-600">{item.a}</div>
                </details>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
