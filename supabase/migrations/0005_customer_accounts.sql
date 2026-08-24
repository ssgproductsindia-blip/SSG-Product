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
