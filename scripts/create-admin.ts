/**
 * Admin bootstrap.
 *
 *   npx tsx scripts/create-admin.ts owner@example.com
 *
 * Creates (or finds) a Supabase auth user for the given email and inserts them
 * into `admin_users`, which is what `is_admin()` — and therefore every admin
 * RLS policy — checks.
 *
 * Why this is a script and not a page: there is deliberately no INSERT policy
 * on `admin_users`. If admins could be created through the API, a single
 * compromised admin session could mint permanent additional admins. Granting
 * access requires the secret key and someone deciding to run this.
 *
 * No password is set. Sign-in is by magic link, so there is no admin password
 * to phish, reuse, or leak — see src/app/admin/login.
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Minimal .env.local loader so this runs without extra tooling.
function loadEnvLocal() {
  try {
    const raw = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
    for (const line of raw.split('\n')) {
      const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (!match) continue;
      const [, key, value] = match;
      if (!process.env[key]) {
        process.env[key] = value.replace(/^["']|["']$/g, '');
      }
    }
  } catch {
    // No .env.local — fall back to the real environment (CI, Vercel shell).
  }
}

async function main() {
  loadEnvLocal();

  const email = process.argv[2]?.trim().toLowerCase();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    console.error('Usage: npx tsx scripts/create-admin.ts <email>');
    process.exit(1);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !secret) {
    console.error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY.\n' +
        'Copy .env.example to .env.local and fill both in first.',
    );
    process.exit(1);
  }

  const supabase = createClient(url, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Create the auth user, or reuse the existing one.
  let userId: string | undefined;

  const { data: created, error: createError } = await supabase.auth.admin.createUser({
    email,
    email_confirm: true,
  });

  if (created?.user) {
    userId = created.user.id;
    console.log(`Created auth user for ${email}`);
  } else if (createError) {
    // Already registered — find them instead of failing.
    const { data: list, error: listError } = await supabase.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
    if (listError) {
      console.error(`Could not look up existing users: ${listError.message}`);
      process.exit(1);
    }
    userId = list.users.find((u) => u.email?.toLowerCase() === email)?.id;

    if (!userId) {
      console.error(`Could not create or find a user for ${email}: ${createError.message}`);
      process.exit(1);
    }
    console.log(`Auth user for ${email} already existed — reusing it.`);
  }

  const { error: grantError } = await supabase
    .from('admin_users')
    .upsert({ user_id: userId!, email, role: 'owner' }, { onConflict: 'user_id' });

  if (grantError) {
    console.error(`Could not grant admin access: ${grantError.message}`);
    process.exit(1);
  }

  console.log(
    `\n${email} is now an admin.\n` +
      `Sign in at ${process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'}/admin/login\n` +
      `— you will receive a magic link; there is no password.`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
