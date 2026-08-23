-- ============================================================================
-- SSG Products — Row Level Security
-- ----------------------------------------------------------------------------
-- The governing rule: the anon key is a PUBLIC credential. It ships in the
-- browser bundle. Anyone can read it and call PostgREST directly with it.
-- So RLS is written as if every anon request is hostile.
--
-- Catalogue tables      -> anon may SELECT, and only active rows.
-- Customer/order tables -> anon has NO access whatsoever, not even SELECT.
-- Admin                 -> full access, gated on is_admin().
--
-- Orders are therefore never reachable by a client-side query. They are
-- created by server-side code holding the service role key, and read back
-- only through lookup_order() below, which demands proof of ownership.
-- ============================================================================

alter table admin_users           enable row level security;
alter table categories            enable row level security;
alter table products              enable row level security;
alter table product_variants      enable row level security;
alter table product_images        enable row level security;
alter table customers             enable row level security;
alter table orders                enable row level security;
alter table order_items           enable row level security;
alter table shipping_addresses    enable row level security;
alter table shipments             enable row level security;
alter table notification_logs     enable row level security;
alter table admin_audit_logs      enable row level security;
alter table store_settings        enable row level security;
alter table product_bundles       enable row level security;
alter table bundle_items          enable row level security;
alter table order_number_counters enable row level security;

-- No policy is written for order_number_counters. RLS enabled with zero
-- policies denies everything to anon and authenticated alike; the counter is
-- reached only through next_order_number(), which is security definer.

-- ---------------------------------------------------------------------------
-- admin_users
-- ---------------------------------------------------------------------------
-- An admin may read the roster (to render "who has access") but may not grant
-- admin to anyone through the API. Adding an admin is a deliberate
-- service-role operation — see scripts/create-admin.ts. This prevents a
-- compromised admin session from silently minting more admins.

create policy admin_users_select on admin_users
  for select to authenticated
  using (is_admin());

-- ---------------------------------------------------------------------------
-- Catalogue: public reads active rows, admin does everything
-- ---------------------------------------------------------------------------

create policy categories_public_select on categories
  for select to anon, authenticated
  using (is_active);

create policy categories_admin_all on categories
  for all to authenticated
  using (is_admin()) with check (is_admin());

create policy products_public_select on products
  for select to anon, authenticated
  using (is_active);

create policy products_admin_all on products
  for all to authenticated
  using (is_admin()) with check (is_admin());

-- A variant is visible only if it is active AND its parent product is active.
-- Without the parent check, unpublishing a product would still leak its
-- variants (and therefore its prices) to a direct PostgREST query.
create policy variants_public_select on product_variants
  for select to anon, authenticated
  using (
    is_active
    and exists (
      select 1 from products p
      where p.id = product_variants.product_id and p.is_active
    )
  );

create policy variants_admin_all on product_variants
  for all to authenticated
  using (is_admin()) with check (is_admin());

create policy images_public_select on product_images
  for select to anon, authenticated
  using (
    exists (
      select 1 from products p
      where p.id = product_images.product_id and p.is_active
    )
  );

create policy images_admin_all on product_images
  for all to authenticated
  using (is_admin()) with check (is_admin());

create policy bundles_public_select on product_bundles
  for select to anon, authenticated
  using (is_active);

create policy bundles_admin_all on product_bundles
  for all to authenticated
  using (is_admin()) with check (is_admin());

create policy bundle_items_public_select on bundle_items
  for select to anon, authenticated
  using (
    exists (
      select 1 from product_bundles b
      where b.id = bundle_items.bundle_id and b.is_active
    )
  );

create policy bundle_items_admin_all on bundle_items
  for all to authenticated
  using (is_admin()) with check (is_admin());

-- ---------------------------------------------------------------------------
-- store_settings — public read is intentional
-- ---------------------------------------------------------------------------
-- This table holds the storefront's WhatsApp number, Instagram handle and
-- store name, all of which are printed in the footer anyway. It holds no
-- secrets: API keys live in environment variables and never touch the DB.

create policy store_settings_public_select on store_settings
  for select to anon, authenticated
  using (true);

create policy store_settings_admin_all on store_settings
  for all to authenticated
  using (is_admin()) with check (is_admin());

-- ---------------------------------------------------------------------------
-- Customer and order data — admin only, no anon access at all
-- ---------------------------------------------------------------------------
-- Note what is absent: there is no "customers may read their own orders"
-- policy, because customers are not authenticated users. Guest checkout means
-- there is no auth.uid() to match against. Ownership is proven instead by
-- knowing both the order number and the contact on the order, which is
-- checked inside lookup_order() rather than expressed as a policy.

create policy customers_admin_all on customers
  for all to authenticated
  using (is_admin()) with check (is_admin());

create policy orders_admin_all on orders
  for all to authenticated
  using (is_admin()) with check (is_admin());

create policy order_items_admin_all on order_items
  for all to authenticated
  using (is_admin()) with check (is_admin());

