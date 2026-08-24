import 'server-only';

import { cache } from 'react';
import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';

/**
 * Admin authorization.
 *
 * Two questions, asked separately, because conflating them is how admin panels
 * leak:
 *
 *   1. Who is this?      -> getUser(), which validates the JWT with Supabase
 *                           rather than trusting the cookie's contents.
 *   2. May they be here? -> a real query against admin_users.
 *
 * getSession() is deliberately not used for either. It reads the cookie
 * without verifying it against the auth server, which is fine for rendering a
 * name and unacceptable for granting access.
 *
 * This runs on every admin page. It is not the only defence — RLS refuses the
 * data independently, and the proxy redirects unauthenticated visitors — but
 * it is the one that decides whether a page renders at all.
 */

export type AdminUser = {
  id: string;
  email: string;
  role: 'admin' | 'owner';
};

/**
 * Returns the signed-in admin, or null. Does not redirect — use this where a
 * page needs to render differently rather than bounce.
 */
export const getAdminUser = cache(async (): Promise<AdminUser | null> => {
  const supabase = await createClient();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) return null;

  // Membership in admin_users is the grant. Read under the caller's own JWT,
  // so the admin_users_select policy applies and a non-admin gets nothing
  // even if this query were somehow reached with a valid session.
  const { data: adminRow } = await supabase
    .from('admin_users')
    .select('user_id, email, role')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!adminRow) return null;

  return {
    id: adminRow.user_id,
    email: adminRow.email,
    role: adminRow.role,
  };
});

/**
 * Guard for admin pages and actions. Redirects rather than returning null.
 *
 * A signed-in user who is not an admin is sent to the login page with a
 * message, not to a 403 — there is no reason to confirm to them that an admin
 * area exists behind that URL.
 */
export async function requireAdmin(): Promise<AdminUser> {
  const admin = await getAdminUser();
  if (!admin) {
    redirect('/admin/login?denied=1');
  }
  return admin;
}

/**
 * Writes an entry to the admin audit log.
 *
 * Never throws. A failed audit write must not roll back the action it was
 * describing — losing the log entry is bad, but failing a price update because
 * logging hiccuped is worse, and would be a strange denial-of-service on the
 * store owner. Failures are surfaced in the server log instead.
 */
export async function recordAudit(
  admin: AdminUser,
  entry: {
    action: string;
    entityType: string;
    entityId?: string | null;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  try {
    const supabase = await createClient();
    await supabase.from('admin_audit_logs').insert({
      admin_user_id: admin.id,
      admin_email: admin.email,
      action: entry.action,
      entity_type: entry.entityType,
      entity_id: entry.entityId ?? null,
      metadata: entry.metadata ?? {},
    });
  } catch (cause) {
    console.error('[audit] failed to record admin action', entry.action, cause);
  }
}
