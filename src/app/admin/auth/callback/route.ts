import { NextResponse, type NextRequest } from 'next/server';

import { createClient } from '@/lib/supabase/server';

/**
 * Magic-link callback.
 *
 * Exchanges the one-time code for a session, then sends the admin on.
 *
 * Every failure lands on the login page with a generic message. There is no
 * branch here that reports "this code was already used" versus "this code is
 * not yours" — a sign-in endpoint that explains precisely why it refused is a
 * sign-in endpoint being used as an oracle.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get('code');

  // Same open-redirect guard as the login page: only same-site admin paths.
  const requested = searchParams.get('next') ?? '';
  const nextPath =
    requested.startsWith('/admin') && !requested.startsWith('//') ? requested : '/admin';

  if (!code) {
    return NextResponse.redirect(`${origin}/admin/login?error=1`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(`${origin}/admin/login?error=1`);
  }

  // Authenticated — but authorization is still requireAdmin()'s job on the
  // destination page. A valid Supabase session is not an admin grant.
  return NextResponse.redirect(`${origin}${nextPath}`);
}
