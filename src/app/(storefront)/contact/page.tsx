import type { Metadata } from 'next';

import { InstagramIcon, WhatsAppIcon } from '@/components/brand/social-icons';
import { BRAND, formatPhone, whatsappUrl } from '@/lib/brand';
import { getStoreSettings } from '@/server/catalog';

import { ContactForm } from './contact-form';

export const metadata: Metadata = {
  title: 'Contact Us',
  description: `Get in touch with ${BRAND.name} — WhatsApp, Instagram, or send us a message.`,
  alternates: { canonical: '/contact' },
};

export default async function ContactPage() {
  const settings = await getStoreSettings();
  const whatsapp = whatsappUrl(settings?.whatsapp);
  const whatsappLabel = formatPhone(settings?.whatsapp);
  const instagram = settings?.instagram_url ?? null;
  const instagramHandle = instagram
    ? `@${instagram.replace(/\/+$/, '').split('/').pop()}`
    : null;

  return (
    <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 sm:py-16">
      <h1 className="font-display text-3xl font-semibold tracking-tight text-earth-900 sm:text-4xl">
        Contact {BRAND.name}
      </h1>
      <p className="mt-4 max-w-xl text-lg leading-relaxed text-stone-600">
        Questions about an order, a product, or anything else — we&rsquo;d
        love to hear from you.
      </p>

      <div className="mt-10 grid gap-10 lg:grid-cols-[18rem_1fr] lg:gap-14">
        <div className="space-y-4">
          {whatsapp ? (
            <a
              href={whatsapp}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-5 transition-colors hover:border-green-300 hover:bg-green-50/40"
            >
              <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-green-100 text-green-700">
                <WhatsAppIcon className="size-5" />
              </span>
              <span>
                <span className="block text-sm font-semibold text-earth-900">WhatsApp</span>
                <span className="block text-sm text-ink-muted">{whatsappLabel}</span>
                <span className="mt-1 block text-sm font-medium text-green-800">
                  Chat on WhatsApp →
                </span>
              </span>
            </a>
          ) : null}

          {instagram ? (
            <a
              href={instagram}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-5 transition-colors hover:border-green-300 hover:bg-green-50/40"
            >
              <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-green-100 text-green-700">
                <InstagramIcon className="size-5" />
              </span>
              <span>
                <span className="block text-sm font-semibold text-earth-900">Instagram</span>
                <span className="block text-sm text-ink-muted">{instagramHandle}</span>
                <span className="mt-1 block text-sm font-medium text-green-800">Follow us →</span>
              </span>
            </a>
          ) : null}

          {settings?.address ? (
            <div className="rounded-2xl border border-line bg-surface p-5">
              <p className="text-sm font-semibold text-earth-900">Address</p>
              <p className="mt-1 text-sm leading-relaxed text-ink-muted">{settings.address}</p>
            </div>
          ) : null}
        </div>

        <div className="rounded-2xl border border-line bg-surface p-6 sm:p-8">
          <h2 className="font-display text-lg font-semibold text-earth-900">Send a message</h2>
          <div className="mt-5">
            <ContactForm />
          </div>
        </div>
      </div>
    </div>
  );
}
