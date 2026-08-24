'use server';

import { revalidatePath } from 'next/cache';

import { createClient } from '@/lib/supabase/server';
import { profileSchema } from '@/lib/validation';
import { getCustomer } from '@/server/customer-auth';

export type ActionResult =
  | { ok: true; message: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

/**
 * Updates full name and phone. Email is intentionally not editable here.
 *
 * Changing an auth email is a bigger operation than it looks: Supabase
 * requires re-confirming the new address before it takes effect, the old
 * address typically needs to approve the change too, and until that
 * completes the account has two candidate emails in flight. That flow is not
 * built, and updating email without it would either silently fail or, worse,
 * appear to succeed while leaving sign-in broken. A customer who needs their
 * email changed is directed to contact support instead of being given a
 * control that does not fully work.
 */
export async function updateProfileAction(input: unknown): Promise<ActionResult> {
  const customer = await getCustomer();
  if (!customer) return { ok: false, error: 'Please sign in.' };

  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join('.');
      if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { ok: false, error: 'Please check the highlighted fields.', fieldErrors };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from('profiles')
    .update({ full_name: parsed.data.fullName, phone: parsed.data.phone })
    .eq('id', customer.id);

  if (error) return { ok: false, error: 'Could not save your profile. Please try again.' };

  revalidatePath('/account');
  revalidatePath('/account/profile');
  return { ok: true, message: 'Profile updated successfully.' };
}
