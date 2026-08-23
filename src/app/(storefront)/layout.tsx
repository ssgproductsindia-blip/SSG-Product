import { Logo } from '@/components/brand/logo';
import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';

/**
 * Storefront chrome.
 *
 * A route group, so /admin can have an entirely different shell without the
 * customer header and footer leaking into it.
 *
 * <Logo> is rendered here — in a Server Component — and passed into the client
 * header as a prop, because it inspects the filesystem to decide whether the
 * real brand asset is installed.
 */
export default function StorefrontLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteHeader logo={<Logo size={40} decorative />} />
      <main id="main" className="flex-1">
        {children}
      </main>
      <SiteFooter />
    </>
  );
}
