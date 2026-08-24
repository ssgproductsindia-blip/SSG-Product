import type { Metadata } from 'next';

import { AuthShell } from '@/components/auth/auth-shell';

import { ForgotPasswordForm } from './forgot-password-form';

export const metadata: Metadata = {
  title: 'Reset your password',
  robots: { index: false, follow: false },
};

export default function ForgotPasswordPage() {
  return (
    <AuthShell
      title="Reset your password"
      subtitle="Enter the email on your account and we'll send you a reset link."
    >
      <ForgotPasswordForm />
    </AuthShell>
  );
}
