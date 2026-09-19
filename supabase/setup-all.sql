-- =============================================================
-- SSG Products — complete database setup
-- Generated from supabase/migrations/*.sql + seed.sql
--
-- Run ONCE, top to bottom, in the Supabase SQL Editor.
-- Re-running will fail on "type already exists" — that is expected;
-- only seed.sql is safe to re-run on its own.
-- =============================================================


-- =============================================================
-- SOURCE: supabase/migrations/0001_schema.sql
-- =============================================================

-- ============================================================================
-- SSG Products — core schema
-- ----------------------------------------------------------------------------
-- Money is stored as INTEGER PAISE everywhere. Never floats: 389.00 in binary
-- floating point is not exactly 389.00, and an order ledger cannot tolerate
-- that. Rendering to "₹389" happens in the app layer, never in the database.
--
-- Discount percentage is deliberately NOT a column. It is derived from
-- (mrp - selling_price) / mrp at read time, so it can never drift out of sync
-- with the prices it claims to describe.
-- ============================================================================

create extension if not exists "pgcrypto";
create extension if not exists "citext";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type order_status as enum (
  'placed',
  'confirmed',
  'processing',
  'packed',
  'shipped',
  'out_for_delivery',
  'delivered',
  'cancelled'
);

create type payment_status as enum (
  'pending',
  'paid',
  'failed',
  'refunded'
);

create type notification_type as enum (
  'order_confirmation',
  'order_shipped',
  'order_status_updated'
);

create type notification_status as enum (
  'sent',
  'failed'
);

-- ---------------------------------------------------------------------------
-- updated_at trigger helper
-- ---------------------------------------------------------------------------

create or replace function set_updated_at()
returns trigger
language plpgsql
as $fn$
begin
  new.updated_at = now();
  return new;
end;
$fn$;

-- ---------------------------------------------------------------------------
-- admin_users — who may access /admin
-- ---------------------------------------------------------------------------
-- Mirrors auth.users. Membership in this table IS the admin grant; there is no
-- client-settable flag anywhere. Every admin check resolves through is_admin()
-- below, which runs server-side under the caller's own JWT.

create table admin_users (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  email      citext not null unique,
  role       text not null default 'admin' check (role in ('admin', 'owner')),
  created_at timestamptz not null default now()
);

create or replace function is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $fn$
  select exists (
    select 1 from admin_users where user_id = auth.uid()
  );
$fn$;

-- ---------------------------------------------------------------------------
-- categories
-- ---------------------------------------------------------------------------

create table categories (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text not null unique,
  description text,
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint categories_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);

create trigger categories_updated_at
  before update on categories
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- products
-- ---------------------------------------------------------------------------
-- ingredients/benefits are text[] rather than prose so the UI can render them
-- as real lists without parsing. Fields the owner has not supplied yet
-- (specifications, seo_*) are nullable and stay null — they are not invented.

create table products (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null,
  slug               text not null unique,
  category_id        uuid references categories (id) on delete set null,
  short_description  text,
  description        text,
  ingredients        text[] not null default '{}',
  benefits           text[] not null default '{}',
  usage_instructions text,
  specifications     jsonb not null default '{}'::jsonb,
  seo_title          text,
  seo_description    text,
  is_active          boolean not null default false,
  is_featured        boolean not null default false,
  sort_order         integer not null default 0,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  constraint products_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  -- Slugs that would collide with real routes are rejected in the database,
  -- not only in a form validator that a direct API call could bypass.
  constraint products_slug_reserved check (
    slug not in ('admin', 'cart', 'checkout', 'products', 'track-order',
                 'contact', 'about', 'api', 'order', 'auth', 'privacy',
                 'terms', 'shipping', 'returns')
  )
);

create index products_active_idx   on products (is_active) where is_active;
create index products_category_idx on products (category_id);

create trigger products_updated_at
  before update on products
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- product_variants
-- ---------------------------------------------------------------------------
-- stock IS NULL means "not tracked" — the owner has not supplied stock counts,
-- and inventing a number would be worse than admitting we do not have one.
-- A tracked variant (stock >= 0) blocks purchase at 0. An untracked variant is
-- governed by is_active alone, which the admin toggles by hand.

create table product_variants (
  id                  uuid primary key default gen_random_uuid(),
  product_id          uuid not null references products (id) on delete cascade,
  variant_name        text not null,
  quantity_value      numeric(10, 2),
  quantity_unit       text,
  mrp_paise           integer not null,
  selling_price_paise integer not null,
  sku                 text unique,
  stock               integer,
  is_active           boolean not null default true,
  sort_order          integer not null default 0,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint variants_mrp_positive       check (mrp_paise > 0),
  constraint variants_selling_positive   check (selling_price_paise > 0),
  -- A selling price above MRP would render a negative discount. Rejecting it
  -- here means no admin typo can ever produce "-12% OFF" on the storefront.
  constraint variants_selling_lte_mrp    check (selling_price_paise <= mrp_paise),
  constraint variants_stock_non_negative check (stock is null or stock >= 0)
);

create index variants_product_idx on product_variants (product_id, sort_order);

create trigger product_variants_updated_at
  before update on product_variants
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- product_images
-- ---------------------------------------------------------------------------

create table product_images (
  id           uuid primary key default gen_random_uuid(),
  product_id   uuid not null references products (id) on delete cascade,
  storage_path text not null,
  alt_text     text,
  sort_order   integer not null default 0,
  is_primary   boolean not null default false,
  width        integer,
  height       integer,
  created_at   timestamptz not null default now()
);

create index product_images_product_idx on product_images (product_id, sort_order);

-- At most one primary image per product, enforced by the database rather than
-- by application code that has to remember to clear the previous one.
create unique index product_images_one_primary
  on product_images (product_id)
  where is_primary;

-- ---------------------------------------------------------------------------
-- customers
-- ---------------------------------------------------------------------------

create table customers (
  id         uuid primary key default gen_random_uuid(),
  email      citext not null unique,
  name       text not null,
  phone      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger customers_updated_at
  before update on customers
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- order number generation — SSG-YYYYMMDD-NNNN
-- ---------------------------------------------------------------------------
-- A per-day counter with an atomic upsert. Two orders placed in the same
-- millisecond get different numbers because the increment happens inside the
-- row lock, not in application code that reads then writes.

create table order_number_counters (
  day     date primary key,
  counter integer not null default 0
);

create or replace function next_order_number()
returns text
language plpgsql
security definer
set search_path = public
as $fn$
declare
  today date := (now() at time zone 'Asia/Kolkata')::date;
  n     integer;
begin
  insert into order_number_counters (day, counter)
  values (today, 1)
  on conflict (day) do update
    set counter = order_number_counters.counter + 1
  returning counter into n;

  return 'SSG-' || to_char(today, 'YYYYMMDD') || '-' || lpad(n::text, 4, '0');
end;
$fn$;

-- ---------------------------------------------------------------------------
-- orders
-- ---------------------------------------------------------------------------

create table orders (
  id                uuid primary key default gen_random_uuid(),
  order_number      text not null unique default next_order_number(),
  customer_id       uuid not null references customers (id) on delete restrict,
  subtotal_paise    integer not null,
  discount_paise    integer not null default 0,
  shipping_paise    integer not null default 0,
  total_paise       integer not null,
  status            order_status not null default 'placed',
  payment_status    payment_status not null default 'pending',
  payment_provider  text,
  payment_reference text,
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint orders_totals_non_negative check (
    subtotal_paise >= 0 and discount_paise >= 0
    and shipping_paise >= 0 and total_paise >= 0
  )
);

create index orders_status_idx   on orders (status);
create index orders_created_idx  on orders (created_at desc);
create index orders_customer_idx on orders (customer_id);

create trigger orders_updated_at
  before update on orders
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- order_items — historical price snapshot
-- ---------------------------------------------------------------------------
-- Every price-bearing field is duplicated here at write time. When the admin
-- later changes Hair Oil 200ml from ₹389 to ₹449, this row still reads 38900,
-- because nothing ever joins back to product_variants to re-read a price.
-- The product/variant FKs are ON DELETE SET NULL and exist only for reporting.

create table order_items (
  id                           uuid primary key default gen_random_uuid(),
  order_id                     uuid not null references orders (id) on delete cascade,
  product_id                   uuid references products (id) on delete set null,
  variant_id                   uuid references product_variants (id) on delete set null,
  product_name_snapshot        text not null,
  variant_name_snapshot        text not null,
  sku_snapshot                 text,
  mrp_paise_snapshot           integer not null,
  selling_price_paise_snapshot integer not null,
  quantity                     integer not null,
  subtotal_paise               integer not null,

  constraint order_items_quantity_positive check (quantity > 0 and quantity <= 99)
);

create index order_items_order_idx on order_items (order_id);

-- ---------------------------------------------------------------------------
-- shipping_addresses
-- ---------------------------------------------------------------------------

create table shipping_addresses (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null unique references orders (id) on delete cascade,
  name        text not null,
  phone       text not null,
  address     text not null,
  city        text not null,
  state       text not null,
  postal_code text not null,
  country     text not null default 'India'
);

-- ---------------------------------------------------------------------------
-- shipments
-- ---------------------------------------------------------------------------

create table shipments (
  id           uuid primary key default gen_random_uuid(),
  order_id     uuid not null unique references orders (id) on delete cascade,
  courier_name text not null,
  tracking_id  text not null,
  tracking_url text,
  shipped_at   timestamptz not null default now(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create trigger shipments_updated_at
  before update on shipments
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- notification_logs
-- ---------------------------------------------------------------------------
-- The partial unique index is the duplicate-email guard. A second successful
-- send of the same type for the same order cannot be recorded, and the send
-- path claims the row before it calls the provider — so it cannot run twice.
-- Failed attempts are outside the index, so retries stay possible.

create table notification_logs (
  id                  uuid primary key default gen_random_uuid(),
  order_id            uuid not null references orders (id) on delete cascade,
  notification_type   notification_type not null,
  recipient           citext not null,
  status              notification_status not null,
  provider_message_id text,
  error_message       text,
  sent_at             timestamptz,
  created_at          timestamptz not null default now()
);

create unique index notification_logs_one_success
  on notification_logs (order_id, notification_type)
  where status = 'sent';

create index notification_logs_order_idx on notification_logs (order_id);

-- ---------------------------------------------------------------------------
-- admin_audit_logs
-- ---------------------------------------------------------------------------

create table admin_audit_logs (
  id            uuid primary key default gen_random_uuid(),
  admin_user_id uuid references auth.users (id) on delete set null,
  admin_email   citext,
  action        text not null,
  entity_type   text not null,
  entity_id     text,
  metadata      jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);

create index admin_audit_logs_created_idx on admin_audit_logs (created_at desc);
create index admin_audit_logs_entity_idx  on admin_audit_logs (entity_type, entity_id);

-- ---------------------------------------------------------------------------
-- store_settings — single row, owner-editable store configuration
-- ---------------------------------------------------------------------------
-- Values the owner has not supplied (tax, shipping) stay null so the app can
-- render "not configured" rather than a fabricated default such as 18% GST.

create table store_settings (
  id                            boolean primary key default true,
  store_name                    text not null default 'SSG Products',
  logo_path                     text,
  whatsapp                      text,
  instagram_url                 text,
  email                         text,
  address                       text,
  shipping_flat_paise           integer,
  free_shipping_threshold_paise integer,
  tax_config                    jsonb not null default '{}'::jsonb,
  updated_at                    timestamptz not null default now(),

  constraint store_settings_singleton check (id)
);

create trigger store_settings_updated_at
  before update on store_settings
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Bundles — architecture only (brief §53)
-- ---------------------------------------------------------------------------
-- The Hair Oil + Shikakai combo exists as a concept in the reference material,
-- but no combo pricing was supplied, so no bundle rows are seeded. The tables
-- exist so that adding one later is data entry, not a migration.

create table product_bundles (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  slug                text not null unique,
  description         text,
  mrp_paise           integer not null,
  selling_price_paise integer not null,
  is_active           boolean not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint bundles_selling_lte_mrp check (selling_price_paise <= mrp_paise)
);

create table bundle_items (
  id         uuid primary key default gen_random_uuid(),
  bundle_id  uuid not null references product_bundles (id) on delete cascade,
  variant_id uuid not null references product_variants (id) on delete restrict,
  quantity   integer not null default 1 check (quantity > 0),

  unique (bundle_id, variant_id)
);

create trigger product_bundles_updated_at
  before update on product_bundles
  for each row execute function set_updated_at();


-- =============================================================
-- SOURCE: supabase/migrations/0002_rls.sql
-- =============================================================

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


-- =============================================================
-- SOURCE: supabase/migrations/0003_storage.sql
-- =============================================================

-- ============================================================================
-- SSG Products — Storage
-- ----------------------------------------------------------------------------
-- One public bucket for product photography. Public READ is correct: these are
-- catalogue images meant to be served to anonymous shoppers and cached by the
-- CDN. Public WRITE is not — uploads are restricted to admins.
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'product-images',
  'product-images',
  true,
  10485760, -- 10 MB; product photography above this should be compressed first
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif']
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Brand assets (logo, OG images). Separate bucket so that a bulk purge of
-- product photography can never take the logo with it.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'brand-assets',
  'brand-assets',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/svg+xml']
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- Policies
-- ---------------------------------------------------------------------------
-- allowed_mime_types on the bucket is the real defence against someone
-- uploading an .html file to a public bucket and getting stored XSS on the
-- storage origin. These policies control who, the bucket config controls what.

create policy "product images are publicly readable"
  on storage.objects for select to anon, authenticated
  using (bucket_id = 'product-images');

create policy "brand assets are publicly readable"
  on storage.objects for select to anon, authenticated
  using (bucket_id = 'brand-assets');

create policy "admins upload product images"
  on storage.objects for insert to authenticated
  with check (bucket_id in ('product-images', 'brand-assets') and is_admin());

create policy "admins update product images"
  on storage.objects for update to authenticated
  using (bucket_id in ('product-images', 'brand-assets') and is_admin())
  with check (bucket_id in ('product-images', 'brand-assets') and is_admin());

create policy "admins delete product images"
  on storage.objects for delete to authenticated
  using (bucket_id in ('product-images', 'brand-assets') and is_admin());


-- =============================================================
-- SOURCE: supabase/migrations/0004_create_order.sql
-- =============================================================

-- ============================================================================
-- create_order — the transactional order write path
-- ----------------------------------------------------------------------------
-- Why this lives in the database rather than in application code:
--
-- Creating an order touches five tables (customers, orders, order_items,
-- shipping_addresses, product_variants). Done as five PostgREST calls, a
-- failure on the fourth leaves an order with no address and stock already
-- decremented. There is no way to roll that back from the client. Here it is
-- one statement: it either all happens or none of it does.
--
-- It also closes a time-of-check/time-of-use gap. Application code that prices
-- a cart, then writes an order, leaves a window in which stock can be sold
-- twice. This function re-reads prices and locks the variant rows with
-- FOR UPDATE, so two simultaneous orders for the last unit are serialised and
-- the second one fails honestly.
--
-- Prices are read here, from the variant rows, and never taken from the
-- caller. The payload carries variant ids and quantities only.
-- ============================================================================

create or replace function create_order(
  p_customer jsonb,   -- { name, email, phone }
  p_shipping jsonb,   -- { address, city, state, postal_code, country }
  p_items    jsonb,   -- [ { variant_id, quantity }, ... ]
  p_notes    text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_customer_id uuid;
  v_order_id    uuid;
  v_order_number text;
  v_item        jsonb;
  v_variant_id  uuid;
  v_qty         integer;
  v_variant     record;
  v_subtotal    integer := 0;
  v_discount    integer := 0;
  v_shipping    integer := 0;
  v_flat        integer;
  v_threshold   integer;
  v_line_total  integer;
begin
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'EMPTY_CART' using errcode = 'P0001';
  end if;

  if jsonb_array_length(p_items) > 50 then
    raise exception 'TOO_MANY_ITEMS' using errcode = 'P0001';
  end if;

  -- -------------------------------------------------------------------------
  -- Customer: upsert on email.
  -- -------------------------------------------------------------------------
  -- A repeat customer reuses their row so their order history stays together.
  -- Name and phone are refreshed from the latest checkout, since that is the
  -- information the courier will actually use for this delivery.

  insert into customers (email, name, phone)
  values (
    lower(trim(p_customer ->> 'email')),
    trim(p_customer ->> 'name'),
    nullif(trim(coalesce(p_customer ->> 'phone', '')), '')
  )
  on conflict (email) do update
    set name  = excluded.name,
        phone = coalesce(excluded.phone, customers.phone)
  returning id into v_customer_id;

  -- -------------------------------------------------------------------------
  -- Order shell. Totals are patched in once the items are priced.
  -- -------------------------------------------------------------------------

  insert into orders (customer_id, subtotal_paise, total_paise, notes)
  values (v_customer_id, 0, 0, nullif(trim(coalesce(p_notes, '')), ''))
  returning id, order_number into v_order_id, v_order_number;

  -- -------------------------------------------------------------------------
  -- Items: lock, verify, price, snapshot, decrement.
  -- -------------------------------------------------------------------------

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_variant_id := (v_item ->> 'variant_id')::uuid;
    v_qty        := (v_item ->> 'quantity')::integer;

    if v_qty is null or v_qty < 1 or v_qty > 99 then
      raise exception 'INVALID_QUANTITY' using errcode = 'P0001';
    end if;

    -- FOR UPDATE on the variant row is what serialises concurrent checkouts.
    -- The join to products is intentionally not locked; we only read its flags.
    select pv.id, pv.variant_name, pv.mrp_paise, pv.selling_price_paise,
           pv.sku, pv.stock, pv.is_active, pv.product_id,
           p.name as product_name, p.is_active as product_active
      into v_variant
      from product_variants pv
      join products p on p.id = pv.product_id
     where pv.id = v_variant_id
     for update of pv;

    if not found then
      raise exception 'VARIANT_NOT_FOUND:%', v_variant_id using errcode = 'P0001';
    end if;

    if not v_variant.is_active or not v_variant.product_active then
      raise exception 'VARIANT_UNAVAILABLE:%', v_variant.product_name || ' (' || v_variant.variant_name || ')'
        using errcode = 'P0001';
    end if;

    -- stock IS NULL means untracked; there is nothing to check or decrement.
    if v_variant.stock is not null then
      if v_variant.stock < v_qty then
        raise exception 'INSUFFICIENT_STOCK:%', v_variant.product_name || ' (' || v_variant.variant_name || ')'
          using errcode = 'P0001';
      end if;

      update product_variants
         set stock = stock - v_qty
       where id = v_variant_id;
    end if;

    v_line_total := v_variant.selling_price_paise * v_qty;
    v_subtotal   := v_subtotal + v_line_total;
    v_discount   := v_discount + (v_variant.mrp_paise - v_variant.selling_price_paise) * v_qty;

    -- The snapshot. Nothing downstream ever joins back to product_variants to
    -- recover a price, which is what makes a later price change harmless.
    insert into order_items (
      order_id, product_id, variant_id,
      product_name_snapshot, variant_name_snapshot, sku_snapshot,
      mrp_paise_snapshot, selling_price_paise_snapshot,
      quantity, subtotal_paise
    )
    values (
      v_order_id, v_variant.product_id, v_variant_id,
      v_variant.product_name, v_variant.variant_name, v_variant.sku,
      v_variant.mrp_paise, v_variant.selling_price_paise,
      v_qty, v_line_total
    );
  end loop;

  -- -------------------------------------------------------------------------
  -- Shipping, from store settings. Unconfigured means zero, never a guess.
  -- -------------------------------------------------------------------------

  select shipping_flat_paise, free_shipping_threshold_paise
    into v_flat, v_threshold
    from store_settings where id = true;

  if v_flat is not null then
    if v_threshold is not null and v_subtotal >= v_threshold then
      v_shipping := 0;
    else
      v_shipping := v_flat;
    end if;
  end if;

  update orders
     set subtotal_paise = v_subtotal,
         discount_paise = v_discount,
         shipping_paise = v_shipping,
         total_paise    = v_subtotal + v_shipping
   where id = v_order_id;

  -- -------------------------------------------------------------------------
  -- Shipping address
  -- -------------------------------------------------------------------------

  insert into shipping_addresses (
    order_id, name, phone, address, city, state, postal_code, country
  )
  values (
    v_order_id,
    trim(p_customer ->> 'name'),
    trim(coalesce(p_customer ->> 'phone', '')),
    trim(p_shipping ->> 'address'),
    trim(p_shipping ->> 'city'),
    trim(p_shipping ->> 'state'),
    trim(p_shipping ->> 'postal_code'),
    coalesce(nullif(trim(coalesce(p_shipping ->> 'country', '')), ''), 'India')
  );

  return jsonb_build_object(
    'order_id',       v_order_id,
    'order_number',   v_order_number,
    'subtotal_paise', v_subtotal,
    'discount_paise', v_discount,
    'shipping_paise', v_shipping,
    'total_paise',    v_subtotal + v_shipping
  );
end;
$fn$;

-- Server-side only. The storefront reaches this through a Server Action using
-- the secret key, never directly from the browser.
revoke execute on function create_order(jsonb, jsonb, jsonb, text) from anon, authenticated;


-- =============================================================
-- SOURCE: supabase/migrations/0005_customer_accounts.sql
-- =============================================================

-- ============================================================================
-- SSG Products — customer accounts
-- ----------------------------------------------------------------------------
-- Adds customer-facing authentication on top of the existing schema, without
-- touching admin_users or any admin authorization path. The distinction is
-- deliberate and load-bearing:
--
--   admin_users   membership IS the admin grant (see 0001, 0002)
--   profiles      exists for every signed-up customer; grants nothing extra
--
-- A customer signing up gets a profiles row via trigger. That row confers no
-- special access — RLS below only ever lets a customer see rows that are
-- their own. There is no path from "has a profiles row" to "is an admin".
--
-- Orders remain identity-optional. `customers` (0001) stays the record used
-- for guest checkout and is written by create_order() regardless of whether
-- the buyer is signed in. `orders.auth_user_id` is an ADDITIONAL, nullable
-- link used only when the buyer was authenticated at checkout. Guest orders
-- keep auth_user_id null and are entirely unaffected.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- profiles — one row per customer auth account
-- ---------------------------------------------------------------------------

create table profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  full_name  text,
  phone      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_updated_at
  before update on profiles
  for each row execute function set_updated_at();

alter table profiles enable row level security;

-- A customer may read and edit only their own profile. There is no policy
-- granting broader access; admins manage customers through auth, not through
-- this table, and nothing here needs an admin override.
create policy profiles_self_select on profiles
  for select to authenticated
  using (id = auth.uid());

create policy profiles_self_update on profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create policy profiles_self_insert on profiles
  for insert to authenticated
  with check (id = auth.uid());

-- ---------------------------------------------------------------------------
-- Auto-create a profile on signup, and link prior guest orders
-- ---------------------------------------------------------------------------
-- Runs for every new auth.users row, admin or customer. A profile carries no
-- privilege, so an admin account picking one up is harmless. Reading
-- full_name/phone from signup metadata means the signup form can populate
-- them without a second round trip.
--
-- It also implements "create an account to track your orders more easily"
-- (brief §51): any past guest order placed under this exact email is backfilled
-- with auth_user_id = the new account, so it appears immediately under My
-- Orders. This is safe specifically because the match is against new.email —
-- the address Supabase itself just verified control of via signup/confirmation
-- — never a value a client asked to claim. It cannot be used to attach
-- someone else's order to your account by typing their email into a form.

create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  insert into profiles (id, full_name, phone)
  values (
    new.id,
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), ''),
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'phone', '')), '')
  )
  on conflict (id) do nothing;

  update orders
     set auth_user_id = new.id
   where auth_user_id is null
     and customer_id in (
       select id from customers where email = new.email
     );

  return new;
end;
$fn$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ---------------------------------------------------------------------------
-- customer_addresses — saved shipping addresses
-- ---------------------------------------------------------------------------

create table customer_addresses (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references profiles (id) on delete cascade,
  label       text,
  name        text not null,
  phone       text not null,
  address     text not null,
  apartment   text,
  city        text not null,
  state       text not null,
  postal_code text not null,
  country     text not null default 'India',
  is_default  boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index customer_addresses_profile_idx on customer_addresses (profile_id);

-- At most one default address per customer, enforced by the database rather
-- than application code that has to remember to clear the previous one —
-- the same pattern already used for product_images.is_primary.
create unique index customer_addresses_one_default
  on customer_addresses (profile_id)
  where is_default;

create trigger customer_addresses_updated_at
  before update on customer_addresses
  for each row execute function set_updated_at();

alter table customer_addresses enable row level security;

-- profiles.id IS the auth uid, so profile_id = auth.uid() is the ownership
-- check directly — no join required.
create policy customer_addresses_owner_all on customer_addresses
  for all to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

-- ---------------------------------------------------------------------------
-- orders.auth_user_id — links an order to a signed-in customer
-- ---------------------------------------------------------------------------
-- Nullable and ON DELETE SET NULL: a deleted auth user does not take their
-- order history down with them, and a guest order simply never sets this.

alter table orders
  add column auth_user_id uuid references auth.users (id) on delete set null;

create index orders_auth_user_idx on orders (auth_user_id) where auth_user_id is not null;

-- ---------------------------------------------------------------------------
-- Customer read access to their own order data
-- ---------------------------------------------------------------------------
-- These are ADDITIONAL policies alongside the existing admin `for all`
-- policies from 0002 — Postgres OR's same-command policies together, so
-- admin access is unchanged and customers gain only their own rows, and only
-- for SELECT. A customer can read their order but not alter its status,
-- price, or contents.

create policy orders_owner_select on orders
  for select to authenticated
  using (auth_user_id = auth.uid());

create policy order_items_owner_select on order_items
  for select to authenticated
  using (
    exists (
      select 1 from orders o
      where o.id = order_items.order_id and o.auth_user_id = auth.uid()
    )
  );

create policy shipping_addresses_owner_select on shipping_addresses
  for select to authenticated
  using (
    exists (
      select 1 from orders o
      where o.id = shipping_addresses.order_id and o.auth_user_id = auth.uid()
    )
  );

create policy shipments_owner_select on shipments
  for select to authenticated
  using (
    exists (
      select 1 from orders o
      where o.id = shipments.order_id and o.auth_user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- create_order — extended with an optional authenticated-buyer link
-- ---------------------------------------------------------------------------
-- Adds p_auth_user_id as a new named parameter with a default of null, so the
-- existing call in checkout-actions.ts (which does not pass it) keeps working
-- unchanged — guest checkout is untouched. The checkout action is updated
-- separately to resolve the current session SERVER-SIDE and pass it here; the
-- id is never taken from client input, so nothing in the browser can claim
-- someone else's account for an order.

-- CREATE OR REPLACE cannot be used to add this parameter: Postgres identifies
-- a function by its parameter LIST, so a different signature creates a
-- second overload rather than replacing the original — the old 4-argument
-- version from 0004 would remain in the database, unreachable but stale
-- dead code. Dropping it explicitly first keeps exactly one create_order.
drop function if exists create_order(jsonb, jsonb, jsonb, text);

create or replace function create_order(
  p_customer     jsonb,
  p_shipping     jsonb,
  p_items        jsonb,
  p_notes        text default null,
  p_auth_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_customer_id uuid;
  v_order_id    uuid;
  v_order_number text;
  v_item        jsonb;
  v_variant_id  uuid;
  v_qty         integer;
  v_variant     record;
  v_subtotal    integer := 0;
  v_discount    integer := 0;
  v_shipping    integer := 0;
  v_flat        integer;
  v_threshold   integer;
  v_line_total  integer;
begin
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'EMPTY_CART' using errcode = 'P0001';
  end if;

  if jsonb_array_length(p_items) > 50 then
    raise exception 'TOO_MANY_ITEMS' using errcode = 'P0001';
  end if;

  insert into customers (email, name, phone)
  values (
    lower(trim(p_customer ->> 'email')),
    trim(p_customer ->> 'name'),
    nullif(trim(coalesce(p_customer ->> 'phone', '')), '')
  )
  on conflict (email) do update
    set name  = excluded.name,
        phone = coalesce(excluded.phone, customers.phone)
  returning id into v_customer_id;

  insert into orders (customer_id, subtotal_paise, total_paise, notes, auth_user_id)
  values (v_customer_id, 0, 0, nullif(trim(coalesce(p_notes, '')), ''), p_auth_user_id)
  returning id, order_number into v_order_id, v_order_number;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_variant_id := (v_item ->> 'variant_id')::uuid;
    v_qty        := (v_item ->> 'quantity')::integer;

    if v_qty is null or v_qty < 1 or v_qty > 99 then
      raise exception 'INVALID_QUANTITY' using errcode = 'P0001';
    end if;

    select pv.id, pv.variant_name, pv.mrp_paise, pv.selling_price_paise,
           pv.sku, pv.stock, pv.is_active, pv.product_id,
           p.name as product_name, p.is_active as product_active
      into v_variant
      from product_variants pv
      join products p on p.id = pv.product_id
     where pv.id = v_variant_id
     for update of pv;

    if not found then
      raise exception 'VARIANT_NOT_FOUND:%', v_variant_id using errcode = 'P0001';
    end if;

    if not v_variant.is_active or not v_variant.product_active then
      raise exception 'VARIANT_UNAVAILABLE:%', v_variant.product_name || ' (' || v_variant.variant_name || ')'
        using errcode = 'P0001';
    end if;

    if v_variant.stock is not null then
      if v_variant.stock < v_qty then
        raise exception 'INSUFFICIENT_STOCK:%', v_variant.product_name || ' (' || v_variant.variant_name || ')'
          using errcode = 'P0001';
      end if;

      update product_variants
         set stock = stock - v_qty
       where id = v_variant_id;
    end if;

    v_line_total := v_variant.selling_price_paise * v_qty;
    v_subtotal   := v_subtotal + v_line_total;
    v_discount   := v_discount + (v_variant.mrp_paise - v_variant.selling_price_paise) * v_qty;

    insert into order_items (
      order_id, product_id, variant_id,
      product_name_snapshot, variant_name_snapshot, sku_snapshot,
      mrp_paise_snapshot, selling_price_paise_snapshot,
      quantity, subtotal_paise
    )
    values (
      v_order_id, v_variant.product_id, v_variant_id,
      v_variant.product_name, v_variant.variant_name, v_variant.sku,
      v_variant.mrp_paise, v_variant.selling_price_paise,
      v_qty, v_line_total
    );
  end loop;

  select shipping_flat_paise, free_shipping_threshold_paise
    into v_flat, v_threshold
    from store_settings where id = true;

  if v_flat is not null then
    if v_threshold is not null and v_subtotal >= v_threshold then
      v_shipping := 0;
    else
      v_shipping := v_flat;
    end if;
  end if;

  update orders
     set subtotal_paise = v_subtotal,
         discount_paise = v_discount,
         shipping_paise = v_shipping,
         total_paise    = v_subtotal + v_shipping
   where id = v_order_id;

  insert into shipping_addresses (
    order_id, name, phone, address, city, state, postal_code, country
  )
  values (
    v_order_id,
    trim(p_customer ->> 'name'),
    trim(coalesce(p_customer ->> 'phone', '')),
    trim(p_shipping ->> 'address'),
    trim(p_shipping ->> 'city'),
    trim(p_shipping ->> 'state'),
    trim(p_shipping ->> 'postal_code'),
    coalesce(nullif(trim(coalesce(p_shipping ->> 'country', '')), ''), 'India')
  );

  return jsonb_build_object(
    'order_id',       v_order_id,
    'order_number',   v_order_number,
    'subtotal_paise', v_subtotal,
    'discount_paise', v_discount,
    'shipping_paise', v_shipping,
    'total_paise',    v_subtotal + v_shipping
  );
end;
$fn$;

revoke execute on function create_order(jsonb, jsonb, jsonb, text, uuid) from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Reserved slugs — extended for the new customer-facing routes
-- ---------------------------------------------------------------------------
-- These routes did not exist when 0001 was written. A product created at
-- /signup or /account today would shadow a real page; extending the
-- constraint closes that the same way the original list did.

alter table products drop constraint products_slug_reserved;

alter table products add constraint products_slug_reserved check (
  slug not in (
    'admin', 'cart', 'checkout', 'products', 'track-order',
    'contact', 'about', 'api', 'order', 'auth', 'privacy',
    'terms', 'shipping', 'returns', 'signin', 'signup',
    'forgot-password', 'reset-password', 'account', 'faq'
  )
);


-- =============================================================
-- SOURCE: supabase/migrations/0006_razorpay.sql
-- =============================================================

-- ============================================================================
-- SSG Products — Razorpay payment fields
-- ----------------------------------------------------------------------------
-- Adds the one column create_order was missing to record a payment gateway
-- order id, and extends create_order itself so it can be called with real
-- payment status once a payment has been verified.
--
-- The architecture this supports (see src/server/actions/checkout-actions.ts
-- and src/lib/payments/razorpay.ts):
--
--   1. Cart is priced server-side (unchanged, pre-existing).
--   2. A Razorpay order is created for that exact server-computed total.
--   3. The customer pays in the Razorpay Checkout widget.
--   4. The signature Razorpay returns is verified server-side.
--   5. ONLY on a verified signature does this database ever hear about the
--      order — create_order is called with payment_status='paid' already
--      set, in the same transaction that writes everything else.
--
-- This means an abandoned or failed Razorpay checkout never creates an SSG
-- order at all: no unpaid clutter, no stock touched, nothing to reconcile.
-- Guest checkout with payments unconfigured is completely unaffected — every
-- new parameter below defaults to exactly what the old 5-arg call already
-- produced.
-- ============================================================================

alter table orders add column razorpay_order_id text;

-- Different call sites need to find an order by whichever Razorpay id they
-- have on hand — the checkout flow has the razorpay order id before it has a
-- payment id, the webhook usually has both.
create index orders_razorpay_order_idx on orders (razorpay_order_id) where razorpay_order_id is not null;

-- See the note in 0005_customer_accounts.sql: CREATE OR REPLACE cannot change
-- a function's parameter list, it creates a second overload and leaves the
-- old one stranded. Drop the 5-arg version from 0005 explicitly first.
drop function if exists create_order(jsonb, jsonb, jsonb, text, uuid);

create or replace function create_order(
  p_customer          jsonb,
  p_shipping          jsonb,
  p_items             jsonb,
  p_notes             text default null,
  p_auth_user_id      uuid default null,
  p_payment_status    payment_status default 'pending',
  p_payment_provider  text default null,
  p_payment_reference text default null,
  p_razorpay_order_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_customer_id uuid;
  v_order_id    uuid;
  v_order_number text;
  v_item        jsonb;
  v_variant_id  uuid;
  v_qty         integer;
  v_variant     record;
  v_subtotal    integer := 0;
  v_discount    integer := 0;
  v_shipping    integer := 0;
  v_flat        integer;
  v_threshold   integer;
  v_line_total  integer;
begin
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'EMPTY_CART' using errcode = 'P0001';
  end if;

  if jsonb_array_length(p_items) > 50 then
    raise exception 'TOO_MANY_ITEMS' using errcode = 'P0001';
  end if;

  insert into customers (email, name, phone)
  values (
    lower(trim(p_customer ->> 'email')),
    trim(p_customer ->> 'name'),
    nullif(trim(coalesce(p_customer ->> 'phone', '')), '')
  )
  on conflict (email) do update
    set name  = excluded.name,
        phone = coalesce(excluded.phone, customers.phone)
  returning id into v_customer_id;

  insert into orders (
    customer_id, subtotal_paise, total_paise, notes, auth_user_id,
    payment_status, payment_provider, payment_reference, razorpay_order_id
  )
  values (
    v_customer_id, 0, 0, nullif(trim(coalesce(p_notes, '')), ''), p_auth_user_id,
    p_payment_status, p_payment_provider, p_payment_reference, p_razorpay_order_id
  )
  returning id, order_number into v_order_id, v_order_number;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_variant_id := (v_item ->> 'variant_id')::uuid;
    v_qty        := (v_item ->> 'quantity')::integer;

    if v_qty is null or v_qty < 1 or v_qty > 99 then
      raise exception 'INVALID_QUANTITY' using errcode = 'P0001';
    end if;

    select pv.id, pv.variant_name, pv.mrp_paise, pv.selling_price_paise,
           pv.sku, pv.stock, pv.is_active, pv.product_id,
           p.name as product_name, p.is_active as product_active
      into v_variant
      from product_variants pv
      join products p on p.id = pv.product_id
     where pv.id = v_variant_id
     for update of pv;

    if not found then
      raise exception 'VARIANT_NOT_FOUND:%', v_variant_id using errcode = 'P0001';
    end if;

    if not v_variant.is_active or not v_variant.product_active then
      raise exception 'VARIANT_UNAVAILABLE:%', v_variant.product_name || ' (' || v_variant.variant_name || ')'
        using errcode = 'P0001';
    end if;

    if v_variant.stock is not null then
      if v_variant.stock < v_qty then
        raise exception 'INSUFFICIENT_STOCK:%', v_variant.product_name || ' (' || v_variant.variant_name || ')'
          using errcode = 'P0001';
      end if;

      update product_variants
         set stock = stock - v_qty
       where id = v_variant_id;
    end if;

    v_line_total := v_variant.selling_price_paise * v_qty;
    v_subtotal   := v_subtotal + v_line_total;
    v_discount   := v_discount + (v_variant.mrp_paise - v_variant.selling_price_paise) * v_qty;

    insert into order_items (
      order_id, product_id, variant_id,
      product_name_snapshot, variant_name_snapshot, sku_snapshot,
      mrp_paise_snapshot, selling_price_paise_snapshot,
      quantity, subtotal_paise
    )
    values (
      v_order_id, v_variant.product_id, v_variant_id,
      v_variant.product_name, v_variant.variant_name, v_variant.sku,
      v_variant.mrp_paise, v_variant.selling_price_paise,
      v_qty, v_line_total
    );
  end loop;

  select shipping_flat_paise, free_shipping_threshold_paise
    into v_flat, v_threshold
    from store_settings where id = true;

  if v_flat is not null then
    if v_threshold is not null and v_subtotal >= v_threshold then
      v_shipping := 0;
    else
      v_shipping := v_flat;
    end if;
  end if;

  update orders
     set subtotal_paise = v_subtotal,
         discount_paise = v_discount,
         shipping_paise = v_shipping,
         total_paise    = v_subtotal + v_shipping
   where id = v_order_id;

  insert into shipping_addresses (
    order_id, name, phone, address, city, state, postal_code, country
  )
  values (
    v_order_id,
    trim(p_customer ->> 'name'),
    trim(coalesce(p_customer ->> 'phone', '')),
    trim(p_shipping ->> 'address'),
    trim(p_shipping ->> 'city'),
    trim(p_shipping ->> 'state'),
    trim(p_shipping ->> 'postal_code'),
    coalesce(nullif(trim(coalesce(p_shipping ->> 'country', '')), ''), 'India')
  );

  return jsonb_build_object(
    'order_id',       v_order_id,
    'order_number',   v_order_number,
    'subtotal_paise', v_subtotal,
    'discount_paise', v_discount,
    'shipping_paise', v_shipping,
    'total_paise',    v_subtotal + v_shipping
  );
end;
$fn$;

-- NOTE: `revoke ... from anon, authenticated` (what 0004 and 0005 both wrote
-- here) is a no-op against a PUBLIC grant — see 0007_fix_function_grants.sql
-- for the full explanation. Revoking from PUBLIC directly and re-granting to
-- service_role only is what actually restricts this to server-only callers.
revoke execute on function create_order(
  jsonb, jsonb, jsonb, text, uuid, payment_status, text, text, text
) from public;
grant execute on function create_order(
  jsonb, jsonb, jsonb, text, uuid, payment_status, text, text, text
) to service_role;


-- =============================================================
-- SOURCE: supabase/migrations/0007_fix_function_grants.sql
-- =============================================================

-- ============================================================================
-- Fix: create_order and next_order_number were reachable by anon
-- ----------------------------------------------------------------------------
-- Both were meant to be server-only, callable only through the service-role
-- client (see 0004_create_order.sql: "Server-side only. The storefront
-- reaches this through a Server Action using the secret key, never directly
-- from the browser.").
--
-- That intent did not actually take effect. Postgres grants EXECUTE to PUBLIC
-- automatically when a function is created, and `REVOKE ... FROM anon,
-- authenticated` does not remove a privilege a role holds via PUBLIC — PUBLIC
-- is a pseudo-grantee, not a role anon/authenticated are members of, so
-- revoking from the named roles left the PUBLIC grant untouched.
--
-- Supabase's own security advisor caught this: anon could call
-- /rest/v1/rpc/create_order directly. create_order re-reads every price
-- itself, so this was not a price-tampering hole, but it did mean the checkout
-- Server Action's own validation and rate limiting could be skipped entirely
-- by hitting PostgREST directly, and next_order_number could be called to
-- churn through order numbers for no reason.
--
-- The fix: revoke from PUBLIC (which removes it for every role, including
-- service_role), then grant back explicitly to service_role only.
--
-- lookup_order and is_admin are unaffected — both are intentionally
-- public-callable and already have direct grants; leaving them via PUBLIC
-- changes nothing about who can call them.
--
-- create_order's signature below is the 9-parameter version introduced by
-- 0006_razorpay.sql, not the original 4-parameter one from 0004 — by the
-- time this migration runs (after 0005 and 0006 have already dropped and
-- recreated the function twice), the 4-parameter overload no longer exists.
-- Applying these migrations in order against a fresh database, rather than
-- the incremental order they were originally written and applied in, is what
-- surfaces this — worth remembering for any future from-scratch replay.
-- ============================================================================

revoke execute on function create_order(
  jsonb, jsonb, jsonb, text, uuid, payment_status, text, text, text
) from public;
grant  execute on function create_order(
  jsonb, jsonb, jsonb, text, uuid, payment_status, text, text, text
) to service_role;

revoke execute on function next_order_number() from public;
grant  execute on function next_order_number() to service_role;


-- =============================================================
-- SOURCE: supabase/migrations/0008_fix_default_privilege_grants.sql
-- =============================================================

-- ============================================================================
-- Fix: default privileges grant EXECUTE directly to anon/authenticated
-- ----------------------------------------------------------------------------
-- 0007 revoked EXECUTE from PUBLIC and re-granted to service_role only,
-- believing that closed the hole. It did not, and the reason is worth
-- recording precisely because it will bite again on every future function
-- unless it is understood:
--
--   select pg_get_userbyid(defaclrole), defaclacl
--   from pg_default_acl where defaclnamespace = 'public'::regnamespace;
--
-- returns, among others:
--   postgres=X/postgres, anon=X/postgres, authenticated=X/postgres, ...
--
-- This project has an ALTER DEFAULT PRIVILEGES rule (set up by Supabase's own
-- project bootstrapping, not by anything in this repo) that grants EXECUTE
-- directly to anon and authenticated on every NEW function created by the
-- postgres/supabase_admin role in the public schema. That grant is recorded
-- against the role by name, not against PUBLIC — so "revoke ... from public"
-- does nothing to it, and every create_order revision since 0005 has been
-- silently exposed to anon again the moment it was (re)created, regardless of
-- the revoke statement written in the same migration.
--
-- The practical rule going forward: any server-only SECURITY DEFINER function
-- must explicitly revoke from anon AND authenticated by name (not only from
-- PUBLIC) in the same migration that creates or replaces it.
--
-- handle_new_user() is included here too — it is a trigger function invoked
-- by Postgres itself on auth.users insert, never called directly by a client,
-- so it needs no role able to execute it via RPC at all.
-- ============================================================================

revoke execute on function create_order(
  jsonb, jsonb, jsonb, text, uuid, payment_status, text, text, text
) from anon, authenticated;

revoke execute on function next_order_number() from anon, authenticated;

-- handle_new_user needs both revokes: it still carried a plain PUBLIC grant
-- (the ordinary CREATE FUNCTION default, same class of bug as 0007) on top of
-- the default-privilege direct grant to anon/authenticated. Revoking only one
-- of the two left it reachable via the other — confirmed live with
-- has_function_privilege() before writing this. It is invoked solely by the
-- trigger on auth.users insert, so it correctly ends up executable by no
-- client role at all, not even service_role.
revoke execute on function handle_new_user() from public, anon, authenticated, service_role;


-- =============================================================
-- SOURCE: supabase/migrations/0009_cancel_order.sql
-- =============================================================

-- ============================================================================
-- cancel_order — the transactional order-cancellation path
-- ----------------------------------------------------------------------------
-- Cancelling touches two things that must move together: the order's status
-- and the stock create_order previously decremented. Done as separate calls
-- from application code (read order_items, then N update statements, then
-- update the order), a failure partway through leaves stock restored for some
-- items but not others, with no way to tell from the order row alone that it
-- happened. One function, one transaction: it either all happens or none of
-- it does — the same reasoning as create_order itself.
--
-- Idempotent: cancelling an already-cancelled order is a no-op, not a second
-- restock. Untracked variants (stock is null) are left untracked, matching
-- how create_order treats them going the other direction.
--
-- Deliberately NOT handled here: refunding a paid order. This function only
-- ever touches `orders.status` and `product_variants.stock`. Admin UI is
-- responsible for telling the owner to refund a paid order manually in the
-- Razorpay dashboard — automating that is a real feature this schema does not
-- yet support and should not quietly half-implement.
-- ============================================================================

create or replace function cancel_order(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_status       order_status;
  v_order_number text;
  v_item         record;
begin
  select status, order_number into v_status, v_order_number
    from orders
   where id = p_order_id
     for update;

  if not found then
    raise exception 'ORDER_NOT_FOUND' using errcode = 'P0001';
  end if;

  if v_status = 'cancelled' then
    return jsonb_build_object(
      'order_id', p_order_id, 'order_number', v_order_number,
      'status', 'cancelled', 'already_cancelled', true
    );
  end if;

  -- A plain `stock = stock + quantity` is race-safe on its own — the UPDATE
  -- statement takes the row lock implicitly — because restocking never
  -- branches on the current value the way create_order's decrement does
  -- (which must reject when stock is insufficient). There is nothing to
  -- reject here, so no separate locking SELECT is needed.
  for v_item in
    select oi.variant_id, oi.quantity
      from order_items oi
     where oi.order_id = p_order_id and oi.variant_id is not null
  loop
    update product_variants
       set stock = stock + v_item.quantity
     where id = v_item.variant_id
       and stock is not null;
  end loop;

  update orders set status = 'cancelled' where id = p_order_id;

  return jsonb_build_object(
    'order_id', p_order_id, 'order_number', v_order_number,
    'status', 'cancelled', 'already_cancelled', false
  );
end;
$fn$;

-- Server-only, same as create_order — and the same three-way revoke, learned
-- the hard way in 0007/0008: PUBLIC and the anon/authenticated default
-- privileges are separate grants, and both must be revoked explicitly.
revoke execute on function cancel_order(uuid) from public, anon, authenticated;
grant  execute on function cancel_order(uuid) to service_role;


-- =============================================================
-- SOURCE: supabase/migrations/0010_tiered_shipping.sql
-- =============================================================

-- ============================================================================
-- Tiered shipping — Tamil Nadu vs. rest of India
-- ----------------------------------------------------------------------------
-- SSG's real policy is two rates, not one: ₹50 within Tamil Nadu, ₹100
-- everywhere else in India. The schema so far only had a single
-- `shipping_flat_paise`, which cannot express that — setting it to either
-- number would either overcharge Tamil Nadu customers or undercharge
-- everyone else.
--
-- `shipping_flat_paise` keeps its name and becomes the DEFAULT / rest-of-India
-- rate. `shipping_tamil_nadu_paise` is the override for Tamil Nadu, and is
-- nullable — a store that only ever fills in shipping_flat_paise keeps working
-- exactly as a single flat rate, with tiering only switching on once both
-- values are set.
--
-- State matching strips everything but letters and lowercases before
-- comparing, so "Tamil Nadu", "TamilNadu", "tamil  nadu" and "TN" all match —
-- the field is free text a customer typed, not a constrained dropdown.
-- ============================================================================

alter table store_settings add column shipping_tamil_nadu_paise integer;

create or replace function create_order(
  p_customer          jsonb,
  p_shipping          jsonb,
  p_items             jsonb,
  p_notes             text default null,
  p_auth_user_id      uuid default null,
  p_payment_status    payment_status default 'pending',
  p_payment_provider  text default null,
  p_payment_reference text default null,
  p_razorpay_order_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_customer_id uuid;
  v_order_id    uuid;
  v_order_number text;
  v_item        jsonb;
  v_variant_id  uuid;
  v_qty         integer;
  v_variant     record;
  v_subtotal    integer := 0;
  v_discount    integer := 0;
  v_shipping    integer := 0;
  v_flat        integer;
  v_tn_rate     integer;
  v_rate        integer;
  v_threshold   integer;
  v_line_total  integer;
begin
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'EMPTY_CART' using errcode = 'P0001';
  end if;

  if jsonb_array_length(p_items) > 50 then
    raise exception 'TOO_MANY_ITEMS' using errcode = 'P0001';
  end if;

  insert into customers (email, name, phone)
  values (
    lower(trim(p_customer ->> 'email')),
    trim(p_customer ->> 'name'),
    nullif(trim(coalesce(p_customer ->> 'phone', '')), '')
  )
  on conflict (email) do update
    set name  = excluded.name,
        phone = coalesce(excluded.phone, customers.phone)
  returning id into v_customer_id;

  insert into orders (
    customer_id, subtotal_paise, total_paise, notes, auth_user_id,
    payment_status, payment_provider, payment_reference, razorpay_order_id
  )
  values (
    v_customer_id, 0, 0, nullif(trim(coalesce(p_notes, '')), ''), p_auth_user_id,
    p_payment_status, p_payment_provider, p_payment_reference, p_razorpay_order_id
  )
  returning id, order_number into v_order_id, v_order_number;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_variant_id := (v_item ->> 'variant_id')::uuid;
    v_qty        := (v_item ->> 'quantity')::integer;

    if v_qty is null or v_qty < 1 or v_qty > 99 then
      raise exception 'INVALID_QUANTITY' using errcode = 'P0001';
    end if;

    select pv.id, pv.variant_name, pv.mrp_paise, pv.selling_price_paise,
           pv.sku, pv.stock, pv.is_active, pv.product_id,
           p.name as product_name, p.is_active as product_active
      into v_variant
      from product_variants pv
      join products p on p.id = pv.product_id
     where pv.id = v_variant_id
     for update of pv;

    if not found then
      raise exception 'VARIANT_NOT_FOUND:%', v_variant_id using errcode = 'P0001';
    end if;

    if not v_variant.is_active or not v_variant.product_active then
      raise exception 'VARIANT_UNAVAILABLE:%', v_variant.product_name || ' (' || v_variant.variant_name || ')'
        using errcode = 'P0001';
    end if;

    if v_variant.stock is not null then
      if v_variant.stock < v_qty then
        raise exception 'INSUFFICIENT_STOCK:%', v_variant.product_name || ' (' || v_variant.variant_name || ')'
          using errcode = 'P0001';
      end if;

      update product_variants
         set stock = stock - v_qty
       where id = v_variant_id;
    end if;

    v_line_total := v_variant.selling_price_paise * v_qty;
    v_subtotal   := v_subtotal + v_line_total;
    v_discount   := v_discount + (v_variant.mrp_paise - v_variant.selling_price_paise) * v_qty;

    insert into order_items (
      order_id, product_id, variant_id,
      product_name_snapshot, variant_name_snapshot, sku_snapshot,
      mrp_paise_snapshot, selling_price_paise_snapshot,
      quantity, subtotal_paise
    )
    values (
      v_order_id, v_variant.product_id, v_variant_id,
      v_variant.product_name, v_variant.variant_name, v_variant.sku,
      v_variant.mrp_paise, v_variant.selling_price_paise,
      v_qty, v_line_total
    );
  end loop;

  select shipping_flat_paise, shipping_tamil_nadu_paise, free_shipping_threshold_paise
    into v_flat, v_tn_rate, v_threshold
    from store_settings where id = true;

  if v_flat is not null then
    -- Tamil Nadu gets its own rate only when one is actually configured;
    -- otherwise everyone pays the single flat rate, unchanged from before.
    if v_tn_rate is not null
       and lower(regexp_replace(coalesce(p_shipping ->> 'state', ''), '[^a-zA-Z]', '', 'g'))
           in ('tamilnadu', 'tn')
    then
      v_rate := v_tn_rate;
    else
      v_rate := v_flat;
    end if;

    if v_threshold is not null and v_subtotal >= v_threshold then
      v_shipping := 0;
    else
      v_shipping := v_rate;
    end if;
  end if;

  update orders
     set subtotal_paise = v_subtotal,
         discount_paise = v_discount,
         shipping_paise = v_shipping,
         total_paise    = v_subtotal + v_shipping
   where id = v_order_id;

  insert into shipping_addresses (
    order_id, name, phone, address, city, state, postal_code, country
  )
  values (
    v_order_id,
    trim(p_customer ->> 'name'),
    trim(coalesce(p_customer ->> 'phone', '')),
    trim(p_shipping ->> 'address'),
    trim(p_shipping ->> 'city'),
    trim(p_shipping ->> 'state'),
    trim(p_shipping ->> 'postal_code'),
    coalesce(nullif(trim(coalesce(p_shipping ->> 'country', '')), ''), 'India')
  );

  return jsonb_build_object(
    'order_id',       v_order_id,
    'order_number',   v_order_number,
    'subtotal_paise', v_subtotal,
    'discount_paise', v_discount,
    'shipping_paise', v_shipping,
    'total_paise',    v_subtotal + v_shipping
  );
end;
$fn$;

-- CREATE OR REPLACE on the SAME parameter list preserves existing grants —
-- unlike the parameter-adding migrations (0005, 0006), this does not need a
-- drop-and-recreate, and does not reset create_order back to a public grant.
-- Confirmed this holds with has_function_privilege() after applying.


-- =============================================================
-- SOURCE: supabase/seed.sql
-- =============================================================

-- ============================================================================
-- SSG Products — seed data
-- ----------------------------------------------------------------------------
-- Contains ONLY figures and text supplied in the brief. Everything not
-- supplied is left NULL rather than guessed:
--
--   sku            NULL  — no SKU scheme was provided
--   stock          NULL  — "not tracked"; see the note in 0001_schema.sql
--   description    NULL  — no long-form copy was supplied
--   specifications {}    — no shelf life, weight, manufacturing or expiry data
--   categories     none  — brief §51: do not invent unconfirmed categories
--
-- No reviews, ratings or testimonials are seeded, and none ever should be
-- fabricated (brief §75).
--
-- Idempotent: re-running updates prices in place instead of duplicating rows.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Store settings
-- ---------------------------------------------------------------------------
-- The WhatsApp and Instagram destinations are direct, mechanical transforms of
-- the contact details given in brief §7 (+918148993990, @Ssgproducts) — not
-- invented accounts. No other social profiles are added.

-- Email and manufacturing address are transcribed from the Herbal Hair Oil
-- back label. Shipping and tax stay null — the packaging says nothing about
-- either, so the store reports them as unconfigured rather than guessing.

insert into store_settings (id, store_name, whatsapp, instagram_url, email, address)
values (
  true,
  'SSG Products',
  '+918148993990',
  'https://instagram.com/ssgproducts',
  'ssgproducts.india@gmail.com',
  'Plot No. 13/66, 4th Street, Anbu Nagar, Alwarthirunagar, Chennai - 600 087, India'
)
on conflict (id) do update
  set store_name    = excluded.store_name,
      whatsapp      = excluded.whatsapp,
      instagram_url = excluded.instagram_url,
      email         = excluded.email,
      address       = excluded.address;

-- ---------------------------------------------------------------------------
-- Product 1 — SSG Herbal Shikakai Powder
-- ---------------------------------------------------------------------------
-- Ingredients are transcribed from the official SSG ingredients artwork, which
-- lists all 17 in this order.
--
-- One deliberate difference from brief §27: the brief writes "Kaarbogar
-- arisi", the packaging artwork writes "Kaarboga arisi". The packaging is the
-- customer-facing source of truth for a product's own ingredient list, so the
-- packaging spelling is used here. If the brief spelling is the correct one,
-- change it in the admin panel — it needs no code change.
--
-- `benefits` carries only the two statements that actually appear on the
-- pouch: the "100% NATURAL" badge and the "HOMEMADE POWDER" descriptor. No
-- hair-growth, hair-fall or dandruff claim appears on this packaging, so none
-- is written here (§31, §74).

insert into products (
  name, slug, short_description, ingredients, benefits, is_active, is_featured, sort_order
)
values (
  'SSG Herbal Shikakai Powder',
  'herbal-shikakai-powder',
  '100% Natural · Homemade herbal powder blended from 17 traditional ingredients',
  array[
    'Shikakai', 'Tulasi', 'Soap nuts', 'Sembaruthi leaves, flowers',
    'Karisalankanni', 'Amla', 'Avarampoo', 'Neem leaf', 'Green gram',
    'Kaarboga arisi', 'Fenugreek', 'Vasambu', 'Rose', 'Vettiver',
    'Curry leaves', 'Lemon & Orange peel', 'Other herbs'
  ],
  array[
    '100% Natural',
    'Homemade Powder'
  ],
  true,
  true,
  1
)
on conflict (slug) do update
  set name              = excluded.name,
      short_description = excluded.short_description,
      ingredients       = excluded.ingredients,
      benefits          = excluded.benefits,
      is_active         = excluded.is_active,
      is_featured       = excluded.is_featured,
      sort_order        = excluded.sort_order;

-- Variants. Prices are in paise: ₹199 is 19900.
--   200g  MRP ₹240  ->  ₹199   (17% off, computed at read time)
--   500g  MRP ₹600  ->  ₹430   (28% off)
--   1 KG  MRP ₹950  ->  ₹754   (21% off)

with p as (select id from products where slug = 'herbal-shikakai-powder')
insert into product_variants (
  product_id, variant_name, quantity_value, quantity_unit,
  mrp_paise, selling_price_paise, sort_order
)
select p.id, v.variant_name, v.qty, v.unit, v.mrp, v.price, v.ord
from p, (values
  ('200g',  200::numeric, 'g',  24000, 19900, 1),
  ('500g',  500::numeric, 'g',  60000, 43000, 2),
  ('1 KG',    1::numeric, 'kg', 95000, 75400, 3)
) as v(variant_name, qty, unit, mrp, price, ord)
where not exists (
  select 1 from product_variants pv
  where pv.product_id = p.id and pv.variant_name = v.variant_name
);

-- Keep prices current on re-run without touching stock or SKU.
update product_variants pv
set mrp_paise = v.mrp, selling_price_paise = v.price
from products p, (values
  ('200g', 24000, 19900),
  ('500g', 60000, 43000),
  ('1 KG', 95000, 75400)
) as v(variant_name, mrp, price)
where pv.product_id = p.id
  and p.slug = 'herbal-shikakai-powder'
  and pv.variant_name = v.variant_name;

-- ---------------------------------------------------------------------------
-- Product 2 — SSG Homemade Herbal Hair Oil
-- ---------------------------------------------------------------------------
-- `benefits` is the BENEFITS block from the actual bottle label, transcribed
-- verbatim. These are stronger than the four statements brief §28 listed, but
-- they are the brand's own printed claims, so §31's instruction applies:
-- preserve the meaning of the supplied material, neither weakened nor
-- escalated. Nothing here says "guaranteed", "clinically proven", "cure" or
-- "permanent" — and nothing may be edited to.
--
-- Ingredient spellings follow the bottle, with one exception: the label reads
-- "Smalll Onion" with three Ls, which is a printing typo rather than a
-- different ingredient, so it is set as "Small Onion". Note also that SSG's
-- two products spell the same herb differently — "Karisalankanni" on the
-- Shikakai artwork, "Karisalangani" here. Each product keeps its own label's
-- spelling; see the note in the report.
--
-- `specifications` now carries shelf life and the external-use warning, both
-- printed on the label. Brief §74 listed these as "do not invent" — they are
-- no longer invented, they are transcribed.

insert into products (
  name, slug, short_description, ingredients, benefits, specifications,
  is_active, is_featured, sort_order
)
values (
  'SSG Homemade Herbal Hair Oil',
  'herbal-hair-oil',
  '100% Natural · Infused with 13+ Natural Herbs · For All Hair Types',
  array[
    'Coconut Oil', 'Amla', 'Hibiscus Leaves', 'Hibiscus Flower',
    'Karisalangani', 'Mehandi Leaves', 'Fenugreek Seeds', 'Small Onion',
    'Rose petals', 'Aloe Vera', 'Curry Leaves', 'Neem leaves', 'Vetiver',
    'Other Herbs'
  ],
  array[
    'Reduces Hair Fall',
    'Makes Hair Thick & Stronger',
    'Helpful in Premature Greying',
    'Treats Dandruff',
    'Nourishes Hair Growth & Looks Shining',
    'Restores Hair Strength'
  ],
  jsonb_build_object(
    'Shelf life', 'Best before 12 months from packaging',
    'Directions', 'External use only',
    'Herbs', 'Infused with 13+ natural herbs',
    'Suitable for', 'All hair types'
  ),
  true,
  true,
  2
)
on conflict (slug) do update
  set name              = excluded.name,
      short_description = excluded.short_description,
      ingredients       = excluded.ingredients,
      benefits          = excluded.benefits,
      specifications    = excluded.specifications,
      is_active         = excluded.is_active,
      is_featured       = excluded.is_featured,
      sort_order        = excluded.sort_order;

--   100ml  MRP ₹390  ->  ₹259   (34% off)
--   200ml  MRP ₹680  ->  ₹389   (43% off)

with p as (select id from products where slug = 'herbal-hair-oil')
insert into product_variants (
  product_id, variant_name, quantity_value, quantity_unit,
  mrp_paise, selling_price_paise, sort_order
)
select p.id, v.variant_name, v.qty, v.unit, v.mrp, v.price, v.ord
from p, (values
  ('100ml', 100::numeric, 'ml', 39000, 25900, 1),
  ('200ml', 200::numeric, 'ml', 68000, 38900, 2)
) as v(variant_name, qty, unit, mrp, price, ord)
where not exists (
  select 1 from product_variants pv
  where pv.product_id = p.id and pv.variant_name = v.variant_name
);

update product_variants pv
set mrp_paise = v.mrp, selling_price_paise = v.price
from products p, (values
  ('100ml', 39000, 25900),
  ('200ml', 68000, 38900)
) as v(variant_name, mrp, price)
where pv.product_id = p.id
  and p.slug = 'herbal-hair-oil'
  and pv.variant_name = v.variant_name;

-- ---------------------------------------------------------------------------
-- Product 3 — SSG Hibiscus Hair Oil
-- ---------------------------------------------------------------------------
-- Added to the storefront after this file was first written, and only ever
-- entered through the admin panel — this file was never updated to match,
-- so a from-scratch database built from seed.sql alone was missing this
-- product entirely until now. Transcribed here from the live database, not
-- from the packaging directly, so no ingredients/specifications are set —
-- fill those in via the admin panel from the actual label if they matter.

insert into products (
  name, slug, short_description, ingredients, benefits, specifications,
  is_active, is_featured, sort_order
)
values (
  'SSG Hibiscus Hair Oil',
  'hibiscus-hair-oil',
  'Homemade Hibiscus Hair Oil · For All Hair Types · Grow Your Hair Naturally',
  array[]::text[],
  array[]::text[],
  '{}'::jsonb,
  true,
  true,
  3
)
on conflict (slug) do update
  set name              = excluded.name,
      short_description = excluded.short_description,
      ingredients       = excluded.ingredients,
      benefits          = excluded.benefits,
      specifications    = excluded.specifications,
      is_active         = excluded.is_active,
      is_featured       = excluded.is_featured,
      sort_order        = excluded.sort_order;

--   100ml  MRP ₹390  ->  ₹239   (39% off)
--   200ml  MRP ₹680  ->  ₹379   (44% off)

with p as (select id from products where slug = 'hibiscus-hair-oil')
insert into product_variants (
  product_id, variant_name, quantity_value, quantity_unit,
  mrp_paise, selling_price_paise, sort_order
)
select p.id, v.variant_name, v.qty, v.unit, v.mrp, v.price, v.ord
from p, (values
  ('100ml', 100::numeric, 'ml', 39000, 23900, 1),
  ('200ml', 200::numeric, 'ml', 68000, 37900, 2)
) as v(variant_name, qty, unit, mrp, price, ord)
where not exists (
  select 1 from product_variants pv
  where pv.product_id = p.id and pv.variant_name = v.variant_name
);

update product_variants pv
set mrp_paise = v.mrp, selling_price_paise = v.price
from products p, (values
  ('100ml', 39000, 23900),
  ('200ml', 68000, 37900)
) as v(variant_name, mrp, price)
where pv.product_id = p.id
  and p.slug = 'hibiscus-hair-oil'
  and pv.variant_name = v.variant_name;

-- ---------------------------------------------------------------------------
-- Product 4 — SSG Herbal Baby Bath Powder
-- ---------------------------------------------------------------------------
-- Same history as Product 3 above: added through the admin panel after this
-- file was written, transcribed here from the live database.

insert into products (
  name, slug, short_description, ingredients, benefits, specifications,
  is_active, is_featured, sort_order
)
values (
  'SSG Herbal Baby Bath Powder',
  'herbal-baby-bath-powder',
  '100% Natural · Homemade Ubtan Powder with 7 Herbs · For ages 0 to 8 years',
  array[]::text[],
  array['100% Natural', 'Homemade Powder'],
  '{}'::jsonb,
  true,
  true,
  4
)
on conflict (slug) do update
  set name              = excluded.name,
      short_description = excluded.short_description,
      ingredients       = excluded.ingredients,
      benefits          = excluded.benefits,
      specifications    = excluded.specifications,
      is_active         = excluded.is_active,
      is_featured       = excluded.is_featured,
      sort_order        = excluded.sort_order;

--   250g  MRP ₹375   ->  ₹276   (26% off)
--   500g  MRP ₹750   ->  ₹479   (36% off)
--   1 KG  MRP ₹1200  ->  ₹796   (34% off)

with p as (select id from products where slug = 'herbal-baby-bath-powder')
insert into product_variants (
  product_id, variant_name, quantity_value, quantity_unit,
  mrp_paise, selling_price_paise, sort_order
)
select p.id, v.variant_name, v.qty, v.unit, v.mrp, v.price, v.ord
from p, (values
  ('250g', 250::numeric, 'g',  37500, 27600, 1),
  ('500g', 500::numeric, 'g',  75000, 47900, 2),
  ('1 KG',   1::numeric, 'kg', 120000, 79600, 3)
) as v(variant_name, qty, unit, mrp, price, ord)
where not exists (
  select 1 from product_variants pv
  where pv.product_id = p.id and pv.variant_name = v.variant_name
);

update product_variants pv
set mrp_paise = v.mrp, selling_price_paise = v.price
from products p, (values
  ('250g', 37500, 27600),
  ('500g', 75000, 47900),
  ('1 KG', 120000, 79600)
) as v(variant_name, mrp, price)
where pv.product_id = p.id
  and p.slug = 'herbal-baby-bath-powder'
  and pv.variant_name = v.variant_name;

-- ---------------------------------------------------------------------------
-- Product 5 — SSG Herbal Adult Bath Powder
-- ---------------------------------------------------------------------------
-- Same history as Products 3 and 4 above. Ingredients here ARE set — they
-- were already recorded on the live database, unlike the two products above.

insert into products (
  name, slug, short_description, ingredients, benefits, specifications,
  is_active, is_featured, sort_order
)
values (
  'SSG Herbal Adult Bath Powder',
  'herbal-adult-bath-powder',
  '100% Natural · Homemade Herbal Bath Powder',
  array[
    'Avarampoo', 'Hibiscus Leaves', 'Hibiscus Flower', 'Marikolundu',
    'Paneer Rose', 'Karisoga Arisi', 'Green Gram', 'Vetiver', 'Lemon',
    'Korakelangu', 'Vasambu', 'Poolankelangu', 'Magilambu', 'Dried Dhal',
    'Vendayam', 'Soap nuts'
  ],
  array['100% Natural', 'Homemade Powder'],
  '{}'::jsonb,
  true,
  true,
  5
)
on conflict (slug) do update
  set name              = excluded.name,
      short_description = excluded.short_description,
      ingredients       = excluded.ingredients,
      benefits          = excluded.benefits,
      specifications    = excluded.specifications,
      is_active         = excluded.is_active,
      is_featured       = excluded.is_featured,
      sort_order        = excluded.sort_order;

--   250g  MRP ₹470   ->  ₹289   (39% off)
--   500g  MRP ₹800   ->  ₹540   (33% off)
--   1 KG  MRP ₹1300  ->  ₹874   (33% off)

with p as (select id from products where slug = 'herbal-adult-bath-powder')
insert into product_variants (
  product_id, variant_name, quantity_value, quantity_unit,
  mrp_paise, selling_price_paise, sort_order
)
select p.id, v.variant_name, v.qty, v.unit, v.mrp, v.price, v.ord
from p, (values
  ('250g', 250::numeric, 'g',  47000, 28900, 1),
  ('500g', 500::numeric, 'g',  80000, 54000, 2),
  ('1 KG',   1::numeric, 'kg', 130000, 87400, 3)
) as v(variant_name, qty, unit, mrp, price, ord)
where not exists (
  select 1 from product_variants pv
  where pv.product_id = p.id and pv.variant_name = v.variant_name
);

update product_variants pv
set mrp_paise = v.mrp, selling_price_paise = v.price
from products p, (values
  ('250g', 47000, 28900),
  ('500g', 80000, 54000),
  ('1 KG', 130000, 87400)
) as v(variant_name, mrp, price)
where pv.product_id = p.id
  and p.slug = 'herbal-adult-bath-powder'
  and pv.variant_name = v.variant_name;
