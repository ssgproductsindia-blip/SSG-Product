'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Field } from '@/components/forms/field';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/client';
import { resetPasswordSchema } from '@/lib/validation';

export function ResetPasswordForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [done, setDone] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setFieldErrors({});

    const form = new FormData(event.currentTarget);
    const parsed = resetPasswordSchema.safeParse({
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
    const { error: updateError } = await supabase.auth.updateUser({
      password: parsed.data.password,
    });

    setPending(false);

    if (updateError) {
      setError('Unable to update your password. Please request a new reset link and try again.');
      return;
    }

    setDone(true);
    setTimeout(() => {
      router.push('/account');
      router.refresh();
    }, 1500);
  }

  if (done) {
    return (
      <p
        role="status"
        className="rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800"
      >
        Password updated successfully. Taking you to your account…
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      <Field
        name="password"
        label="New password"
        type="password"
        autoComplete="new-password"
        required
        autoFocus
        hint="At least 8 characters, with letters and numbers."
        error={fieldErrors.password}
      />
      <Field
        name="confirmPassword"
        label="Confirm new password"
        type="password"
        autoComplete="new-password"
        required
        error={fieldErrors.confirmPassword}
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
        {pending ? 'Updating…' : 'Update password'}
      </Button>
    </form>
  );
}
