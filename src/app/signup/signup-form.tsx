'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { MailCheck } from 'lucide-react';

import { Field } from '@/components/forms/field';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/client';
import { signUpSchema } from '@/lib/validation';

/**
 * Customer sign-up.
 *
 * Calls Supabase directly from the client, the same pattern already used by
 * the admin login form — there is no server action here because there is
 * nothing for one to add: Supabase IS the identity provider, and a profile
 * row is created by the database trigger on the auth.users insert (see
 * 0005_customer_accounts.sql), not by application code.
 *
 * Duplicate-email detection relies on Supabase's documented signal for it:
 * with email confirmations on, signUp against an existing address returns a
 * user object with an empty `identities` array and no error, rather than
 * throwing. That is deliberately not a generic "check your email" message —
 * the brief calls for the explicit "an account already exists" wording here,
 * which is a considered trade-off for a consumer signup form and different
 * from sign-in or password reset, where confirming an email's existence
 * would be an enumeration risk this project avoids elsewhere.
 */
export function SignUpForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = safeNext(searchParams.get('next'));
  // Prefilled only from the guest-checkout "create an account" prompt, which
  // puts the address the customer already typed moments ago into the link —
  // never a value read from anyone else's data.
  const prefillEmail = searchParams.get('email') ?? '';

  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [confirmEmailSent, setConfirmEmailSent] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setFormError(null);
    setFieldErrors({});

    const form = new FormData(event.currentTarget);
    const parsed = signUpSchema.safeParse({
      fullName: String(form.get('fullName') ?? ''),
      email: String(form.get('email') ?? ''),
      phone: String(form.get('phone') ?? ''),
      password: String(form.get('password') ?? ''),
      confirmPassword: String(form.get('confirmPassword') ?? ''),
    });

    if (!parsed.success) {
      const errors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path.join('.');
        if (key && !errors[key]) errors[key] = issue.message;
      }
      setFieldErrors(errors);
      setPending(false);
      return;
    }

    const supabase = createClient();
    const { data, error } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: {
        data: { full_name: parsed.data.fullName, phone: parsed.data.phone },
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });

    setPending(false);

    if (error) {
      setFormError(
        error.status === 429
          ? 'Too many attempts. Please wait a minute and try again.'
          : 'Unable to create your account. Please try again.',
      );
      return;
    }

    // Existing, already-registered email — see the file docstring.
    if (data.user && data.user.identities && data.user.identities.length === 0) {
      setFormError('An account with this email already exists. Try signing in instead.');
      return;
    }

    if (data.session) {
      // Email confirmation is off for this project — the account is active
      // immediately, so go straight in rather than asking them to check mail
      // that was never sent.
      router.push(next);
      router.refresh();
      return;
    }

    setConfirmEmailSent(true);
  }

  if (confirmEmailSent) {
    return (
      <div className="rounded-2xl border border-line bg-surface p-8 text-center">
        <MailCheck className="mx-auto size-10 text-green-600" aria-hidden />
        <h2 className="mt-4 font-display text-lg font-semibold text-earth-900">
          Confirm your email
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">
          We&rsquo;ve sent a confirmation link to your inbox. Click it to
          activate your account.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      <Field
        name="fullName"
        label="Full name"
        autoComplete="name"
        required
        error={fieldErrors.fullName}
      />
      <Field
        name="email"
        label="Email"
        type="email"
        autoComplete="email"
        required
        defaultValue={prefillEmail}
        error={fieldErrors.email}
      />
      <Field
        name="phone"
        label="Mobile number"
        type="tel"
        autoComplete="tel"
        required
        hint="10-digit Indian mobile."
        error={fieldErrors.phone}
      />
      <Field
        name="password"
        label="Password"
        type="password"
        autoComplete="new-password"
        required
        hint="At least 8 characters, with letters and numbers."
        error={fieldErrors.password}
      />
      <Field
        name="confirmPassword"
        label="Confirm password"
        type="password"
        autoComplete="new-password"
        required
        error={fieldErrors.confirmPassword}
      />

      {formError ? (
        <p
          role="alert"
          className="rounded-xl border border-[--color-danger]/25 bg-[--color-danger-surface] px-4 py-3 text-sm text-[--color-danger]"
        >
          {formError}
        </p>
      ) : null}

      <Button type="submit" size="lg" full disabled={pending}>
        {pending ? 'Creating account…' : 'Create account'}
      </Button>

      <p className="text-center text-sm text-ink-muted">
        Already have an account?{' '}
        <Link
          href={`/signin${next !== '/account' ? `?next=${encodeURIComponent(next)}` : ''}`}
          className="font-medium text-green-800 hover:underline"
        >
          Sign in
        </Link>
      </p>
    </form>
  );
}

/** Only same-site paths are honoured — see the identical guard on /admin/login. */
function safeNext(value: string | null): string {
  return value && value.startsWith('/') && !value.startsWith('//') ? value : '/account';
}
