import type { Metadata } from 'next';

/**
 * Admin root.
 *
 * Intentionally has no auth guard: /admin/login lives under this path and must
 * remain reachable while signed out. The guard belongs to the (dashboard)
 * route group, which wraps everything that actually shows data.
 */
export const metadata: Metadata = {
  // Belt and braces alongside robots.ts — no admin URL should ever be indexed.
  robots: { index: false, follow: false, nocache: true },
};

export default function AdminRootLayout({ children }: { children: React.ReactNode }) {
  return children;
}
