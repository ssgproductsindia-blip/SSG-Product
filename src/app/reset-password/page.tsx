import type { Metadata } from 'next';
import Link from 'next/link';

import { AuthShell } from '@/components/auth/auth-shell';
import { getCustomer } from '@/server/customer-auth';

import { ResetPasswordForm } from './reset-password-form';

export const metadata: Metadata = {
  title: 'Set a new password',
  robots: { index: false, follow: false },
};

/**
 * Reaching this page requires an active session established by the recovery
 * link via /auth/callback. Without one, there is nothing valid to reset —
 * shown here rather than rendering a form that would only fail on submit.
 */
export default async function ResetPasswordPage() {
  const customer = await getCustomer();

  if (!customer) {
    return (
      <AuthShell title="Reset link expired">
        <div className="rounded-2xl border border-line bg-surface p-8 text-center">
          <p className="text-sm leading-relaxed text-ink-muted">
            Your password reset link may have expired or already been used.
          </p>
          <Link
            href="/forgot-password"
            className="mt-4 inline-block text-sm font-medium text-green-800 hover:underline"
          >
            Request a new link
          </Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Set a new password">
      <ResetPasswordForm />
    </AuthShell>
  );
}
