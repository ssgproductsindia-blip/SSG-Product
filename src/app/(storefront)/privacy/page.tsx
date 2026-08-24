import type { Metadata } from 'next';
import Link from 'next/link';

import { LegalPage, LegalSection } from '@/components/content/legal-page';
import { BRAND } from '@/lib/brand';
import { emailConfigured, paymentsConfigured } from '@/lib/env';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: `How ${BRAND.name} collects, uses and protects your information.`,
  alternates: { canonical: '/privacy' },
};

/**
 * Privacy policy.
 *
 * Only names services that are actually wired into this codebase, and only
 * describes them as active when they are actually configured — the payments
 * and email sections read differently depending on emailConfigured() /
 * paymentsConfigured(), so this page never claims a processor is handling
 * data it is not yet handling.
 */
export default function PrivacyPolicyPage() {
  const emailOn = emailConfigured();
  const paymentsOn = paymentsConfigured();

  return (
    <LegalPage
      title="Privacy Policy"
      intro={`This page explains what information ${BRAND.name} collects when you use this website, and how it is used.`}
    >
      <LegalSection title="Information we collect">
        <p>When you place an order, we collect:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Your name, email address and phone number</li>
          <li>Your shipping address</li>
          <li>Details of the products and quantities you order</li>
        </ul>
        <p>
          If you create an account, we additionally store your name and phone
          number against that account, and any addresses you choose to save.
        </p>
      </LegalSection>

      <LegalSection title="How we use your information">
        <p>Your information is used to:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Process and deliver your order</li>
          <li>Send order confirmation and shipping updates by email</li>
          <li>Respond to messages you send us</li>
          <li>Maintain your account and order history, if you have one</li>
        </ul>
      </LegalSection>

      <LegalSection title="Payment information">
        {paymentsOn ? (
          <p>
            Payments are processed by Razorpay. We do not store your card,
            UPI or bank details ourselves — they are handled directly by
            Razorpay under its own security and privacy terms.
          </p>
        ) : (
          <p>
            Online payment is not currently enabled on this site. Orders are
            recorded and payment is arranged directly with our team, so no
            payment details are collected through this website at this time.
          </p>
        )}
      </LegalSection>

      <LegalSection title="Email communication">
        {emailOn ? (
          <p>
            We send transactional emails — order confirmations and shipping
            updates — related to orders you place. We do not send marketing
            email unless you separately opt in.
          </p>
        ) : (
          <p>
            Automated order emails are not currently active on this site.
            Order updates may be communicated to you directly by our team.
          </p>
        )}
      </LegalSection>

      <LegalSection title="Cookies and analytics">
        <p>
          This site uses a cookie to keep you signed in if you have an
          account, and stores your shopping cart in your browser&rsquo;s local
          storage so it survives a page refresh. No third-party analytics or
          advertising trackers are configured on this site.
        </p>
      </LegalSection>

      <LegalSection title="Data storage and security">
        <p>
          Order and account data is stored using Supabase (PostgreSQL) with
          row-level security restricting who can read each record: you can
          read your own orders and addresses, and nobody else&rsquo;s.
        </p>
      </LegalSection>

      <LegalSection title="Your rights">
        <p>
          You can view and edit your profile and saved addresses from{' '}
          <Link href="/account" className="text-green-800 hover:underline">
            your account
          </Link>{' '}
          at any time. To request a copy of your data, or its deletion,{' '}
          <Link href="/contact" className="text-green-800 hover:underline">
            contact us
          </Link>
          .
        </p>
      </LegalSection>

      <LegalSection title="Contact">
        <p>
          Questions about this policy can be sent through our{' '}
          <Link href="/contact" className="text-green-800 hover:underline">
            contact page
          </Link>
          .
        </p>
      </LegalSection>
    </LegalPage>
  );
}
