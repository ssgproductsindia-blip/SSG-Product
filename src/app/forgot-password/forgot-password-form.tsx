'use client';

import Link from 'next/link';
import { useState } from 'react';
import { MailCheck } from 'lucide-react';

import { Field } from '@/components/forms/field';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/client';
import { forgotPasswordSchema } from '@/lib/validation';

/**
 * Forgot password.
 *
 * Shows the identical success message whether or not the email is
 * registered. Supabase's resetPasswordForEmail does not error on an unknown
 * address, and this form does not add a check that would — the brief is
 * explicit that this flow must not become a way to discover which emails
 * have accounts, which is exactly the enumeration risk sign-up's duplicate
 * message deliberately accepts on ITS page, not this one.
 */
export function ForgotPasswordForm() {
  const [sent, setSent] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    const email = String(new FormData(event.currentTarget).get('email') ?? '');
    const parsed = forgotPasswordSchema.safeParse({ email });

    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Enter a valid email address.');
      setPending(false);
      return;
    }

    const supabase = createClient();
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
      redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent('/reset-password')}`,
    });

    setPending(false);

    if (resetError && resetError.status === 429) {
      setError('Too many attempts. Please wait a minute and try again.');
      return;
    }

    // Any other error is also shown as success — see the file docstring.
    setSent(true);
  }

  if (sent) {
    return (
      <div className="rounded-2xl border border-line bg-surface p-8 text-center">
        <MailCheck className="mx-auto size-10 text-green-600" aria-hidden />
        <h2 className="mt-4 font-display text-lg font-semibold text-earth-900">
          Check your email
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">
          If an account exists for that address, a password reset link is on
          its way.
        </p>
        <p className="mt-6 text-sm">
          <Link href="/signin" className="font-medium text-green-800 hover:underline">
            Back to sign in
          </Link>
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      <Field
        name="email"
        label="Email"
        type="email"
        autoComplete="email"
        required
        autoFocus
        hint="We'll send a link to reset your password."
      />

      {error ? (
        <p
          role="alert"
          className="rounded-xl border border-[--color-danger]/25 bg-[--color-danger-surface] px-4 py-3 text-sm text-[--color-danger]"
        >
          {error}
        </p>
      ) : null}

      <Button type="submit" size="lg" full disabled={pending}>
        {pending ? 'Sending…' : 'Reset password'}
      </Button>

      <p className="text-center text-sm text-ink-muted">
        <Link href="/signin" className="font-medium text-green-800 hover:underline">
          Back to sign in
        </Link>
      </p>
    </form>
  );
}
