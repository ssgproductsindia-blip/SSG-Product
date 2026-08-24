import type { Metadata } from 'next';

import { getCustomer } from '@/server/customer-auth';

import { ProfileForm } from './profile-form';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'My Profile',
  robots: { index: false, follow: false },
};

export default async function ProfilePage() {
  const customer = (await getCustomer())!;

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold text-earth-900">My Profile</h1>
      <div className="mt-6">
        <ProfileForm
          fullName={customer.fullName ?? ''}
          phone={customer.phone ?? ''}
          email={customer.email}
        />
      </div>
    </div>
  );
}
