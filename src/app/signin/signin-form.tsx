'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';

import { Field } from '@/components/forms/field';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/client';
import { signInSchema } from '@/lib/validation';

/**
 * Customer sign-in — email + password.
 *
 * Called directly from the client, matching the admin login form's pattern
 * of talking to Supabase directly rather than through a server action; there
 * is no server-side logic to add on top of "verify these credentials".
 *
 * The error message is deliberately generic on failure ("check your email
 * and password") rather than distinguishing "wrong password" from "no such
 * account" — unlike sign-up, revealing account existence here is exactly the
 * enumeration risk the brief asks to avoid on this page.
 */
export function SignInForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = safeNext(searchParams.get('next'));

  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setFieldErrors({});

    const form = new FormData(event.currentTarget);
    const parsed = signInSchema.safeParse({
      email: String(form.get('email') ?? ''),
      password: String(form.get('password') ?? ''),
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
    const { error: signInError } = await supabase.auth.signInWithPassword(parsed.data);

    setPending(false);

    if (signInError) {
      setError(
        signInError.status === 429
          ? 'Too many attempts. Please wait a minute and try again.'
          : 'Unable to sign in. Please check your email and password.',
      );
      return;
    }

    router.push(next);
    router.refresh();
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
        error={fieldErrors.email}
      />
      <div>
        <Field
          name="password"
          label="Password"
          type="password"
          autoComplete="current-password"
          required
          error={fieldErrors.password}
        />
        <p className="mt-2 text-right text-sm">
          <Link href="/forgot-password" className="text-green-800 hover:underline">
            Forgot password?
          </Link>
        </p>
      </div>

      {error ? (
        <p
          role="alert"
          className="rounded-xl border border-[--color-danger]/25 bg-[--color-danger-surface] px-4 py-3 text-sm text-[--color-danger]"
        >
          {error}
        </p>
      ) : null}

      <Button type="submit" size="lg" full disabled={pending}>
        {pending ? 'Signing in…' : 'Sign in'}
      </Button>

      <p className="text-center text-sm text-ink-muted">
        Don&rsquo;t have an account?{' '}
        <Link
          href={`/signup${next !== '/account' ? `?next=${encodeURIComponent(next)}` : ''}`}
          className="font-medium text-green-800 hover:underline"
        >
          Create account
        </Link>
      </p>
    </form>
  );
}

function safeNext(value: string | null): string {
  return value && value.startsWith('/') && !value.startsWith('//') ? value : '/account';
}
