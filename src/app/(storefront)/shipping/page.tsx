import type { Metadata } from 'next';
import Link from 'next/link';

import { ConfigurableNotice } from '@/components/content/configurable-notice';
import { LegalPage, LegalSection } from '@/components/content/legal-page';
import { BRAND } from '@/lib/brand';

export const metadata: Metadata = {
  title: 'Shipping Information',
  description: `How ${BRAND.name} processes, ships and delivers orders.`,
  alternates: { canonical: '/shipping' },
};

export default function ShippingPage() {
  return (
    <LegalPage
      title="Shipping Information"
      intro="How your order gets from us to you."
    >
      <LegalSection title="Order processing">
        <p>
          Once placed, your order is reviewed and confirmed by our team. You
          will receive an email confirmation immediately, and the order status
          moves through Placed → Confirmed → Processing → Packed as it is
          prepared.
        </p>
      </LegalSection>

      <LegalSection title="Dispatch and courier">
        <p>
          When your order is packed and handed to a courier, its status moves
          to Shipped and you will receive an email with the courier name and
          tracking ID.
        </p>
        <ConfigurableNotice>
          Which courier partners we use and typical dispatch timelines have
          not been finalised yet. This section will be updated once that
          information is confirmed.
        </ConfigurableNotice>
      </LegalSection>

      <LegalSection title="Delivery timelines">
        <ConfigurableNotice>
          Estimated delivery times by location have not been published yet.
          Please do not rely on any timeline not stated directly by our team
          for your order.
        </ConfigurableNotice>
      </LegalSection>

      <LegalSection title="Shipping charges">
        <ConfigurableNotice>
          Shipping charges, and any free-shipping threshold, are shown at
          checkout based on current store configuration. Official published
          rates for this page have not been finalised yet.
        </ConfigurableNotice>
      </LegalSection>

      <LegalSection title="Delivery locations">
        <p>
          We currently ship within India. If you have a question about
          delivery to a specific location, please{' '}
          <Link href="/contact" className="text-green-800 hover:underline">
            contact us
          </Link>{' '}
          before ordering.
        </p>
      </LegalSection>

      <LegalSection title="Tracking your order">
        <p>
          Track any order, with or without an account, at{' '}
          <Link href="/track-order" className="text-green-800 hover:underline">
            Track Order
          </Link>{' '}
          using your order number and the email or phone used at checkout.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
