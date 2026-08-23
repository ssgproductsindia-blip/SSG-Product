'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { useCart } from '@/components/cart/cart-provider';
import { Button } from '@/components/ui/button';
import { formatPaise } from '@/lib/money';
import { cn } from '@/lib/utils';
import { placeOrderAction } from '@/server/actions/checkout-actions';

/**
 * Checkout.
 *
 * Note what is not sent: prices. The payload carries the customer's details
 * and a list of `{ variantId, quantity }`. The server prices the order from
 * the database inside the same transaction that writes it.
 *
 * The summary shown here is the local snapshot, labelled as indicative. If it
 * ever disagrees with what the server computes, the server wins and the
 * confirmation reflects the real figure.
 */

type FieldErrors = Record<string, string>;

export function CheckoutForm({ paymentsEnabled }: { paymentsEnabled: boolean }) {
  const router = useRouter();
  const { items, hydrated, indicativeSubtotalPaise, clear } = useCart();

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  // An empty cart at checkout means someone deep-linked or emptied it in
  // another tab. Send them back rather than rendering a form that cannot work.
  useEffect(() => {
    if (hydrated && items.length === 0 && !submitting) {
      router.replace('/cart');
    }
  }, [hydrated, items.length, submitting, router]);

  if (!hydrated) {
    return <p className="py-16 text-center text-ink-muted">Loading checkout…</p>;
  }

  if (items.length === 0) {
    return null;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setFormError(null);
    setFieldErrors({});

    const form = new FormData(event.currentTarget);
    const value = (name: string) => String(form.get(name) ?? '').trim();

    const result = await placeOrderAction({
      customer: {
        name: value('name'),
        email: value('email'),
        phone: value('phone'),
      },
      shipping: {
        address: value('address'),
        city: value('city'),
        state: value('state'),
        postalCode: value('postalCode'),
        country: value('country') || 'India',
      },
      items: items.map((i) => ({ variantId: i.variantId, quantity: i.quantity })),
      notes: value('notes') || undefined,
    });

    if (!result.ok) {
      setFormError(result.error);
      setFieldErrors(result.fieldErrors ?? {});
      setSubmitting(false);
      // Move focus to the error so it is announced rather than silently
      // appearing above the fold.
      document.getElementById('checkout-error')?.focus();
      return;
    }

    // Only clear once the order is definitely written. Clearing optimistically
    // would destroy the cart if the call had failed.
    clear();
    router.push(
      `/order/confirmed?order=${encodeURIComponent(result.orderNumber)}&email=${result.emailSent ? '1' : '0'}`,
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="grid gap-10 lg:grid-cols-[1fr_22rem] lg:gap-14">
      <div>
        {formError ? (
          <p
            id="checkout-error"
            role="alert"
            tabIndex={-1}
            className="mb-8 rounded-xl border border-[--color-danger]/25 bg-[--color-danger-surface] px-4 py-3 text-sm font-medium text-[--color-danger]"
          >
            {formError}
          </p>
        ) : null}

        <fieldset className="border-0 p-0">
          <legend className="font-display text-xl font-semibold text-earth-900">
            Your details
          </legend>
          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <Field
              name="name"
              label="Full name"
              autoComplete="name"
              required
              error={fieldErrors['customer.name']}
              className="sm:col-span-2"
            />
            <Field
              name="email"
              label="Email"
              type="email"
              autoComplete="email"
              required
              hint="Your order confirmation and tracking link go here."
              error={fieldErrors['customer.email']}
            />
            <Field
              name="phone"
              label="Phone"
              type="tel"
              autoComplete="tel"
              required
              hint="10-digit Indian mobile."
              error={fieldErrors['customer.phone']}
            />
          </div>
        </fieldset>

        <fieldset className="mt-10 border-0 p-0">
          <legend className="font-display text-xl font-semibold text-earth-900">
            Shipping address
          </legend>
          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <Field
              name="address"
              label="Address"
              autoComplete="street-address"
              required
              multiline
              error={fieldErrors['shipping.address']}
              className="sm:col-span-2"
            />
            <Field
              name="city"
              label="City"
              autoComplete="address-level2"
              required
              error={fieldErrors['shipping.city']}
            />
            <Field
              name="state"
              label="State"
              autoComplete="address-level1"
              required
              error={fieldErrors['shipping.state']}
            />
            <Field
              name="postalCode"
              label="PIN code"
              autoComplete="postal-code"
              inputMode="numeric"
              required
              error={fieldErrors['shipping.postalCode']}
            />
            <Field
              name="country"
              label="Country"
              autoComplete="country-name"
              defaultValue="India"
              required
              error={fieldErrors['shipping.country']}
            />
            <Field
              name="notes"
              label="Delivery notes"
              optional
              multiline
              error={fieldErrors['notes']}
              className="sm:col-span-2"
            />
          </div>
        </fieldset>
      </div>

      {/* ---- Summary --------------------------------------------------- */}
      <aside aria-labelledby="checkout-summary" className="lg:sticky lg:top-28 lg:self-start">
        <div className="rounded-2xl border border-line bg-surface p-6">
          <h2 id="checkout-summary" className="font-display text-lg font-semibold text-earth-900">
            Order summary
          </h2>

          <ul className="mt-5 space-y-3 border-b border-line pb-5">
            {items.map((item) => (
              <li key={item.variantId} className="flex justify-between gap-3 text-sm">
                <span className="text-stone-700">
                  {item.productName}
                  <span className="block text-xs text-ink-muted">
                    {item.variantName} × {item.quantity}
                  </span>
                </span>
                <span className="shrink-0 font-medium tabular-nums text-earth-900">
                  {formatPaise(item.sellingPricePaise * item.quantity)}
                </span>
              </li>
            ))}
          </ul>

          <div className="mt-5 flex justify-between">
            <span className="font-display text-base font-semibold text-earth-900">Total</span>
            <span className="font-display text-lg font-semibold tabular-nums text-earth-900">
              {formatPaise(indicativeSubtotalPaise)}
            </span>
          </div>

          <p className="mt-2 text-xs leading-relaxed text-ink-muted">
            Confirmed against our records when you place the order. Shipping, if
            it applies, is added then.
          </p>

          {/*
            Payments are off until Razorpay credentials are configured. Saying
            so plainly is the whole point — the alternative is a checkout that
            implies payment was taken when none was.
          */}
          {!paymentsEnabled ? (
            <p className="mt-5 rounded-xl border border-gold-400/50 bg-[--color-warning-surface] px-4 py-3 text-xs leading-relaxed text-[--color-warning]">
              <strong className="font-semibold">Payment is not collected online yet.</strong> Your
              order will be recorded and we will contact you to arrange payment
              before dispatch.
            </p>
          ) : null}

          <Button type="submit" size="lg" full className="mt-6" disabled={submitting}>
            {submitting ? 'Placing order…' : 'Place order'}
          </Button>

          <p className="mt-4 text-center text-xs text-ink-muted">
            <Link href="/cart" className="hover:text-green-800 hover:underline">
              Back to cart
            </Link>
          </p>
        </div>
      </aside>
    </form>
  );
}

/**
 * Labelled form field.
 *
 * Every input has a real <label>, errors are wired through aria-describedby
 * and aria-invalid, and required fields carry `required` rather than only a
 * visual asterisk. `noValidate` on the form means our messages show instead of
 * the browser's, so these attributes are what a screen reader has to go on.
 */
function Field({
  name,
  label,
  type = 'text',
  error,
  hint,
  optional = false,
  multiline = false,
  className,
  ...rest
}: {
  name: string;
  label: string;
  type?: string;
  error?: string;
  hint?: string;
  optional?: boolean;
  multiline?: boolean;
  className?: string;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'name' | 'type' | 'className'>) {
  const describedBy = [hint ? `${name}-hint` : null, error ? `${name}-error` : null]
    .filter(Boolean)
    .join(' ');

  const shared = {
    id: name,
    name,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': describedBy || undefined,
    className: cn(
      'w-full rounded-xl border bg-surface px-3.5 py-3 text-base text-earth-900',
      'placeholder:text-stone-400 transition-colors',
      error ? 'border-[--color-danger]' : 'border-line focus:border-green-600',
    ),
  };

  return (
    <div className={className}>
      <label htmlFor={name} className="block text-sm font-medium text-earth-900">
        {label}
        {optional ? <span className="ml-1.5 font-normal text-ink-muted">(optional)</span> : null}
      </label>

      {hint ? (
        <p id={`${name}-hint`} className="mt-1 text-xs text-ink-muted">
          {hint}
        </p>
      ) : null}

      <div className="mt-2">
        {multiline ? (
          <textarea rows={3} {...shared} {...(rest as React.TextareaHTMLAttributes<HTMLTextAreaElement>)} />
        ) : (
          <input type={type} {...shared} {...rest} />
        )}
      </div>

      {error ? (
        <p id={`${name}-error`} role="alert" className="mt-1.5 text-sm text-[--color-danger]">
          {error}
        </p>
      ) : null}
    </div>
  );
}
