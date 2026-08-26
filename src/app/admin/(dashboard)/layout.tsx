import Link from 'next/link';
import { LayoutDashboard, LogOut, Package, ShoppingCart } from 'lucide-react';

import { Logo } from '@/components/brand/logo';
import { Button } from '@/components/ui/button';
import { signOutAction } from '@/server/actions/auth-actions';
import { requireAdmin } from '@/server/auth';

/**
 * Admin shell.
 *
 * requireAdmin() runs here, so every page inside this group is guarded by
 * default — a new admin page is protected because of where it sits in the
 * tree, not because someone remembered to add a check to it. Forgetting is
 * the normal failure mode; this removes the opportunity.
 */
/**
 * Categories and Settings are omitted until they exist — a nav item pointing
 * at an unbuilt route is a 404 the owner finds by clicking it, which reads as
 * a broken admin rather than an unfinished one.
 */
const NAV = [
  { href: '/admin', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/admin/orders', label: 'Orders', icon: ShoppingCart },
  { href: '/admin/products', label: 'Products', icon: Package },
] as const;

export default async function AdminDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const admin = await requireAdmin();

  return (
    <div className="flex min-h-screen flex-col bg-stone-50">
      <header className="sticky top-0 z-40 border-b border-line bg-white">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <Link href="/admin" aria-label="Admin dashboard">
              <Logo size={32} decorative />
            </Link>
            <span className="hidden text-sm font-semibold text-stone-500 sm:inline">
              Store admin
            </span>
          </div>

          <div className="flex items-center gap-3">
            <Button asChild variant="ghost" size="sm">
              <Link href="/" target="_blank" rel="noopener noreferrer">
                View store
              </Link>
            </Button>

            <span className="hidden text-sm text-stone-500 md:inline" title={admin.email}>
              {admin.email}
            </span>

            {/* A POST form, not a link — signing out is a state change and
                must not be triggerable by a prefetch or a crawler. */}
            <form action={signOutAction}>
              <Button type="submit" variant="subtle" size="sm">
                <LogOut className="size-4" aria-hidden />
                <span className="sr-only sm:not-sr-only">Sign out</span>
              </Button>
            </form>
          </div>
        </div>

        <nav aria-label="Admin sections" className="border-t border-line">
          <ul className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-2 sm:px-4">
            {NAV.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="flex items-center gap-2 whitespace-nowrap px-3 py-3 text-sm font-medium text-stone-600 transition-colors hover:text-green-800"
                >
                  <item.icon className="size-4" aria-hidden />
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </header>

      <main id="main" className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6">
        {children}
      </main>
    </div>
  );
}
