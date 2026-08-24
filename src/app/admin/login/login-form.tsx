'use client';

import { useState } from 'react';
import { MailCheck } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/client';

/**
 * Admin sign-in — magic link only.
 *
 * There is no password field, and no sign-up. Admin access is granted by
 * running scripts/create-admin.ts with the secret key, so there is no
 * self-service path into the admin area and no admin password to phish,
 * reuse or leak.
 *
 * The success message is identical whether or not the email belongs to an
 * admin. Supabase will simply not deliver a link to an unknown address. Saying
 * "no such admin" would confirm which addresses have access.
 */
export function LoginForm({ nextPath }: { nextPath: string }) {
  const [sent, setSent] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    const email = String(new FormData(event.currentTarget).get('email') ?? '')
      .trim()
      .toLowerCase();

    const supabase = createClient();
    const callback = new URL('/admin/auth/callback', window.location.origin);
    callback.searchParams.set('next', nextPath);

    const { error: signInError } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: callback.toString(),
        // No account is created for an unknown address. Without this, anyone
        // could mint a Supabase user by typing an email into this box.
        shouldCreateUser: false,
      },
    });

    setPending(false);

    if (signInError) {
      // Rate limiting is the one failure worth naming, since the fix is to
      // wait. Everything else stays vague on purpose.
      setError(
        signInError.status === 429
          ? 'Too many sign-in attempts. Please wait a minute and try again.'
          : 'Could not send the sign-in link. Please try again shortly.',
      );
      return;
    }

    setSent(true);
  }

  if (sent) {
    return (
      <div className="rounded-2xl border border-line bg-surface p-8 text-center">
        <MailCheck className="mx-auto size-10 text-green-600" aria-hidden />
        <h2 className="mt-4 font-display text-xl font-semibold text-earth-900">
          Check your inbox
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">
          If that address has admin access, a sign-in link is on its way. The
          link expires shortly, so use it soon.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="rounded-2xl border border-line bg-surface p-8">
      <label htmlFor="email" className="block text-sm font-medium text-earth-900">
        Admin email
      </label>
      <input
        id="email"
        name="email"
        type="email"
        required
        autoComplete="email"
        autoFocus
        className="mt-2 w-full rounded-xl border border-line bg-surface px-3.5 py-3 text-base text-earth-900 focus:border-green-600"
      />

      <Button type="submit" size="lg" full className="mt-5" disabled={pending}>
        {pending ? 'Sending link…' : 'Email me a sign-in link'}
      </Button>

      {error ? (
        <p
          role="alert"
          className="mt-4 rounded-xl border border-[--color-danger]/25 bg-[--color-danger-surface] px-4 py-3 text-sm text-[--color-danger]"
        >
          {error}
        </p>
      ) : null}

      <p className="mt-5 text-xs leading-relaxed text-ink-muted">
        There is no password. Admin access is granted from the server, so a
        sign-in link only works for an address that already has it.
      </p>
    </form>
  );
}
