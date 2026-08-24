import type { Metadata } from 'next';
import Link from 'next/link';

import { ConfigurableNotice } from '@/components/content/configurable-notice';
import { LegalPage, LegalSection } from '@/components/content/legal-page';
import { BRAND } from '@/lib/brand';
import { paymentsConfigured } from '@/lib/env';

export const metadata: Metadata = {
  title: 'Terms & Conditions',
  description: `Terms of use for the ${BRAND.name} website.`,
  alternates: { canonical: '/terms' },
};

export default function TermsPage() {
  const paymentsOn = paymentsConfigured();

  return (
    <LegalPage
      title="Terms & Conditions"
      intro={`These terms govern your use of the ${BRAND.name} website and any order you place through it.`}
    >
      <LegalSection title="Website usage">
        <p>
          By using this website you agree to use it only for its intended
          purpose — browsing and purchasing SSG Products — and not to misuse,
          disrupt, or attempt unauthorised access to any part of it.
        </p>
      </LegalSection>

      <LegalSection title="Products and pricing">
        <p>
          Product descriptions, ingredients and images are provided as
          accurately as possible. Prices are shown in Indian Rupees (₹) and
          include any discount from MRP, calculated automatically from the
          current selling price. Prices may change at any time; the price
          shown at the time you place an order is the price you pay for that
          order.
        </p>
      </LegalSection>

      <LegalSection title="Orders">
        <p>
          Placing an order is an offer to purchase, which we confirm by
          email. We reserve the right to decline or cancel an order — for
          example if a product is out of stock or pricing displayed in error
          — in which case we will contact you.
        </p>
      </LegalSection>

      <LegalSection title="Payments">
        {paymentsOn ? (
          <p>
            Payment is processed securely through Razorpay at checkout. An
            order is confirmed only once payment is verified.
          </p>
        ) : (
          <p>
            Online payment is not currently enabled. Orders are recorded when
            placed, and payment is arranged directly with you before dispatch.
          </p>
        )}
      </LegalSection>

      <LegalSection title="Shipping">
        <p>
          See our{' '}
          <Link href="/shipping" className="text-green-800 hover:underline">
            Shipping Information
          </Link>{' '}
          page for how orders are processed and dispatched.
        </p>
      </LegalSection>

      <LegalSection title="Returns and cancellations">
        <p>
          See our{' '}
          <Link href="/returns" className="text-green-800 hover:underline">
            Returns &amp; Refunds
          </Link>{' '}
          page.
        </p>
      </LegalSection>

      <LegalSection title="Accounts">
        <p>
          If you create an account, you are responsible for keeping your
          sign-in details secure and for all activity under your account.
        </p>
      </LegalSection>

      <LegalSection title="Intellectual property">
        <p>
          The SSG Products name, logo, and all text, images and design on
          this website are the property of {BRAND.name} unless otherwise
          stated, and may not be reproduced without permission.
        </p>
      </LegalSection>

      <LegalSection title="Limitation of liability">
        <ConfigurableNotice>
          A specific limitation-of-liability clause has not been finalised
          for this business yet. Standard consumer protections under
          applicable Indian law apply regardless.
        </ConfigurableNotice>
      </LegalSection>

      <LegalSection title="Contact">
        <p>
          Questions about these terms can be sent through our{' '}
          <Link href="/contact" className="text-green-800 hover:underline">
            contact page
          </Link>
          .
        </p>
      </LegalSection>
    </LegalPage>
  );
}
