import Link from 'next/link';
import { InstagramIcon, WhatsAppIcon } from '@/components/brand/social-icons';

import { Logo } from '@/components/brand/logo';
import { BRAND, formatPhone, whatsappUrl } from '@/lib/brand';
import { getStoreSettings } from '@/server/catalog';

/**
 * Site footer.
 *
 * Contact details come from `store_settings`, so the owner can change the
 * WhatsApp number or Instagram handle from the admin panel without a deploy.
 * Each block renders only when its value is actually set — an unconfigured
 * store shows a shorter footer rather than a dead link or a placeholder.
 *
 * Only the two channels the brand actually has are listed. No invented
 * Facebook, X or YouTube links (brief §7).
 */
export async function SiteFooter() {
  const settings = await getStoreSettings();

  const whatsapp = whatsappUrl(settings?.whatsapp);
  const whatsappLabel = formatPhone(settings?.whatsapp);
  const instagram = settings?.instagram_url ?? null;
  const instagramHandle = instagram
    ? `@${instagram.replace(/\/+$/, '').split('/').pop()}`
    : null;

  const year = new Date().getFullYear();

  return (
    <footer className="mt-24 border-t border-line bg-earth-900 text-earth-100">
      <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div className="lg:col-span-2">
            <div className="[&_span]:!text-earth-50">
              <Logo size={44} />
            </div>
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-earth-200">
              {BRAND.tagline}
            </p>
          </div>

          <nav aria-labelledby="footer-shop">
            <h2 id="footer-shop" className="text-sm font-semibold text-white">
              Shop
            </h2>
            <ul className="mt-4 space-y-2.5 text-sm">
              <FooterLink href="/products">All products</FooterLink>
              <FooterLink href="/cart">Cart</FooterLink>
              <FooterLink href="/track-order">Track your order</FooterLink>
              <FooterLink href="/contact">Contact</FooterLink>
            </ul>
          </nav>

          <nav aria-labelledby="footer-legal">
            <h2 id="footer-legal" className="text-sm font-semibold text-white">
              Policies
            </h2>
            <ul className="mt-4 space-y-2.5 text-sm">
              <FooterLink href="/shipping-policy">Shipping policy</FooterLink>
              <FooterLink href="/returns-policy">Returns &amp; refunds</FooterLink>
              <FooterLink href="/privacy-policy">Privacy policy</FooterLink>
              <FooterLink href="/terms">Terms</FooterLink>
            </ul>
          </nav>
        </div>

        {whatsapp || instagram ? (
          <div className="mt-12 flex flex-wrap items-center gap-3 border-t border-earth-800 pt-8">
            {whatsapp ? (
              <a
                href={whatsapp}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-full border border-earth-700 px-4 py-2.5 text-sm font-medium text-earth-50 transition-colors hover:border-green-500 hover:bg-earth-800"
              >
                <WhatsAppIcon className="size-4" />
                {whatsappLabel ?? 'WhatsApp'}
                <span className="sr-only">(opens WhatsApp in a new tab)</span>
              </a>
            ) : null}

            {instagram ? (
              <a
                href={instagram}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-full border border-earth-700 px-4 py-2.5 text-sm font-medium text-earth-50 transition-colors hover:border-green-500 hover:bg-earth-800"
              >
                <InstagramIcon className="size-4" />
                {instagramHandle ?? 'Instagram'}
                <span className="sr-only">(opens Instagram in a new tab)</span>
              </a>
            ) : null}
          </div>
        ) : null}

        <p className="mt-10 text-xs text-earth-300">
          © {year} {settings?.store_name ?? BRAND.name}. All rights reserved.
        </p>
      </div>
    </footer>
  );
}

function FooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <li>
      <Link
        href={href}
        className="text-earth-200 transition-colors hover:text-white hover:underline"
      >
        {children}
      </Link>
    </li>
  );
}
