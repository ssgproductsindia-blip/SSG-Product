import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Proxy (Next.js 16's replacement for `middleware.ts`).
 *
 * Two jobs:
 *
 *   1. Refresh the Supabase session on every request. Access tokens are
 *      short-lived; without a refresh here an admin gets signed out mid-edit.
 *      The refresh must happen before the response is committed, which is why
 *      getClaims() is awaited up front rather than lazily.
 *
 *   2. Bounce signed-out visitors away from /admin.
 *
 * Point 2 is a redirect for the user's benefit, NOT the security boundary.
 * Proxy-based auth has been bypassable in the past, and this file may run at
 * the CDN edge, detached from the render. The real checks are:
 *
 *   - requireAdmin() in the admin layout, which re-verifies server-side
 *   - Row Level Security, which refuses the data even if a page renders
 *
 * A request that somehow skips this file therefore still gets nothing.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // Must be awaited before the response is returned, or a token refreshed
  // after the response is committed is lost and every request re-refreshes.
  const { data } = await supabase.auth.getClaims();

  const { pathname } = request.nextUrl;
  const isAdminRoute = pathname.startsWith('/admin');
  const isLoginRoute = pathname.startsWith('/admin/login') || pathname.startsWith('/admin/auth');

  if (isAdminRoute && !isLoginRoute && !data?.claims) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = '/admin/login';
    // Send them back where they were headed once they have signed in.
    redirectUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(redirectUrl);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Everything except static assets and image files. Running the session
     * refresh on every image request would be pure overhead.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|woff2?)$).*)',
  ],
};
