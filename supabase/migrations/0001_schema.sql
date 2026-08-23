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
