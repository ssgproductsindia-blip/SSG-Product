import { NextResponse, type NextRequest } from 'next/server';

import { createClient } from '@/lib/supabase/server';

/**
 * Customer auth callback.
 *
 * Separate from /admin/auth/callback on purpose — same mechanism (exchange a
 * PKCE code for a session), but this is the customer-facing entry point and
 * must never redirect anywhere under /admin. It handles two links Supabase
 * sends: email confirmation after sign-up, and the password-recovery link
 * from forgot-password. Both land here with a `code` and a `next`.
 *
 * As with the admin callback, every failure lands on a generic page with a
 * generic message — there is no branch here that reveals whether a code was
 * expired versus already used versus never valid.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get('code');

  const requested = searchParams.get('next') ?? '';
  const nextPath =
    requested.startsWith('/') && !requested.startsWith('//') && !requested.startsWith('/admin')
      ? requested
      : '/account';

  if (!code) {
    return NextResponse.redirect(`${origin}/signin?error=1`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(`${origin}/signin?error=1`);
  }

  return NextResponse.redirect(`${origin}${nextPath}`);
}
