/**
 * End-to-end verification of the order path against the live database.
 *
 *   npx tsx scripts/verify-order-flow.ts
 *
 * Covers the acceptance criteria that cannot be proven by reading code:
 *
 *   1. An order is created atomically with a correctly formatted number
 *   2. Totals are computed server-side from database prices
 *   3. order_items snapshot the price at purchase time
 *   4. Changing a price afterwards does NOT rewrite the historical order
 *   5. lookup_order returns the order for the right email
 *   6. lookup_order returns the order for the right phone
 *   7. lookup_order returns NOTHING for the wrong contact
 *   8. A tampered price in the payload is ignored
 *
 * Everything it writes, it deletes. The one trace it leaves is a consumed
 * order number for today — the counter is per-day and does not roll back, so
 * if this runs on 24 Aug the first real order that day would be -0002. The
 * counter resets at midnight IST, so this costs nothing before launch.
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function loadEnvLocal() {
  try {
    const raw = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
    for (const line of raw.split('\n')) {
      const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
      if (match && !process.env[match[1]]) {
        process.env[match[1]] = match[2].replace(/^["']|["']$/g, '');
      }
    }
  } catch {
    /* ambient env */
  }
}

let failures = 0;

function check(label: string, ok: boolean, detail?: string) {
  console.log(`  ${ok ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m'}  ${label}`);
  if (detail) console.log(`        ${detail}`);
  if (!ok) failures += 1;
}

const rupees = (paise: number) => `₹${(paise / 100).toFixed(2)}`;

