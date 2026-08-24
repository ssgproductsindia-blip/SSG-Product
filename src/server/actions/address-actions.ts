'use server';

import { revalidatePath } from 'next/cache';

import { createClient } from '@/lib/supabase/server';
import { addressSchema } from '@/lib/validation';
import { getCustomer } from '@/server/customer-auth';
import type { CustomerAddressRow } from '@/lib/database.types';

/**
 * Saved address management.
 *
 * Every action re-checks getCustomer() itself rather than trusting a
 * profileId passed in from the client, and every write is additionally
 * scoped `.eq('profile_id', customer.id)` even though RLS
 * (`customer_addresses_owner_all`) would refuse a cross-customer row anyway.
 * Belt and braces: if the RLS policy were ever misconfigured, the query
 * still could not touch another customer's address, because it never asks
 * for one.
 */

export type ActionResult =
  | { ok: true; message: string; id?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

export async function listAddressesAction(): Promise<CustomerAddressRow[]> {
  const customer = await getCustomer();
  if (!customer) return [];

  const supabase = await createClient();
  const { data } = await supabase
    .from('customer_addresses')
    .select('*')
    .eq('profile_id', customer.id)
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: false });

  return (data as CustomerAddressRow[] | null) ?? [];
}

export async function saveAddressAction(
  addressId: string | null,
  input: unknown,
): Promise<ActionResult> {
  const customer = await getCustomer();
  if (!customer) return { ok: false, error: 'Please sign in to manage addresses.' };

  const parsed = addressSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join('.');
      if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { ok: false, error: 'Please check the highlighted fields.', fieldErrors };
  }

  const a = parsed.data;
  const supabase = await createClient();

  const row = {
    profile_id: customer.id,
    label: a.label || null,
    name: a.name,
    phone: a.phone,
    address: a.address,
    apartment: a.apartment || null,
    city: a.city,
    state: a.state,
    postal_code: a.postalCode,
    country: a.country,
  };

  // A default flip is two statements — clear, then set — because the unique
  // partial index allows only one is_default=true row per customer at a time.
  // Setting the new one before clearing the old would collide with it.
  if (a.isDefault) {
    await supabase
      .from('customer_addresses')
      .update({ is_default: false })
      .eq('profile_id', customer.id)
      .eq('is_default', true);
  }

  const { data, error } = addressId
    ? await supabase
        .from('customer_addresses')
        .update({ ...row, is_default: a.isDefault })
        .eq('id', addressId)
        .eq('profile_id', customer.id)
        .select('id')
        .single()
    : await supabase
        .from('customer_addresses')
        .insert({ ...row, is_default: a.isDefault })
        .select('id')
        .single();

  if (error) return { ok: false, error: 'Could not save that address. Please try again.' };

  revalidatePath('/account/addresses');
  revalidatePath('/checkout');
  return { ok: true, message: addressId ? 'Address updated.' : 'Address saved.', id: data.id };
}

export async function deleteAddressAction(addressId: string): Promise<ActionResult> {
  const customer = await getCustomer();
  if (!customer) return { ok: false, error: 'Please sign in to manage addresses.' };

  const supabase = await createClient();
  const { error } = await supabase
    .from('customer_addresses')
    .delete()
    .eq('id', addressId)
    .eq('profile_id', customer.id);

  if (error) return { ok: false, error: 'Could not remove that address.' };

  revalidatePath('/account/addresses');
  revalidatePath('/checkout');
  return { ok: true, message: 'Address removed.' };
}

export async function setDefaultAddressAction(addressId: string): Promise<ActionResult> {
  const customer = await getCustomer();
  if (!customer) return { ok: false, error: 'Please sign in to manage addresses.' };

  const supabase = await createClient();

  await supabase
    .from('customer_addresses')
    .update({ is_default: false })
    .eq('profile_id', customer.id)
    .eq('is_default', true);

  const { error } = await supabase
    .from('customer_addresses')
    .update({ is_default: true })
    .eq('id', addressId)
    .eq('profile_id', customer.id);

  if (error) return { ok: false, error: 'Could not update your default address.' };

  revalidatePath('/account/addresses');
  return { ok: true, message: 'Default address updated.' };
}
