import type { Metadata } from 'next';
import Link from 'next/link';

import { LegalPage, LegalSection } from '@/components/content/legal-page';
import { BRAND, formatPhone, whatsappUrl } from '@/lib/brand';
import { paymentsConfigured } from '@/lib/env';
import { getStoreSettings } from '@/server/catalog';

export const metadata: Metadata = {
  title: 'Terms & Conditions',
  description: `Terms of use for the ${BRAND.name} website.`,
  alternates: { canonical: '/terms' },
};

export default async function TermsPage() {
  const paymentsOn = paymentsConfigured();
  const settings = await getStoreSettings();
  const contactEmail = settings?.email ?? null;
  const whatsapp = whatsappUrl(settings?.whatsapp);
  const whatsappLabel = formatPhone(settings?.whatsapp);

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
        <p>
          Our products are natural and herbal, and results can vary between
          individuals. We make no guarantee of a specific outcome from using
          any product, and nothing on this website is medical advice — if you
          have a skin condition, allergy or medical concern, please consult a
          qualified professional before use.
        </p>
        <p>
          To the extent permitted by applicable law, our liability for any
          claim relating to an order is limited to the amount you paid for
          that order, and we are not liable for indirect or consequential
          loss. This does not exclude or limit any right you have under
          Indian consumer protection law that cannot lawfully be excluded.
        </p>
      </LegalSection>

      <LegalSection title="Governing law and jurisdiction">
        <p>
          These terms are governed by the laws of India. Any dispute relating
          to them or to an order is subject to the exclusive jurisdiction of
          the courts at Chennai, Tamil Nadu.
        </p>
      </LegalSection>

      <LegalSection title="Grievance redressal">
        <p>
          If you have a complaint about an order or about this website that
          our regular{' '}
          <Link href="/contact" className="text-green-800 hover:underline">
            contact page
          </Link>{' '}
          has not resolved, you can escalate it directly
          {contactEmail ? (
            <>
              {' '}
              by email at{' '}
              <a href={`mailto:${contactEmail}`} className="text-green-800 hover:underline">
                {contactEmail}
              </a>
            </>
          ) : null}
          {whatsapp ? (
            <>
              {contactEmail ? ' or' : ' by'} WhatsApp at{' '}
              <a
                href={whatsapp}
                target="_blank"
                rel="noopener noreferrer"
                className="text-green-800 hover:underline"
              >
                {whatsappLabel}
              </a>
            </>
          ) : null}
          . We aim to acknowledge grievances promptly and resolve them within
          a reasonable time.
        </p>
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
