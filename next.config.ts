import type { NextConfig } from 'next';

/**
 * Product images live in Supabase Storage, so next/image needs that host on
 * its allowlist. The pattern is scoped to the public object path of this one
 * project rather than the whole hostname — an open image proxy is a real
 * abuse vector, not a hypothetical one.
 */
const supabaseHost = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
  : undefined;

const nextConfig: NextConfig = {
  images: {
    remotePatterns: supabaseHost
      ? [
          {
            protocol: 'https',
            hostname: supabaseHost,
            pathname: '/storage/v1/object/public/**',
          },
        ]
      : [],
    formats: ['image/avif', 'image/webp'],
  },

  /**
   * Security headers.
   *
   * No Content-Security-Policy here yet: a CSP added without checking what the
   * app actually loads either breaks the site or, worse, gets loosened to
   * 'unsafe-inline' until it stops breaking and protects nothing. It belongs
   * in its own pass once the page set is final.
   */
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