async function main() {
  loadEnvLocal();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const secret = (process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY)!;
  const publishable = (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)!;

  if (!url || !secret || !publishable) {
    console.error('Missing credentials in .env.local');
    process.exit(1);
  }

  const db = createClient(url, secret, { auth: { persistSession: false } });
  const anon = createClient(url, publishable, { auth: { persistSession: false } });

  const TEST_EMAIL = `verify-${Date.now()}@ssg-test.invalid`;
  const TEST_PHONE = '9000000001';

  console.log('\nSSG Products — order flow verification');
  console.log('(writes a test order, then deletes it)\n');

  // ---- Pick real variants -------------------------------------------------
  const { data: variants, error: vErr } = await db
    .from('product_variants')
    .select('id, variant_name, mrp_paise, selling_price_paise, product_id, products(name)')
    .order('selling_price_paise', { ascending: true })
    .limit(2);

  if (vErr || !variants || variants.length < 2) {
    console.error('Could not read variants:', vErr?.message);
    process.exit(1);
  }

  type V = {
    id: string;
    variant_name: string;
    mrp_paise: number;
    selling_price_paise: number;
    products: { name: string } | null;
  };
  const [v1, v2] = variants as unknown as V[];

  const QTY1 = 2;
  const QTY2 = 1;
  const expectedSubtotal = v1.selling_price_paise * QTY1 + v2.selling_price_paise * QTY2;
  const expectedDiscount =
    (v1.mrp_paise - v1.selling_price_paise) * QTY1 + (v2.mrp_paise - v2.selling_price_paise) * QTY2;

  console.log('Ordering');
  console.log(`  ${v1.products?.name} (${v1.variant_name}) x${QTY1} @ ${rupees(v1.selling_price_paise)}`);
  console.log(`  ${v2.products?.name} (${v2.variant_name}) x${QTY2} @ ${rupees(v2.selling_price_paise)}`);
  console.log(`  expected subtotal ${rupees(expectedSubtotal)}, saving ${rupees(expectedDiscount)}\n`);

  // ---- 1. Create ----------------------------------------------------------
  console.log('Order creation');

  const { data: created, error: createErr } = await db.rpc('create_order', {
    p_customer: { name: 'Verification Test', email: TEST_EMAIL, phone: TEST_PHONE },
    p_shipping: {
      address: '1 Test Street',
      city: 'Chennai',
      state: 'Tamil Nadu',
      postal_code: '600087',
      country: 'India',
    },
    // Deliberately includes a bogus price field. create_order must ignore it.
    p_items: [
      { variant_id: v1.id, quantity: QTY1, selling_price_paise: 1, mrp_paise: 1 },
      { variant_id: v2.id, quantity: QTY2, selling_price_paise: 1 },
    ],
    p_notes: 'automated verification — safe to delete',
  } as never);

  if (createErr) {
    check('create_order succeeded', false, createErr.message);
    process.exit(1);
  }

  const order = created as unknown as {
    order_id: string;
    order_number: string;
    subtotal_paise: number;
    discount_paise: number;
    shipping_paise: number;
    total_paise: number;
  };

  check('create_order succeeded', true, order.order_number);
  check(
    'Order number matches SSG-YYYYMMDD-NNNN',
    /^SSG-\d{8}-\d{4}$/.test(order.order_number),
    order.order_number,
  );
  check(
    'Subtotal computed server-side',
    order.subtotal_paise === expectedSubtotal,
    `got ${rupees(order.subtotal_paise)}, expected ${rupees(expectedSubtotal)}`,
  );
  check(
    'Discount computed server-side',
    order.discount_paise === expectedDiscount,
    `got ${rupees(order.discount_paise)}, expected ${rupees(expectedDiscount)}`,
  );
  check(
    'Client-supplied prices were IGNORED (not charged ₹0.02)',
    order.total_paise === expectedSubtotal + order.shipping_paise,
    `total ${rupees(order.total_paise)}`,
  );

  // ---- 2. Snapshots -------------------------------------------------------
  console.log('\nHistorical price snapshot');

  const { data: items } = await db
    .from('order_items')
    .select('variant_id, mrp_paise_snapshot, selling_price_paise_snapshot, quantity, subtotal_paise')
    .eq('order_id', order.order_id);

  const item1 = (items ?? []).find((i) => i.variant_id === v1.id);
  check(
    'Item snapshot stores the purchase price',
    item1?.selling_price_paise_snapshot === v1.selling_price_paise,
    `snapshot ${rupees(item1?.selling_price_paise_snapshot ?? 0)}`,
  );

  // Change the live price, then confirm the order did not move with it.
  const NEW_PRICE = v1.selling_price_paise + 5000;
  await db.from('product_variants').update({ selling_price_paise: NEW_PRICE }).eq('id', v1.id);

  const { data: afterChange } = await db
    .from('order_items')
    .select('selling_price_paise_snapshot')
    .eq('order_id', order.order_id)
    .eq('variant_id', v1.id)
    .single();

  check(
    `Price changed live to ${rupees(NEW_PRICE)} — existing order UNCHANGED`,
    afterChange?.selling_price_paise_snapshot === v1.selling_price_paise,
    `order still shows ${rupees(afterChange?.selling_price_paise_snapshot ?? 0)}`,
  );

  // Restore.
  await db
    .from('product_variants')
    .update({ selling_price_paise: v1.selling_price_paise })
    .eq('id', v1.id);

  const { data: restored } = await db
    .from('product_variants')
    .select('selling_price_paise')
    .eq('id', v1.id)
    .single();
  check(
    'Original price restored',
    restored?.selling_price_paise === v1.selling_price_paise,
    rupees(restored?.selling_price_paise ?? 0),
  );

  // ---- 3. Ownership -------------------------------------------------------
  console.log('\nOrder tracking ownership (anonymous key)');

  const { data: byEmail } = await anon.rpc('lookup_order', {
    p_order_number: order.order_number,
    p_contact: TEST_EMAIL,
  });
  check('Correct email returns the order', byEmail !== null);

  const { data: byPhone } = await anon.rpc('lookup_order', {
    p_order_number: order.order_number,
    p_contact: TEST_PHONE,
  });
  check('Correct phone returns the order', byPhone !== null);

  const { data: wrongContact } = await anon.rpc('lookup_order', {
    p_order_number: order.order_number,
    p_contact: 'attacker@example.com',
  });
  check(
    'WRONG contact returns nothing',
    wrongContact === null,
    wrongContact === null ? undefined : 'LEAK: order returned to a wrong contact',
  );

  const { data: wrongNumber } = await anon.rpc('lookup_order', {
    p_order_number: 'SSG-19700101-0001',
    p_contact: TEST_EMAIL,
  });
  check('Non-existent order returns nothing (same as wrong contact)', wrongNumber === null);

  // ---- 4. Cleanup ---------------------------------------------------------
  console.log('\nCleanup');
  await db.from('orders').delete().eq('id', order.order_id);
  await db.from('customers').delete().eq('email', TEST_EMAIL);

  const { data: goneOrder } = await db
    .from('orders')
    .select('id')
    .eq('id', order.order_id)
    .maybeSingle();
  const { data: goneItems } = await db
    .from('order_items')
    .select('id')
    .eq('order_id', order.order_id);
  const { data: goneCustomer } = await db
    .from('customers')
    .select('id')
    .eq('email', TEST_EMAIL)
    .maybeSingle();

  check('Test order removed', goneOrder === null);
  check('Order items cascaded away', (goneItems?.length ?? 0) === 0);
  check('Test customer removed', goneCustomer === null);

  console.log('\n' + '-'.repeat(60));
  if (failures === 0) {
    console.log('\x1b[32mOrder flow verified end to end.\x1b[0m Database left clean.\n');
  } else {
    console.log(`\x1b[31m${failures} check(s) failed.\x1b[0m\n`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('\nVerification crashed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
