import { Logo } from '@/components/brand/logo';
import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';
import { getCustomer } from '@/server/customer-auth';

/**
 * Storefront chrome.
 *
 * A route group, so /admin and /account can each have their own shell without
 * the storefront header and footer leaking into them.
 *
 * <Logo> is rendered here — in a Server Component — and passed into the client
 * header as a prop, because it inspects the filesystem to decide whether the
 * real brand asset is installed. `signedIn` is resolved here for the same
 * reason: a Server Component can call getCustomer() (which reads and
 * verifies the session cookie), a client component should not be trusted to
 * decide its own auth state.
 */
export default async function StorefrontLayout({ children }: { children: React.ReactNode }) {
  const customer = await getCustomer();

  return (
    <>
      <SiteHeader logo={<Logo size={40} decorative />} signedIn={Boolean(customer)} />
      <main id="main" className="flex-1">
        {children}
      </main>
      <SiteFooter />
    </>
  );
}
