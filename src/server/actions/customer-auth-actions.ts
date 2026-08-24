'use server';

import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';

/**
 * Customer sign-out. Deliberately not shared with the admin sign-out action
 * in auth-actions.ts, which redirects to /admin/login — a customer signing
 * out belongs on the public site, not the admin login screen.
 *
 * supabase.auth.signOut() invalidates the refresh token server-side and
 * clears the session cookies via the response the server client writes to,
 * so a signed-out visitor's browser genuinely has nothing left to replay.
 */
export async function customerSignOutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/');
}