create policy shipping_addresses_admin_all on shipping_addresses
  for all to authenticated
  using (is_admin()) with check (is_admin());

create policy shipments_admin_all on shipments
  for all to authenticated
  using (is_admin()) with check (is_admin());

create policy notification_logs_admin_select on notification_logs
  for select to authenticated
  using (is_admin());

-- ---------------------------------------------------------------------------
-- admin_audit_logs — append-only from the application's perspective
-- ---------------------------------------------------------------------------
-- Admins may read the log and insert into it, but there is deliberately no
-- UPDATE or DELETE policy. An audit trail an admin can edit is not an audit
-- trail. Removing entries requires the service role.

create policy audit_admin_select on admin_audit_logs
  for select to authenticated
  using (is_admin());

create policy audit_admin_insert on admin_audit_logs
  for insert to authenticated
  with check (is_admin());

-- ============================================================================
-- lookup_order — the only path from the public internet to an order
-- ============================================================================
-- Ownership test: the caller must supply the order number AND the email or
-- phone recorded on that order. Both must match the same order; knowing a
-- valid order number alone reveals nothing.
--
-- Anti-enumeration properties:
--   * A wrong contact and a non-existent order return the identical NULL.
--     The caller cannot distinguish "this order exists" from "it does not",
--     so the endpoint cannot be used to probe for valid order numbers.
--   * Comparison is case-insensitive and whitespace-trimmed so that a
--     legitimate customer typing "  Foo@Bar.com " is not rejected.
--   * The returned payload omits customer_id and every internal id. It
--     carries only what the customer already knows plus their own status.
--
-- Rate limiting sits in front of this in the application layer; see
-- src/lib/rate-limit.ts. This function is the correctness boundary, that is
-- the abuse boundary, and both are needed.

create or replace function lookup_order(
  p_order_number text,
  p_contact      text
)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $fn$
declare
  v_order   orders%rowtype;
  v_cust    customers%rowtype;
  v_contact text := lower(trim(coalesce(p_contact, '')));
  v_number  text := upper(trim(coalesce(p_order_number, '')));
  result    jsonb;
begin
  if v_contact = '' or v_number = '' then
    return null;
  end if;

  select * into v_order from orders where order_number = v_number;
  if not found then
    return null;
  end if;

  select * into v_cust from customers where id = v_order.customer_id;
  if not found then
    return null;
  end if;

  -- Ownership check. Phone comparison strips non-digits on both sides so that
  -- "+91 81489 93990" matches "8148993990" as a customer would expect.
  if lower(v_cust.email::text) <> v_contact
     and (
       v_cust.phone is null
       or regexp_replace(v_cust.phone, '\D', '', 'g') = ''
       or right(regexp_replace(v_cust.phone, '\D', '', 'g'), 10)
          <> right(regexp_replace(v_contact, '\D', '', 'g'), 10)
       or length(regexp_replace(v_contact, '\D', '', 'g')) < 10
     )
  then
    return null;
  end if;

  select jsonb_build_object(
    'order_number',   v_order.order_number,
    'status',         v_order.status,
    'payment_status', v_order.payment_status,
    'placed_at',      v_order.created_at,
    'updated_at',     v_order.updated_at,
    'customer_name',  v_cust.name,
    'subtotal_paise', v_order.subtotal_paise,
    'discount_paise', v_order.discount_paise,
    'shipping_paise', v_order.shipping_paise,
    'total_paise',    v_order.total_paise,
    'items', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'product_name',  oi.product_name_snapshot,
          'variant_name',  oi.variant_name_snapshot,
          'quantity',      oi.quantity,
          'mrp_paise',     oi.mrp_paise_snapshot,
          'price_paise',   oi.selling_price_paise_snapshot,
          'subtotal_paise', oi.subtotal_paise
        ) order by oi.product_name_snapshot
      )
      from order_items oi where oi.order_id = v_order.id
    ), '[]'::jsonb),
    'shipping_address', (
      select jsonb_build_object(
        'name', sa.name, 'address', sa.address, 'city', sa.city,
        'state', sa.state, 'postal_code', sa.postal_code, 'country', sa.country
      )
      from shipping_addresses sa where sa.order_id = v_order.id
    ),
    'shipment', (
      select jsonb_build_object(
        'courier_name', s.courier_name,
        'tracking_id',  s.tracking_id,
        'tracking_url', s.tracking_url,
        'shipped_at',   s.shipped_at
      )
      from shipments s where s.order_id = v_order.id
    )
  ) into result;

  return result;
end;
$fn$;

-- Callable by the storefront. Its own ownership check is the gate, not RLS.
grant execute on function lookup_order(text, text) to anon, authenticated;

-- is_admin() is referenced inside policies; authenticated must be able to run it.
grant execute on function is_admin() to authenticated;

-- next_order_number() is deliberately NOT granted to anon or authenticated.
-- Only the service role, used by server-side order creation, may call it.
revoke execute on function next_order_number() from anon, authenticated;
