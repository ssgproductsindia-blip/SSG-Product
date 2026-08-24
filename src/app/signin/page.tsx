import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { AuthShell } from '@/components/auth/auth-shell';
import { getCustomer } from '@/server/customer-auth';

import { SignInForm } from './signin-form';

export const metadata: Metadata = {
  title: 'Sign in',
  robots: { index: false, follow: false },
};

export default async function SignInPage() {
  if (await getCustomer()) {
    redirect('/account');
  }

  return (
    <AuthShell title="Welcome back" subtitle="Sign in to your SSG account.">
      <SignInForm />
    </AuthShell>
  );
}
