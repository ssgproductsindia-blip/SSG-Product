import { getStoreSettings } from '@/server/catalog';

import { LogoUploader } from './logo-uploader';
import { SettingsForm } from './settings-form';

export const dynamic = 'force-dynamic';

/**
 * Store settings (brief §54): store name, logo, WhatsApp, Instagram, contact
 * email, address, and flat-rate shipping — the fields that actually drive
 * something elsewhere in the app (see the docstring in settings-actions.ts).
 *
 * No secret API keys live here or anywhere in this table — those stay in
 * environment variables, never in a database row an admin session can read
 * back out through the UI (brief §54: "Never expose secret API keys
 * unnecessarily").
 */
export default async function AdminSettingsPage() {
  const settings = await getStoreSettings();

  return (
    <div className="max-w-2xl">
      <h1 className="font-display text-2xl font-semibold text-earth-900">Settings</h1>
      <p className="mt-2 text-sm text-stone-500">
        Changes here take effect on the live site immediately — no redeploy.
      </p>

      <section aria-labelledby="logo-heading" className="mt-8 rounded-2xl border border-line bg-white p-6">
        <h2 id="logo-heading" className="font-display text-base font-semibold text-earth-900">
          Logo
        </h2>
        <p className="mt-1 text-sm text-stone-500">
          Shown in the header, footer and admin sidebar across the whole site.
        </p>
        <LogoUploader currentLogoPath={settings?.logo_path ?? null} />
      </section>

      <section aria-labelledby="details-heading" className="mt-6 rounded-2xl border border-line bg-white p-6">
        <h2 id="details-heading" className="font-display text-base font-semibold text-earth-900">
          Store details
        </h2>
        <SettingsForm
          initial={{
            storeName: settings?.store_name ?? 'SSG Products',
            whatsapp: settings?.whatsapp ?? '',
            instagramUrl: settings?.instagram_url ?? '',
            email: settings?.email ?? '',
            address: settings?.address ?? '',
            shippingFlatPaise: settings?.shipping_flat_paise ?? null,
            freeShippingThresholdPaise: settings?.free_shipping_threshold_paise ?? null,
          }}
        />
      </section>
    </div>
  );
}
