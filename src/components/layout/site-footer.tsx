import Link from 'next/link';

import { Logo } from '@/components/brand/logo';
import { InstagramIcon, WhatsAppIcon } from '@/components/brand/social-icons';
import { BRAND, formatPhone, whatsappUrl } from '@/lib/brand';
import { getStoreSettings, listProducts } from '@/server/catalog';

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
 *
 * The Shop column is generated from `listProducts()` rather than hardcoded —
 * a new product added in the admin panel appears in the footer on its own,
 * with no template change required.
 */
export async function SiteFooter() {
  const [settings, products] = await Promise.all([getStoreSettings(), listProducts()]);

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
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-6">
          <div className="sm:col-span-2 lg:col-span-2">
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
              <FooterLink href="/products">All Products</FooterLink>
              {products.map((product) => (
                <FooterLink key={product.id} href={`/products/${product.slug}`}>
                  {product.name.replace(/^SSG\s+/i, '')}
                </FooterLink>
              ))}
            </ul>
          </nav>

          <nav aria-labelledby="footer-company">
            <h2 id="footer-company" className="text-sm font-semibold text-white">
              Company
            </h2>
            <ul className="mt-4 space-y-2.5 text-sm">
              <FooterLink href="/about">About Us</FooterLink>
              <FooterLink href="/contact">Contact Us</FooterLink>
            </ul>
          </nav>

          <nav aria-labelledby="footer-care">
            <h2 id="footer-care" className="text-sm font-semibold text-white">
              Customer Care
            </h2>
            <ul className="mt-4 space-y-2.5 text-sm">
              <FooterLink href="/faq">FAQ</FooterLink>
              <FooterLink href="/shipping">Shipping</FooterLink>
              <FooterLink href="/returns">Returns</FooterLink>
              <FooterLink href="/track-order">Track Order</FooterLink>
            </ul>
          </nav>

          <nav aria-labelledby="footer-legal">
            <h2 id="footer-legal" className="text-sm font-semibold text-white">
              Legal
            </h2>
            <ul className="mt-4 space-y-2.5 text-sm">
              <FooterLink href="/privacy">Privacy Policy</FooterLink>
              <FooterLink href="/terms">Terms &amp; Conditions</FooterLink>
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
