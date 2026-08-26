'use client';

import { useState } from 'react';

import { Field } from '@/components/admin/field';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { updateShipmentTrackingAction } from '@/server/actions/order-actions';

type Initial = { courierName: string; trackingId: string; trackingUrl: string } | null;

/**
 * Courier and tracking form — brief §43/§44.
 *
 * The result message is shown verbatim from describeOutcome() (see
 * order-actions.ts), which is deliberate: it is the one place in this app
 * that has to say "saved, but the email did not go out" as its own sentence,
 * not folded into a generic success toast that would bury it.
 */
export function TrackingForm({
  orderId,
  initial,
  disabled = false,
}: {
  orderId: string;
  initial: Initial;
  disabled?: boolean;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setResult(null);
    setFieldErrors({});

    const form = new FormData(event.currentTarget);

    const res = await updateShipmentTrackingAction({
      orderId,
      courierName: String(form.get('courierName') ?? '').trim(),
      trackingId: String(form.get('trackingId') ?? '').trim(),
      trackingUrl: String(form.get('trackingUrl') ?? '').trim(),
    });

    if (res.ok) {
      setResult({ ok: true, message: res.message });
    } else {
      setResult({ ok: false, message: res.error });
      setFieldErrors(res.fieldErrors ?? {});
    }
    setSubmitting(false);
  }

  if (disabled) {
    return (
      <p className="mt-3 text-sm text-stone-500">
        This order is cancelled and cannot be shipped.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-3 space-y-4">
      <Field
        name="courierName"
        label="Courier"
        defaultValue={initial?.courierName ?? ''}
        error={fieldErrors.courierName}
        placeholder="e.g. DTDC, Delhivery, India Post"
        required
      />
      <Field
        name="trackingId"
        label="Tracking ID"
        defaultValue={initial?.trackingId ?? ''}
        error={fieldErrors.trackingId}
        required
      />
      <Field
        name="trackingUrl"
        label="Tracking URL"
        optional
        type="url"
        defaultValue={initial?.trackingUrl ?? ''}
        error={fieldErrors.trackingUrl}
        placeholder="https://…"
        hint="Shown as a button in the shipping email and on the customer's tracking page."
      />

      <Button type="submit" size="sm" full disabled={submitting}>
        {submitting ? 'Saving…' : initial ? 'Update tracking' : 'Save tracking'}
      </Button>

      {result ? (
        <p
          role={result.ok ? 'status' : 'alert'}
          className={cn('text-sm leading-relaxed', result.ok ? 'text-green-700' : 'text-[--color-danger]')}
        >
          {result.message}
        </p>
      ) : null}
    </form>
  );
}
