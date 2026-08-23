import 'server-only';

import { createClient as createSupabaseClient } from '@supabase/supabase-js';

import { publicEnv, serverEnv } from '@/lib/env';
import type { Database } from '@/lib/database.types';

/**
 * Service-role client. Bypasses Row Level Security entirely.
 *
 * Use this ONLY where RLS cannot express the rule:
 *
 *   - creating a guest order (the customer has no auth identity to match)
 *   - writing notification_logs from the mail sender
 *   - the admin bootstrap script
 *
 * Every call site must have already answered "who is asking, and may they?"
 * by other means. This client answers neither question — it is a skeleton key,
 * and reaching for it because a query returned nothing under RLS is how a
 * storefront ends up serving one customer another customer's address.
 *
 * `server-only` at the top of this file means an import from a client
 * component is a build error, not a production incident.
 */
export function createServiceClient() {
  return createSupabaseClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    serverEnv().SUPABASE_SECRET_KEY,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        // This client must never adopt a user session from a cookie or URL
        // fragment; it is meant to be identity-less.
        detectSessionInUrl: false,
      },
    },
  );
}
