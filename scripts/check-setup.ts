/**
 * Setup verification.
 *
 *   npx tsx scripts/check-setup.ts
 *
 * Checks, in order, the things that actually break a new install: env vars,
 * reachability, whether the migrations ran, whether the seed ran with the
 * right prices, and — most importantly — whether Row Level Security is
 * genuinely refusing anonymous access to customer data.
 *
 * That last check matters more than the rest. A missing table announces
 * itself the moment you load the site. A missing RLS policy does not: the
 * store works perfectly while every customer's name, phone and address sits
 * readable by anyone holding the publishable key, which ships in the browser
 * bundle. This script tries the read that an attacker would try, and fails
 * loudly if it succeeds.
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

type Check = { label: string; ok: boolean; detail?: string; fatal?: boolean };
const results: Check[] = [];

function record(label: string, ok: boolean, detail?: string, fatal = false) {
  results.push({ label, ok, detail, fatal });
  const mark = ok ? '[32mPASS[0m' : fatal ? '[31mFAIL[0m' : '[33mWARN[0m';
  console.log(`  ${mark}  ${label}${detail ? `\n        ${detail}` : ''}`);
}

function loadEnvLocal() {
  try {
    const raw = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
    for (const line of raw.split('\n')) {
      const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
      if (!match) continue;
      const [, key, value] = match;
      if (!process.env[key]) process.env[key] = value.replace(/^["']|["']$/g, '');
    }
  } catch {
    /* fall back to the ambient environment */
  }
}

const EXPECTED = [
  { product: 'SSG Herbal Shikakai Powder', variant: '200g', mrp: 24000, price: 19900, discount: 17 },
  { product: 'SSG Herbal Shikakai Powder', variant: '500g', mrp: 60000, price: 43000, discount: 28 },
  { product: 'SSG Herbal Shikakai Powder', variant: '1 KG', mrp: 95000, price: 75400, discount: 21 },
  { product: 'SSG Homemade Herbal Hair Oil', variant: '100ml', mrp: 39000, price: 25900, discount: 34 },
  { product: 'SSG Homemade Herbal Hair Oil', variant: '200ml', mrp: 68000, price: 38900, discount: 43 },
];

