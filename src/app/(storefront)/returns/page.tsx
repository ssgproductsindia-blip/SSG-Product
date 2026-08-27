import type { Metadata } from 'next';

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
      intro="Our return, refund and cancellation policy."
    >
      <LegalSection title="Return eligibility">
        <p>
          Returns are accepted within 7 days of delivery. Products do not
          need to be unopened or unused to qualify.
        </p>
      </LegalSection>

      <LegalSection title="Return shipping cost">
        <p>
          If you are returning a product because it arrived damaged, defective,
          or was the wrong item, we cover the return shipping cost. For any
          other reason — for example, if you simply changed your mind — the
          return shipping cost is paid by you.
        </p>
      </LegalSection>

      <LegalSection title="Damaged, defective or wrong item">
        <p>
          Contact us with your order number and photos of the item, and we
          will arrange a replacement or a refund — whichever you would
          prefer.
        </p>
      </LegalSection>

      <LegalSection title="Refund process">
        <p>
          Once a return is received and approved, refunds are processed
          within 5–7 business days to your original payment method.
        </p>
      </LegalSection>

      <LegalSection title="Cancellations">
        <p>
          You can cancel an order any time before it has shipped. Once an
          order&rsquo;s status shows Shipped, it can no longer be cancelled —
          at that point, our standard return process above applies instead.
        </p>
      </LegalSection>

      <LegalSection title="How to request a return, refund or cancellation">
        <p>
          Reach us on{' '}
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
