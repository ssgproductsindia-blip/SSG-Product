import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { Logo } from '@/components/brand/logo';
import { getAdminUser } from '@/server/auth';

import { LoginForm } from './login-form';

export const metadata: Metadata = {
  title: 'Admin sign-in',
  robots: { index: false, follow: false },
};

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; denied?: string; error?: string }>;
}) {
  const params = await searchParams;

  // Already signed in and authorised — no reason to show a login form.
  if (await getAdminUser()) {
    redirect('/admin');
  }

  /**
   * `next` comes from a query string, so it is attacker-controllable. Only a
   * same-site path under /admin is accepted; anything else falls back. Without
   * this, a crafted link could bounce a freshly authenticated admin to an
   * external site — an open redirect straight off the back of a login.
   */
  const requested = params.next ?? '';
  const nextPath =
    requested.startsWith('/admin') && !requested.startsWith('//') ? requested : '/admin';

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-cream px-4 py-12">
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-8 flex justify-center">
          <Logo size={48} />
        </Link>

        <h1 className="mb-6 text-center font-display text-2xl font-semibold text-earth-900">
          Store admin
        </h1>

        {params.denied ? (
          <p
            role="alert"
            className="mb-5 rounded-xl border border-gold-400/50 bg-[--color-warning-surface] px-4 py-3 text-sm text-[--color-warning]"
          >
            Please sign in to continue.
          </p>
        ) : null}

        {params.error ? (
          <p
            role="alert"
            className="mb-5 rounded-xl border border-[--color-danger]/25 bg-[--color-danger-surface] px-4 py-3 text-sm text-[--color-danger]"
          >
            That sign-in link was invalid or has expired. Request a new one.
          </p>
        ) : null}

        <LoginForm nextPath={nextPath} />

        <p className="mt-8 text-center text-sm">
          <Link href="/" className="text-ink-muted hover:text-green-800 hover:underline">
            ← Back to the store
          </Link>
        </p>
      </div>
    </div>
  );
}
