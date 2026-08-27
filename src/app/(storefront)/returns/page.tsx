import type { Metadata } from 'next';

import { ConfigurableNotice } from '@/components/content/configurable-notice';
import { LegalPage, LegalSection } from '@/components/content/legal-page';
import { BRAND, formatPhone, whatsappUrl } from '@/lib/brand';
import { getStoreSettings } from '@/server/catalog';

export const metadata: Metadata = {
  title: 'Returns & Refunds',
  description: `${BRAND.name} return, refund and cancellation information.`,
  alternates: { canonical: '/returns' },
};

export default async function ReturnsPage() {
  const settings = await getStoreSettings();
  const whatsapp = whatsappUrl(settings?.whatsapp);
  const whatsappLabel = formatPhone(settings?.whatsapp);

  return (
    <LegalPage
      title="Returns & Refunds"
      intro="Our full return and refund policy is still being finalised — the return window below is confirmed, the rest of this page outlines the structure that policy will follow."
    >
      <LegalSection title="Return eligibility">
        <p>Returns are accepted within 7 days of delivery.</p>
        <ConfigurableNotice>
          Further conditions — such as whether a product must be unopened or
          unused to qualify, and who covers return shipping — have not been
          published yet.
        </ConfigurableNotice>
      </LegalSection>

      <LegalSection title="Damaged or defective products">
        <ConfigurableNotice>
          If a product arrives damaged, please contact us directly with your
          order number and photos of the item — the formal process for this
          is not yet published, but we will assist on a case-by-case basis in
          the meantime.
        </ConfigurableNotice>
      </LegalSection>

      <LegalSection title="Wrong product received">
        <ConfigurableNotice>
          The formal process for a wrong-item delivery has not been published
          yet. Contact us with your order number and we will resolve it
          directly.
        </ConfigurableNotice>
      </LegalSection>

      <LegalSection title="Refund process">
        <ConfigurableNotice>
          Refund timelines and methods have not been published yet.
        </ConfigurableNotice>
      </LegalSection>

      <LegalSection title="Cancellations">
        <ConfigurableNotice>
          Whether and when an order can be cancelled after it is placed has
          not been published yet. Contact us as soon as possible if you need
          to cancel a recent order.
        </ConfigurableNotice>
      </LegalSection>

      <LegalSection title="Contact and support">
        <p>
          For any issue with an order, reach us on{' '}
          {whatsapp ? (
            <a href={whatsapp} target="_blank" rel="noopener noreferrer" className="text-green-800 hover:underline">
              WhatsApp{whatsappLabel ? ` (${whatsappLabel})` : ''}
            </a>
          ) : (
            'WhatsApp'
          )}{' '}
          or through our{' '}
          <a href="/contact" className="text-green-800 hover:underline">
            contact form
          </a>
          , with your order number to hand.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
