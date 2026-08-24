'use client';

import { useState } from 'react';

import { Field, TextAreaField } from '@/components/forms/field';
import { Button } from '@/components/ui/button';
import { submitContactFormAction } from '@/server/actions/contact-actions';

export function ContactForm() {
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setFieldErrors({});

    const form = new FormData(event.currentTarget);
    const result = await submitContactFormAction({
      name: String(form.get('name') ?? ''),
      email: String(form.get('email') ?? ''),
      phone: String(form.get('phone') ?? ''),
      subject: String(form.get('subject') ?? ''),
      message: String(form.get('message') ?? ''),
      website: String(form.get('website') ?? ''),
    });

    setPending(false);

    if (!result.ok) {
      setError(result.error);
      setFieldErrors(result.fieldErrors ?? {});
      return;
    }

    setSent(true);
  }

  if (sent) {
    return (
      <div role="status" className="rounded-2xl border border-green-200 bg-green-50 p-8 text-center">
        <p className="font-display text-lg font-semibold text-green-900">
          Thank you. Your message has been received.
        </p>
        <p className="mt-2 text-sm text-green-800">We&rsquo;ll get back to you shortly.</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      {/*
        Honeypot: clipped to a 1px box rather than display:none — some spam
        bots specifically skip display:none fields — and removed from the tab
        order and accessibility tree so a real visitor never reaches or hears
        about it. Sized to 1px rather than pushed off-screen so it cannot
        introduce horizontal scroll on any viewport.
      */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          width: 1,
          height: 1,
          padding: 0,
          margin: -1,
          overflow: 'hidden',
          clip: 'rect(0,0,0,0)',
          whiteSpace: 'nowrap',
          border: 0,
        }}
      >
        <label htmlFor="website">Website</label>
        <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field name="name" label="Name" autoComplete="name" required error={fieldErrors.name} />
        <Field
          name="email"
          label="Email"
          type="email"
          autoComplete="email"
          required
          error={fieldErrors.email}
        />
      </div>
      <Field
        name="phone"
        label="Phone"
        type="tel"
        autoComplete="tel"
        optional
        error={fieldErrors.phone}
      />
      <Field name="subject" label="Subject" required error={fieldErrors.subject} />
      <TextAreaField
        name="message"
        label="Message"
        required
        rows={5}
        error={fieldErrors.message}
      />

      {error ? (
        <p
          role="alert"
          className="rounded-xl border border-[--color-danger]/25 bg-[--color-danger-surface] px-4 py-3 text-sm text-[--color-danger]"
        >
          {error}
        </p>
      ) : null}

      <Button type="submit" size="lg" disabled={pending}>
        {pending ? 'Sending…' : 'Send Message'}
      </Button>
    </form>
  );
}
