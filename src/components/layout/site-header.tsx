'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Menu, ShoppingBag, User, X } from 'lucide-react';

import { useCart } from '@/components/cart/cart-provider';
import { cn } from '@/lib/utils';

const LINKS = [
  { href: '/products', label: 'Products' },
  { href: '/about', label: 'About' },
  { href: '/contact', label: 'Contact' },
  { href: '/track-order', label: 'Track Order' },
] as const;

/**
 * Site header.
 *
 * Sticky throughout. It starts flush with the page and gains a background and
 * hairline once the visitor scrolls past the top — detected with a sentinel
 * element and IntersectionObserver rather than a scroll listener, so there is
 * no work on the main thread per scroll frame.
 *
 * The logo is passed in as a prop rather than imported, because <Logo> reads
 * the filesystem to decide whether the real asset exists, which a client
 * component cannot do.
 *
 * `signedIn` is resolved server-side in the storefront layout (getCustomer())
 * and passed down for the same reason: this is a client component, and
 * whether someone is authenticated is a server-verified fact, not something
 * to re-derive from a client-readable cookie.
 */
export function SiteHeader({ logo, signedIn = false }: { logo: ReactNode; signedIn?: boolean }) {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const pathname = usePathname();
  const { itemCount, hydrated } = useCart();

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      ([entry]) => setScrolled(!entry.isIntersecting),
      { threshold: 0 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // The menu closes from the link's own onClick rather than from an effect
  // watching `pathname`. Closing it is a consequence of the click, not of the
  // route settling, and doing it here avoids a second render on every
  // navigation whether or not the menu was ever open.

  // Escape closes the menu and returns focus to the button that opened it,
  // so keyboard users are not dropped at the top of the document.
  useEffect(() => {
    if (!menuOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setMenuOpen(false);
        menuButtonRef.current?.focus();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [menuOpen]);

  return (
    <>
      <div ref={sentinelRef} aria-hidden className="absolute top-0 h-px w-full" />

      <header
        className={cn(
          'sticky top-0 z-50 transition-[background-color,box-shadow,border-color] duration-300',
          scrolled
            ? 'border-b border-line bg-cream/90 backdrop-blur-md'
            : 'border-b border-transparent bg-transparent',
        )}
      >
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:h-20 sm:px-6">
          <Link
            href="/"
            className="flex shrink-0 items-center gap-2.5 rounded-md"
            aria-label="SSG Products — home"
          >
            {logo}
          </Link>

          <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
            {LINKS.map((link) => {
              const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'rounded-full px-4 py-2 text-sm font-medium transition-colors',
                    active
                      ? 'bg-green-100 text-green-900'
                      : 'text-stone-700 hover:bg-green-50 hover:text-green-800',
                  )}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center gap-1">
            <Link
              href={signedIn ? '/account' : '/signin'}
              className="hidden h-11 items-center justify-center rounded-full px-4 text-sm font-medium text-stone-700 transition-colors hover:bg-green-50 hover:text-green-800 sm:inline-flex"
            >
              <User className="mr-1.5 size-4" aria-hidden />
              {signedIn ? 'Account' : 'Sign In'}
            </Link>

            <Link
              href={signedIn ? '/account' : '/signin'}
              aria-label={signedIn ? 'My account' : 'Sign in'}
              className="inline-flex h-11 w-11 items-center justify-center rounded-full text-stone-700 transition-colors hover:bg-green-50 hover:text-green-800 sm:hidden"
            >
              <User className="size-5" aria-hidden />
            </Link>

            <Link
              href="/cart"
              className="relative inline-flex h-11 w-11 items-center justify-center rounded-full text-stone-700 transition-colors hover:bg-green-50 hover:text-green-800"
              aria-label={
                hydrated && itemCount > 0
                  ? `Cart, ${itemCount} ${itemCount === 1 ? 'item' : 'items'}`
                  : 'Cart, empty'
              }
            >
              <ShoppingBag className="size-5" aria-hidden />
              {/*
                Rendered only after hydration. Server-rendering a count read
                from localStorage is impossible, and rendering "0" first would
                make the badge flicker on every page load for real customers.
              */}
              {hydrated && itemCount > 0 ? (
                <span
                  aria-hidden
                  className="absolute -right-0.5 -top-0.5 flex min-w-5 items-center justify-center rounded-full bg-green-700 px-1 text-[0.7rem] font-semibold leading-5 text-white tabular-nums"
                >
                  {itemCount > 99 ? '99+' : itemCount}
                </span>
              ) : null}
            </Link>

            <button
              ref={menuButtonRef}
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              aria-expanded={menuOpen}
              aria-controls="mobile-menu"
              className="inline-flex h-11 w-11 items-center justify-center rounded-full text-stone-700 transition-colors hover:bg-green-50 hover:text-green-800 md:hidden"
            >
              {menuOpen ? <X className="size-5" aria-hidden /> : <Menu className="size-5" aria-hidden />}
              <span className="sr-only">{menuOpen ? 'Close menu' : 'Open menu'}</span>
            </button>
          </div>
        </div>

        {/*
          Kept in the DOM and hidden with `hidden` rather than unmounted, so
          the aria-controls relationship always resolves to a real element.
        */}
        <div
          id="mobile-menu"
          hidden={!menuOpen}
          className="border-t border-line bg-cream md:hidden"
        >
          <nav aria-label="Mobile" className="mx-auto max-w-6xl px-4 py-3">
            <ul className="flex flex-col">
              {LINKS.map((link) => {
                const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
                return (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      aria-current={active ? 'page' : undefined}
                      onClick={() => setMenuOpen(false)}
                      className={cn(
                        'block rounded-lg px-3 py-3 text-base font-medium transition-colors',
                        active ? 'bg-green-100 text-green-900' : 'text-stone-700 hover:bg-green-50',
                      )}
                    >
                      {link.label}
                    </Link>
                  </li>
                );
              })}
              <li>
                <Link
                  href={signedIn ? '/account' : '/signin'}
                  onClick={() => setMenuOpen(false)}
                  className="block rounded-lg px-3 py-3 text-base font-medium text-stone-700 transition-colors hover:bg-green-50"
                >
                  {signedIn ? 'My Account' : 'Sign In'}
                </Link>
              </li>
            </ul>
          </nav>
        </div>
      </header>
    </>
  );
}
