import type { Metadata } from 'next';
import Link from 'next/link';

import { ConfigurableNotice } from '@/components/content/configurable-notice';
import { LegalPage, LegalSection } from '@/components/content/legal-page';
import { BRAND } from '@/lib/brand';
import { formatPaise } from '@/lib/money';
import { getStoreSettings } from '@/server/catalog';

export const metadata: Metadata = {
  title: 'Shipping Information',
  description: `How ${BRAND.name} processes, ships and delivers orders.`,
  alternates: { canonical: '/shipping' },
};

/**
 * Shipping rates are read live from store_settings rather than written here
 * as fixed prose — the same ₹50/₹100 figures the admin sets in
 * Settings → Shipping. If the owner changes a rate there, this page updates
 * with it instead of quietly going stale.
 */
export default async function ShippingPage() {
  const settings = await getStoreSettings();

  const restOfIndia = settings?.shipping_flat_paise ?? null;
  const tamilNadu = settings?.shipping_tamil_nadu_paise ?? null;
  const threshold = settings?.free_shipping_threshold_paise ?? null;
  const tiered = restOfIndia !== null && tamilNadu !== null;

  return (
    <LegalPage
      title="Shipping Information"
      intro="How your order gets from us to you."
    >
      <LegalSection title="Delivery locations">
        <p>We ship all over India.</p>
      </LegalSection>

      <LegalSection title="Order processing and dispatch">
        <p>
          Once placed, your order is reviewed and confirmed by our team —
          usually the same day. As soon as it is confirmed and ready for
          shipping, its status moves to Confirmed and then Processing as we
          prepare it. When it is handed to the courier, its status moves to
          Shipped and you will receive an email with the courier name and
          tracking ID. Delivery typically takes 2–4 business days after
          dispatch.
        </p>
      </LegalSection>

      <LegalSection title="Shipping charges">
        {restOfIndia === null ? (
          <ConfigurableNotice>
            Shipping charges have not been configured yet. They will appear
            here, and at checkout, once set.
          </ConfigurableNotice>
        ) : (
          <>
            <ul className="list-disc space-y-1.5 pl-5">
              {tiered ? (
                <>
                  <li>Within Tamil Nadu: {formatPaise(tamilNadu)} per order</li>
                  <li>Rest of India: {formatPaise(restOfIndia)} per order</li>
                </>
              ) : (
                <li>{formatPaise(restOfIndia)} per order, anywhere in India</li>
              )}
            </ul>
            {threshold !== null ? (
              <p>
                Orders totalling {formatPaise(threshold)} or more ship free,
                regardless of destination.
              </p>
            ) : null}
          </>
        )}
      </LegalSection>

      <LegalSection title="Payment on delivery">
        <p>
          Cash on Delivery is not available at this time. All orders are paid
          for online at checkout.
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
