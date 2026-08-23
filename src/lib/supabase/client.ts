'use client';

import { createBrowserClient } from '@supabase/ssr';

import { publicEnv } from '@/lib/env';
import type { Database } from '@/lib/database.types';

/**
 * Browser client, used only for the admin magic-link sign-in flow.
 *
 * The storefront deliberately does not read data through this client. Product
 * data is fetched on the server so it can be cached and rendered into HTML,
 * and order data is never client-readable at all. Keeping browser queries out
 * of the storefront means the publishable key's blast radius stays limited to
 * exactly what the RLS policies expose to `anon`.
 */
export function createClient() {
  return createBrowserClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}
