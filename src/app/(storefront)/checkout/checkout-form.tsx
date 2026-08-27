'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Script from 'next/script';
import { useEffect, useState } from 'react';

import { useCart } from '@/components/cart/cart-provider';
import { Button } from '@/components/ui/button';
import { formatPaise } from '@/lib/money';
import { createPaymentOrderAction, placeOrderAction } from '@/server/actions/checkout-actions';
import { Field, TextAreaField } from '@/components/forms/field';

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
 *
 * Guest checkout is unchanged and unconditional. `customer` and `addresses`
 * are optional props supplied only when the visitor is signed in — they
 * prefill fields and offer a saved-address picker, but every field stays
 * editable and nothing here requires an account. A guest sees exactly the
 * form that existed before accounts did.
 *
 * When Razorpay is enabled, submitting does not place the order directly.
 * It first asks the server to price the cart and open a Razorpay order
 * (createPaymentOrderAction), then opens Razorpay's own Checkout widget for
 * that amount. Only the widget's own success callback — carrying a payment id
 * and a signature the server verifies — leads to placeOrderAction actually
 * being called. Closing the widget, or a failed payment, leaves no order
 * behind at all.
 */

type FieldErrors = Record<string, string>;

export type SavedAddress = {
  id: string;
  label: string | null;
  name: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  isDefault: boolean;
};

type CheckoutFormProps = {
  paymentsEnabled: boolean;
  customer?: { name: string; email: string; phone: string } | null;
  addresses?: SavedAddress[];
};

/**
 * The shape actually used from Razorpay's `window.Razorpay` global, injected
 * by the checkout.js script loaded below. No official/maintained @types
 * package exists for it; declaring only what this file calls is safer than
 * pulling in an unofficial community package for a handful of fields.
 */
type RazorpaySuccessResponse = {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
};

type RazorpayInstance = { open: () => void };

type RazorpayOptions = {
  key: string;
  amount: number;
  currency: string;
  order_id: string;
  name: string;
  description?: string;
  prefill?: { name?: string; email?: string; contact?: string };
  theme?: { color?: string };
  handler: (response: RazorpaySuccessResponse) => void;
  modal?: { ondismiss?: () => void };
};

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayOptions) => RazorpayInstance;
  }
}

