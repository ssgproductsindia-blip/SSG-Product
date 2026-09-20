import Image from 'next/image';
import Link from 'next/link';
import { Leaf } from 'lucide-react';

import { Logo } from '@/components/brand/logo';
import { BRAND } from '@/lib/brand';

/**
 * Shell for sign-in, sign-up, forgot-password and reset-password.
 *
 * Brand panel on the left, form on the right, stacking vertically on mobile —
 * the layout the brief asks for. No scroll reveals or motion here: these are
 * functional pages where speed and predictability matter more than the scroll
 * storytelling used on the homepage, per the brief's own instruction to keep
 * auth pages fast and minimal.
 *
 * The brand panel uses the same green/cream tokens as the rest of the site —
 * this is explicitly NOT a second design system, just the existing one
 * applied to a two-column layout it hasn't been used in yet.
 */
export function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden overflow-hidden bg-green-800 lg:flex lg:flex-col lg:justify-between lg:p-12">
        <Image
          src="/auth/auth-hero.webp"
          alt=""
          aria-hidden
          fill
          priority
          sizes="50vw"
          className="object-cover object-[30%_center]"
        />
        {/* Scrim: the photo alone doesn't give white text reliable contrast
            everywhere (the wall in the top-right of the source photo is
            light and sunlit), so this darkens the whole panel uniformly
            rather than only at the corners text happens to sit in. */}
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-green-900/65" />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_70%_60%_at_20%_0%,rgba(255,255,255,0.08),transparent_60%)]"
        />
        <Link href="/" className="relative z-10 inline-flex w-fit">
          <div className="[&_span]:!text-white">
            <Logo size={40} />
          </div>
        </Link>

        <div className="relative z-10 max-w-sm">
          <Leaf className="size-8 text-green-300" aria-hidden />
          <p className="mt-6 font-display text-3xl leading-snug font-semibold text-white text-balance">
            {BRAND.tagline}
          </p>
          <p className="mt-4 text-sm leading-relaxed text-green-100">
            Sign in to track your orders, save your addresses, and check out
            faster next time.
          </p>
        </div>

        <p className="relative z-10 text-xs text-green-200">
          © {new Date().getFullYear()} {BRAND.name}
        </p>
      </div>

      <div className="flex flex-col items-center justify-center bg-cream px-4 py-12 sm:px-6">
        <div className="w-full max-w-sm">
          <Link href="/" className="mb-8 flex justify-center lg:hidden">
            <Logo size={44} />
          </Link>

          <h1 className="text-center font-display text-2xl font-semibold text-earth-900 sm:text-left">
            {title}
          </h1>
          {subtitle ? (
            <p className="mt-2 text-center text-sm text-ink-muted sm:text-left">{subtitle}</p>
          ) : null}

          <div className="mt-8">{children}</div>
        </div>
      </div>
    </div>
  );
}