async function main() {
  loadEnvLocal();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishable =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const secret = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

  console.log('\nSSG Products — setup check\n');

  console.log('Environment');
  record('NEXT_PUBLIC_SUPABASE_URL is set', Boolean(url), url ?? 'missing', true);
  record('Publishable key is set', Boolean(publishable), publishable ? undefined : 'missing — paste it into .env.local', true);
  record('Secret key is set', Boolean(secret), secret ? undefined : 'missing — paste it into .env.local', true);

  if (!url || !publishable || !secret) {
    console.log('\nStopping: fill in .env.local first (see DEPLOYMENT.md steps 3-4).\n');
    process.exit(1);
  }

  const anon = createClient(url, publishable, { auth: { persistSession: false } });
  const admin = createClient(url, secret, { auth: { persistSession: false } });

  // --- Schema -------------------------------------------------------------
  console.log('\nSchema');
  const tables = [
    'products', 'product_variants', 'product_images', 'categories',
    'customers', 'orders', 'order_items', 'shipping_addresses',
    'shipments', 'notification_logs', 'admin_audit_logs', 'store_settings',
    'admin_users', 'product_bundles', 'bundle_items',
    'profiles', 'customer_addresses',
  ];

  // NOTE: do not use `{ head: true, count: 'exact' }` here. A HEAD request
  // against a table that does not exist returns 204 with error === null, so
  // the check passes for every missing table. A plain select returns the 404
  // it should. This was a real false positive, not a hypothetical one.
  const missing: string[] = [];
  const present = new Set<string>();
  for (const table of tables) {
    const { error } = await admin.from(table).select('*').limit(1);
    if (error) missing.push(table);
    else present.add(table);
  }
  record(
    `All ${tables.length} tables exist`,
    missing.length === 0,
    missing.length ? `missing: ${missing.join(', ')} — run migrations 0001-0004` : undefined,
    true,
  );

  const { error: rpcError } = await admin.rpc('lookup_order', {
    p_order_number: 'SSG-19700101-0001',
    p_contact: 'nobody@example.com',
  });
  record(
    'lookup_order() exists',
    !rpcError,
    rpcError ? `${rpcError.message} — run migration 0002_rls.sql` : undefined,
    true,
  );

  // --- Seed ---------------------------------------------------------------
  console.log('\nSeed data');
  const { data: variants, error: seedError } = await admin
    .from('product_variants')
    .select('variant_name, mrp_paise, selling_price_paise, products(name)');

  if (seedError) {
    record('Seed data readable', false, seedError.message, true);
  } else {
    for (const expect of EXPECTED) {
      const found = (variants as unknown as Array<{
        variant_name: string;
        mrp_paise: number;
        selling_price_paise: number;
        products: { name: string } | null;
      }>).find(
        (v) => v.products?.name === expect.product && v.variant_name === expect.variant,
      );

      if (!found) {
        record(`${expect.product} — ${expect.variant}`, false, 'not found — run supabase/seed.sql', true);
        continue;
      }

      const discount = Math.round(
        ((found.mrp_paise - found.selling_price_paise) / found.mrp_paise) * 100,
      );
      const priceOk = found.mrp_paise === expect.mrp && found.selling_price_paise === expect.price;
      const discountOk = discount === expect.discount;

      record(
        `${expect.variant} — ₹${expect.price / 100} (was ₹${expect.mrp / 100}), ${expect.discount}% off`,
        priceOk && discountOk,
        priceOk && discountOk
          ? undefined
          : `got ₹${found.selling_price_paise / 100} / ₹${found.mrp_paise / 100} / ${discount}%`,
        true,
      );
    }
  }

  // --- Security -----------------------------------------------------------
  // The important part. These use the PUBLISHABLE key, exactly as a browser
  // — or anyone who opened devtools — would.
  console.log('\nRow Level Security (using the public key, as an attacker would)');

  const { data: pubProducts, error: pubProductsError } = await anon
    .from('products')
    .select('name');
  record(
    'Public CAN read active products',
    !pubProductsError && (pubProducts?.length ?? 0) > 0,
    pubProductsError?.message ?? (pubProducts?.length ? undefined : 'no products visible to anon'),
  );

  for (const table of [
    'orders', 'customers', 'shipping_addresses', 'order_items', 'shipments',
    'profiles', 'customer_addresses',
  ]) {
    // A table that does not exist also cannot be read, which would report as a
    // PASS and mean nothing. Confirm the table is really there (service role)
    // before treating an anon block as evidence that RLS is doing its job.
    if (!present.has(table)) {
      record(
        `Public CANNOT read ${table}`,
        false,
        'cannot verify — the table does not exist yet, so this proves nothing',
        true,
      );
      continue;
    }

    const { data, error } = await anon.from(table).select('*').limit(1);
    // Blocked correctly = an RLS error, or an empty result with no rows leaked.
    const blocked = Boolean(error) || (data?.length ?? 0) === 0;
    record(
      `Public CANNOT read ${table}`,
      blocked,
      blocked ? undefined : `LEAK: ${data?.length} row(s) readable with the public key`,
      true,
    );
  }

  const { error: writeError } = await anon
    .from('products')
    .insert({ name: 'rls probe', slug: `rls-probe-${Date.now()}` } as never);
  record(
    'Public CANNOT create products',
    Boolean(writeError),
    writeError ? undefined : 'LEAK: anonymous insert succeeded',
    true,
  );

  // --- Admin --------------------------------------------------------------
  console.log('\nAdmin');
  const { count: adminCount } = await admin
    .from('admin_users')
    .select('*', { head: true, count: 'exact' });
  record(
    'At least one admin user exists',
    (adminCount ?? 0) > 0,
    (adminCount ?? 0) > 0
      ? undefined
      : 'none yet — run: npx tsx scripts/create-admin.ts you@email.com',
  );

  // --- Summary ------------------------------------------------------------
  const failures = results.filter((r) => !r.ok && r.fatal);
  const warnings = results.filter((r) => !r.ok && !r.fatal);

  console.log('\n' + '-'.repeat(60));
  if (failures.length === 0) {
    console.log(`[32mAll critical checks passed.[0m ${warnings.length} warning(s).`);
    console.log('The store is ready. Run: npm run dev\n');
  } else {
    console.log(`[31m${failures.length} critical check(s) failed.[0m`);
    console.log('Fix these before taking real orders.\n');
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('\nCheck failed to run:', error instanceof Error ? error.message : error);
  process.exit(1);
});