export function CheckoutForm({
  paymentsEnabled,
  customer = null,
  addresses = [],
}: CheckoutFormProps) {
  const router = useRouter();
  const { items, hydrated, indicativeSubtotalPaise, clear } = useCart();

  const [submitting, setSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [razorpayReady, setRazorpayReady] = useState(false);

  const defaultAddress = addresses.find((a) => a.isDefault) ?? addresses[0] ?? null;
  const [selectedAddressId, setSelectedAddressId] = useState(defaultAddress?.id ?? '');
  const selectedAddress = addresses.find((a) => a.id === selectedAddressId) ?? null;

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

  /** Everything after a verified (or unpaid, when payments are off) submit. */
  async function completeOrder(
    checkoutFields: Record<string, string>,
    payment?: { razorpayOrderId: string; razorpayPaymentId: string; razorpaySignature: string },
  ) {
    const result = await placeOrderAction({
      customer: {
        name: checkoutFields.name,
        email: checkoutFields.email,
        phone: checkoutFields.phone,
      },
      shipping: {
        address: checkoutFields.address,
        city: checkoutFields.city,
        state: checkoutFields.state,
        postalCode: checkoutFields.postalCode,
        country: checkoutFields.country || 'India',
      },
      items: items.map((i) => ({ variantId: i.variantId, quantity: i.quantity })),
      notes: checkoutFields.notes || undefined,
      ...(payment ? { payment } : {}),
    });

    if (!result.ok) {
      setFormError(result.error);
      setFieldErrors(result.fieldErrors ?? {});
      setSubmitting(false);
      setStatusMessage(null);
      document.getElementById('checkout-error')?.focus();
      return;
    }

    // Only clear once the order is definitely written. Clearing optimistically
    // would destroy the cart if the call had failed.
    clear();
    router.push(
      `/order/confirmed?order=${encodeURIComponent(result.orderNumber)}` +
        `&email=${result.emailSent ? '1' : '0'}` +
        // The confirmation page offers "create an account to track this
        // order" only to guests — a signed-in buyer's order is already
        // linked to their account, so the prompt would be redundant.
        `&guest=${result.authenticated ? '0' : '1'}` +
        (result.authenticated ? '' : `&e=${encodeURIComponent(checkoutFields.email)}`),
    );
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setFormError(null);
    setFieldErrors({});
    setStatusMessage(null);

    const form = new FormData(event.currentTarget);
    const fields: Record<string, string> = {};
    for (const key of ['name', 'email', 'phone', 'address', 'city', 'state', 'postalCode', 'country', 'notes']) {
      fields[key] = String(form.get(key) ?? '').trim();
    }

    if (!paymentsEnabled) {
      await completeOrder(fields);
      return;
    }

    // ---- Paid checkout: get a Razorpay order for the server-priced cart ---
    if (!window.Razorpay) {
      setFormError('Payment could not load. Please refresh the page and try again.');
      setSubmitting(false);
      return;
    }

    setStatusMessage('Preparing secure payment…');
    const paymentOrder = await createPaymentOrderAction(
      items.map((i) => ({ variantId: i.variantId, quantity: i.quantity })),
      fields.state,
    );

    if (!paymentOrder.ok) {
      setFormError(paymentOrder.error);
      setSubmitting(false);
      setStatusMessage(null);
      return;
    }

    setStatusMessage(null);

    const razorpay = new window.Razorpay({
      key: paymentOrder.keyId,
      amount: paymentOrder.amountPaise,
      currency: 'INR',
      order_id: paymentOrder.razorpayOrderId,
      name: 'SSG Products',
      description: 'Order payment',
      prefill: { name: fields.name, email: fields.email, contact: fields.phone },
      theme: { color: '#3d7a2f' },
      handler: (response) => {
        setStatusMessage('Payment received — confirming your order…');
        void completeOrder(fields, {
          razorpayOrderId: response.razorpay_order_id,
          razorpayPaymentId: response.razorpay_payment_id,
          razorpaySignature: response.razorpay_signature,
        });
      },
      modal: {
        // Fires when the customer closes the widget without paying. No order
        // was ever created — there is nothing to undo, only the button to
        // re-enable.
        ondismiss: () => {
          setSubmitting(false);
          setStatusMessage(null);
        },
      },
    });

    razorpay.open();
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="grid gap-10 lg:grid-cols-[1fr_22rem] lg:gap-14">
      {paymentsEnabled ? (
        <Script
          src="https://checkout.razorpay.com/v1/checkout.js"
          strategy="afterInteractive"
          onLoad={() => setRazorpayReady(true)}
        />
      ) : null}

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
              defaultValue={customer?.name}
              error={fieldErrors['customer.name']}
              className="sm:col-span-2"
            />
            <Field
              name="email"
              label="Email"
              type="email"
              autoComplete="email"
              required
              defaultValue={customer?.email}
              // A signed-in customer's email is their account identity;
              // changing it here would not change their account email, which
              // would be confusing. They can update it from their profile.
              readOnly={Boolean(customer)}
              hint={
                customer
                  ? 'Your account email. Change it from your profile.'
                  : 'Your order confirmation and tracking link go here.'
              }
              error={fieldErrors['customer.email']}
            />
            <Field
              name="phone"
              label="Phone"
              type="tel"
              autoComplete="tel"
              required
              defaultValue={customer?.phone}
              hint="10-digit Indian mobile."
              error={fieldErrors['customer.phone']}
            />
          </div>
        </fieldset>

        <fieldset className="mt-10 border-0 p-0">
          <legend className="font-display text-xl font-semibold text-earth-900">
            Shipping address
          </legend>

          {addresses.length > 0 ? (
            <div className="mt-4">
              <label htmlFor="savedAddress" className="block text-sm font-medium text-earth-900">
                Use a saved address
              </label>
              <select
                id="savedAddress"
                value={selectedAddressId}
                onChange={(event) => setSelectedAddressId(event.currentTarget.value)}
                className="mt-2 w-full rounded-xl border border-line bg-surface px-3.5 py-3 text-base text-earth-900 focus:border-green-600 sm:max-w-sm"
              >
                <option value="">Enter a new address</option>
                {addresses.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label ? `${a.label} — ` : ''}
                    {a.address}, {a.city}
                    {a.isDefault ? ' (default)' : ''}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          {/*
            Keyed on the selected address so choosing a different one remounts
            these uncontrolled fields with new defaultValues, rather than
            fighting React over who owns the input state.
          */}
          <div key={selectedAddressId} className="mt-5 grid gap-5 sm:grid-cols-2">
            <TextAreaField
              name="address"
              label="Address"
              autoComplete="street-address"
              required
              rows={3}
              defaultValue={selectedAddress?.address}
              error={fieldErrors['shipping.address']}
              className="sm:col-span-2"
            />
            <Field
              name="city"
              label="City"
              autoComplete="address-level2"
              required
              defaultValue={selectedAddress?.city}
              error={fieldErrors['shipping.city']}
            />
            <Field
              name="state"
              label="State"
              autoComplete="address-level1"
              required
              defaultValue={selectedAddress?.state}
              error={fieldErrors['shipping.state']}
            />
            <Field
              name="postalCode"
              label="PIN code"
              autoComplete="postal-code"
              inputMode="numeric"
              required
              defaultValue={selectedAddress?.postalCode}
              error={fieldErrors['shipping.postalCode']}
            />
            <Field
              name="country"
              label="Country"
              autoComplete="country-name"
              defaultValue={selectedAddress?.country ?? 'India'}
              required
              error={fieldErrors['shipping.country']}
            />
            <TextAreaField
              name="notes"
              label="Delivery notes"
              optional
              rows={3}
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

          <Button
            type="submit"
            size="lg"
            full
            className="mt-6"
            disabled={submitting || (paymentsEnabled && !razorpayReady)}
          >
            {statusMessage
              ? statusMessage
              : submitting
                ? 'Placing order…'
                : paymentsEnabled
                  ? 'Proceed to payment'
                  : 'Place order'}
          </Button>

          {!customer ? (
            <p className="mt-4 text-center text-xs text-ink-muted">
              <Link href={`/signin?next=${encodeURIComponent('/checkout')}`} className="text-green-800 hover:underline">
                Sign in
              </Link>{' '}
              to use a saved address, or continue as a guest.
            </p>
          ) : null}

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
