import 'server-only';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

import { publicEnv } from '@/lib/env';
import type { Database } from '@/lib/database.types';

/**
 * Request-scoped Supabase client bound to the caller's session cookies.
 *
 * This client uses the PUBLISHABLE key, so every query it makes is subject to
 * Row Level Security under the caller's own identity. That is the point: admin
 * pages read through this client, so if the RLS policies are wrong the admin
 * pages break loudly rather than a compromised session quietly reading orders.
 *
 * For the narrow set of operations that must bypass RLS — creating a guest
 * order, sending mail — use `createServiceClient()` instead, and only from
 * code that has already established who the caller is.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Server Components cannot write cookies. This throw is expected
            // there and safe to swallow, because middleware refreshes the
            // session on every request and writes the cookies itself.
          }
        },
      },
    },
  );
}
