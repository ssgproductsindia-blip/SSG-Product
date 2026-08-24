import type { Metadata } from 'next';

import { paymentsConfigured } from '@/lib/env';
import { listAddressesAction } from '@/server/actions/address-actions';
import { getCustomer } from '@/server/customer-auth';

import { CheckoutForm } from './checkout-form';

export const metadata: Metadata = {
  title: 'Checkout',
  robots: { index: false, follow: false },
};

/**
 * Checkout page shell.
 *
 * Guest checkout is unchanged: getCustomer() returns null for a guest, so
 * `customer` and `addresses` are simply empty and the form renders exactly as
 * it always has. Signing in only adds prefill and a saved-address picker on
 * top of the same fields — it does not gate the flow.
 */
export default async function CheckoutPage() {
  const paymentsEnabled = paymentsConfigured();
  const customer = await getCustomer();
  const addresses = customer ? await listAddressesAction() : [];

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
      <h1 className="font-display text-3xl font-semibold tracking-tight text-earth-900 sm:text-4xl">
        Checkout
      </h1>
      <div className="mt-10">
        <CheckoutForm
          paymentsEnabled={paymentsEnabled}
          customer={
            customer
              ? { name: customer.fullName ?? '', email: customer.email, phone: customer.phone ?? '' }
              : null
          }
          addresses={addresses.map((a) => ({
            id: a.id,
            label: a.label,
            name: a.name,
            phone: a.phone,
            address: a.apartment ? `${a.apartment}, ${a.address}` : a.address,
            city: a.city,
            state: a.state,
            postalCode: a.postal_code,
            country: a.country,
            isDefault: a.is_default,
          }))}
        />
      </div>
    </div>
  );
}
