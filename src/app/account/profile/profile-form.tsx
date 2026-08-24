'use client';

import { useState } from 'react';

import { Field } from '@/components/forms/field';
import { Button } from '@/components/ui/button';
import { updateProfileAction } from '@/server/actions/profile-actions';

export function ProfileForm({
  fullName,
  phone,
  email,
}: {
  fullName: string;
  phone: string;
  email: string;
}) {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage(null);
    setError(null);
    setFieldErrors({});

    const form = new FormData(event.currentTarget);
    const result = await updateProfileAction({
      fullName: String(form.get('fullName') ?? ''),
      phone: String(form.get('phone') ?? ''),
    });

    setPending(false);

    if (!result.ok) {
      setError(result.error);
      setFieldErrors(result.fieldErrors ?? {});
      return;
    }

    setMessage(result.message);
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="max-w-lg space-y-5">
      {message ? (
        <p role="status" className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          {message}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="rounded-xl border border-[--color-danger]/25 bg-[--color-danger-surface] px-4 py-3 text-sm text-[--color-danger]">
          {error}
        </p>
      ) : null}

      <Field
        name="email"
        label="Email"
        type="email"
        value={email}
        readOnly
        hint="To change your email, contact support."
      />
      <Field
        name="fullName"
        label="Full name"
        autoComplete="name"
        required
        defaultValue={fullName}
        error={fieldErrors.fullName}
      />
      <Field
        name="phone"
        label="Phone"
        type="tel"
        autoComplete="tel"
        required
        defaultValue={phone}
        hint="10-digit Indian mobile."
        error={fieldErrors.phone}
      />

      <Button type="submit" disabled={pending}>
        {pending ? 'Saving…' : 'Save changes'}
      </Button>
    </form>
  );
}
