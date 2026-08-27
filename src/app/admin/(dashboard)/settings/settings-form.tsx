'use client';

import { useState } from 'react';

import { Field, TextAreaField } from '@/components/admin/field';
import { Button } from '@/components/ui/button';
import { paiseToRupeeInput, rupeesToPaise } from '@/lib/money';
import { cn } from '@/lib/utils';
import { updateStoreSettingsAction } from '@/server/actions/settings-actions';

type Initial = {
  storeName: string;
  whatsapp: string;
  instagramUrl: string;
  email: string;
  address: string;
  shippingFlatPaise: number | null;
  shippingTamilNaduPaise: number | null;
  freeShippingThresholdPaise: number | null;
};

/**
 * Store details form.
 *
 * Every field here is tied to a real consumer, named in its own hint so the
 * connection is visible from the form itself rather than only in a code
 * comment: WhatsApp/Instagram feed the footer and contact page, the email
 * feeds the contact-form destination, the address shows on /contact, and the
 * shipping figures are what src/server/pricing.ts and create_order actually
 * charge at checkout — leaving them blank means shipping stays free, not
 * "not yet decided". The Tamil Nadu rate only takes effect once the
 * rest-of-India rate is also set; a Tamil Nadu rate alone has no default to
 * fall back to for every other state, so the form blocks that combination
 * client-side rather than silently saving something that does nothing.
 */
export function SettingsForm({ initial }: { initial: Initial }) {
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setResult(null);
    setFieldErrors({});

    const form = new FormData(event.currentTarget);
    const text = (name: string) => String(form.get(name) ?? '').trim();

    const flatRaw = text('shippingFlat');
    const tamilNaduRaw = text('shippingTamilNadu');
    const thresholdRaw = text('freeShippingThreshold');

    const shippingFlatPaise = flatRaw === '' ? null : rupeesToPaise(flatRaw);
    const shippingTamilNaduPaise = tamilNaduRaw === '' ? null : rupeesToPaise(tamilNaduRaw);
    const freeShippingThresholdPaise = thresholdRaw === '' ? null : rupeesToPaise(thresholdRaw);

    if (flatRaw !== '' && shippingFlatPaise === null) {
      setResult({ ok: false, message: 'Enter the shipping rate as a plain number, e.g. 100' });
      setSubmitting(false);
      return;
    }
    if (tamilNaduRaw !== '' && shippingTamilNaduPaise === null) {
      setResult({ ok: false, message: 'Enter the Tamil Nadu rate as a plain number, e.g. 50' });
      setSubmitting(false);
      return;
    }
    if (tamilNaduRaw !== '' && flatRaw === '') {
      setResult({
        ok: false,
        message: 'Set the rest-of-India rate too — a Tamil Nadu rate with no default has nothing to fall back to outside Tamil Nadu.',
      });
      setSubmitting(false);
      return;
    }
    if (thresholdRaw !== '' && freeShippingThresholdPaise === null) {
      setResult({ ok: false, message: 'Enter the free-shipping threshold as a plain number, e.g. 999' });
      setSubmitting(false);
      return;
    }

    const res = await updateStoreSettingsAction({
      storeName: text('storeName'),
      whatsapp: text('whatsapp'),
      instagramUrl: text('instagramUrl'),
      email: text('email'),
      address: text('address'),
      shippingFlatPaise,
      shippingTamilNaduPaise,
      freeShippingThresholdPaise,
    });

    if (res.ok) {
      setResult({ ok: true, message: res.message });
    } else {
      setResult({ ok: false, message: res.error });
      setFieldErrors(res.fieldErrors ?? {});
    }
    setSubmitting(false);
  }

  return (
    <form onSubmit={handleSubmit} className="mt-4 space-y-5">
      <Field
        name="storeName"
        label="Store name"
        defaultValue={initial.storeName}
        error={fieldErrors.storeName}
        required
      />

      <Field
        name="whatsapp"
        label="WhatsApp number"
        defaultValue={initial.whatsapp}
        error={fieldErrors.whatsapp}
        placeholder="+91 81489 93990"
        hint="Shown as a chat link in the footer and on the Contact page."
      />

      <Field
        name="instagramUrl"
        label="Instagram URL"
        type="url"
        defaultValue={initial.instagramUrl}
        error={fieldErrors.instagramUrl}
        placeholder="https://instagram.com/ssgproducts"
        hint="Full profile link, not just the handle."
      />

      <Field
        name="email"
        label="Contact email"
        type="email"
        defaultValue={initial.email}
        error={fieldErrors.email}
        hint="Messages from the Contact form are sent here. Leave blank and the contact form tells visitors it isn't set up yet, rather than silently failing."
      />

      <TextAreaField
        name="address"
        label="Address"
        rows={3}
        defaultValue={initial.address}
        error={fieldErrors.address}
        optional
        hint="Shown on the Contact page. Leave blank to hide it there."
      />

      <div className="grid gap-5 border-t border-line pt-5 sm:grid-cols-2">
        <Field
          name="shippingFlat"
          label="Shipping rate — rest of India"
          prefix="₹"
          inputMode="decimal"
          defaultValue={
            initial.shippingFlatPaise !== null ? paiseToRupeeInput(initial.shippingFlatPaise) : ''
          }
          hint="Charged on every order, unless a Tamil Nadu rate below applies. Leave blank for free shipping on everything."
        />
        <Field
          name="shippingTamilNadu"
          label="Shipping rate — Tamil Nadu"
          optional
          prefix="₹"
          inputMode="decimal"
          defaultValue={
            initial.shippingTamilNaduPaise !== null
              ? paiseToRupeeInput(initial.shippingTamilNaduPaise)
              : ''
          }
          hint="Charged instead of the rate above when the delivery state is Tamil Nadu. Leave blank to charge the same rate everywhere."
        />
        <Field
          name="freeShippingThreshold"
          label="Free shipping above"
          prefix="₹"
          inputMode="decimal"
          defaultValue={
            initial.freeShippingThresholdPaise !== null
              ? paiseToRupeeInput(initial.freeShippingThresholdPaise)
              : ''
          }
          hint="Waives shipping above this subtotal, in every state. Does nothing if the rest-of-India rate above is blank."
          className="sm:col-span-2"
        />
      </div>

      <Button type="submit" disabled={submitting}>
        {submitting ? 'Saving…' : 'Save settings'}
      </Button>

      {result ? (
        <p
          role={result.ok ? 'status' : 'alert'}
          className={cn('text-sm', result.ok ? 'text-green-700' : 'text-[--color-danger]')}
        >
          {result.message}
        </p>
      ) : null}
    </form>
  );
}
