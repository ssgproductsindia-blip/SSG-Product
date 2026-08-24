import type { Metadata } from 'next';

import { createClient } from '@/lib/supabase/server';
import { getCustomer } from '@/server/customer-auth';
import type { CustomerAddressRow } from '@/lib/database.types';

import { AddressesManager } from './addresses-manager';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Saved Addresses',
  robots: { index: false, follow: false },
};

export default async function AddressesPage() {
  const customer = (await getCustomer())!;
  const supabase = await createClient();

  const { data } = await supabase
    .from('customer_addresses')
    .select('*')
    .eq('profile_id', customer.id)
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: false });

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold text-earth-900">Saved Addresses</h1>
      <p className="mt-1 text-sm text-ink-muted">
        Manage the addresses used at checkout.
      </p>
      <div className="mt-6">
        <AddressesManager addresses={(data as CustomerAddressRow[] | null) ?? []} />
      </div>
    </div>
  );
}
