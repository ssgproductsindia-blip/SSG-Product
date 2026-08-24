import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { AuthShell } from '@/components/auth/auth-shell';
import { getCustomer } from '@/server/customer-auth';

import { SignUpForm } from './signup-form';

export const metadata: Metadata = {
  title: 'Create your account',
  robots: { index: false, follow: false },
};

export default async function SignUpPage() {
  if (await getCustomer()) {
    redirect('/account');
  }

  return (
    <AuthShell
      title="Create your SSG account"
      subtitle="Track orders and save your details for faster checkout."
    >
      <SignUpForm />
    </AuthShell>
  );
}
