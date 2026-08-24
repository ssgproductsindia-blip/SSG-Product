import 'server-only';

import { cache } from 'react';
import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';

/**
 * Customer authorization.
 *
 * Deliberately a separate file from src/server/auth.ts (admin). The two must
 * never be conflated: an admin session and a customer session are the same
 * kind of Supabase auth user underneath, and the ONLY thing that makes
 * someone an admin is a row in `admin_users` (checked in server/auth.ts). This
 * file never checks that table and never grants admin capability — it only
 * ever answers "which customer is this, if any" and reads/writes rows that
 * belong to that customer.
 *
 * getUser() is used, not getSession() — the same reasoning as the admin
 * guard: getSession() reads the cookie without verifying it against the auth
 * server, which is adequate for personalizing a header greeting and not for
 * deciding whose orders and addresses to hand back.
 */

export type Customer = {
  id: string;
  email: string;
  fullName: string | null;
  phone: string | null;
};

/** Returns the signed-in customer, or null. Does not redirect. */
export const getCustomer = cache(async (): Promise<Customer | null> => {
  const supabase = await createClient();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user || !user.email) return null;

  // The profile row is created by a database trigger on signup (see
  // 0005_customer_accounts.sql). If it is somehow missing — an account
  // created before the trigger existed, for instance — the customer still
  // gets a usable identity with blank name/phone rather than being locked out.
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, phone')
    .eq('id', user.id)
    .maybeSingle();

  return {
    id: user.id,
    email: user.email,
    fullName: profile?.full_name ?? null,
    phone: profile?.phone ?? null,
  };
});

/** Guard for /account pages. Redirects to sign-in, preserving the destination. */
export async function requireCustomer(nextPath: string): Promise<Customer> {
  const customer = await getCustomer();
  if (!customer) {
    redirect(`/signin?next=${encodeURIComponent(nextPath)}`);
  }
  return customer;
}
