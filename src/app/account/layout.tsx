import Link from 'next/link';
import { ArrowLeft, LayoutGrid, LogOut, MapPin, Package, User } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { customerSignOutAction } from '@/server/actions/customer-auth-actions';
import { requireCustomer } from '@/server/customer-auth';
import { cn } from '@/lib/utils';

/**
 * Account shell.
 *
 * requireCustomer() runs here, once, so every page under /account is
 * protected by its place in the route tree rather than by each page
 * remembering to check — the same reasoning already used for the admin
 * dashboard's route group in src/app/admin/(dashboard)/layout.tsx. This is a
 * SEPARATE guard from that one: it checks for a signed-in customer, never for
 * admin_users membership, and grants no admin capability whatsoever.
 *
 * Desktop gets a persistent sidebar; mobile gets the same links as a
 * horizontally scrolling pill row, matching the pattern already used for the
 * admin nav rather than inventing a second responsive convention.
 */

const NAV = [
  { href: '/account', label: 'Overview', icon: LayoutGrid, exact: true },
  { href: '/account/orders', label: 'My Orders', icon: Package },
  { href: '/account/profile', label: 'Profile', icon: User },
  { href: '/account/addresses', label: 'Addresses', icon: MapPin },
] as const;

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const customer = await requireCustomer('/account');

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
      <Link
        href="/"
        className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-ink-muted hover:text-green-800"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Back to store
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm text-ink-muted">Welcome back,</p>
          <h1 className="font-display text-2xl font-semibold text-earth-900 sm:text-3xl">
            {customer.fullName || customer.email}
          </h1>
        </div>
        <form action={customerSignOutAction}>
          <Button type="submit" variant="subtle" size="sm">
            <LogOut className="size-4" aria-hidden />
            Sign out
          </Button>
        </form>
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[15rem_1fr]">
        {/* Mobile: horizontal pill nav. Desktop: hidden, sidebar shown instead. */}
        <nav aria-label="Account" className="lg:hidden">
          <ul className="flex gap-2 overflow-x-auto pb-1">
            {NAV.map((item) => (
              <li key={item.href} className="shrink-0">
                <Link
                  href={item.href}
                  className="flex items-center gap-2 rounded-full border border-line bg-surface px-4 py-2 text-sm font-medium text-stone-700 hover:border-green-300 hover:text-green-800"
                >
                  <item.icon className="size-4" aria-hidden />
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <nav aria-label="Account" className="hidden lg:block">
          <ul className="space-y-1">
            {NAV.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    'flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-sm font-medium',
                    'text-stone-700 transition-colors hover:bg-green-50 hover:text-green-800',
                  )}
                >
                  <item.icon className="size-4" aria-hidden />
                  {item.label}
                </Link>
              </li>
            ))}
            <li className="pt-2">
              <a
                href="/contact"
                className="flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-sm font-medium text-stone-500 transition-colors hover:bg-stone-100"
              >
                Need help?
              </a>
            </li>
          </ul>
        </nav>

        <div>{children}</div>
      </div>
    </div>
  );
}
