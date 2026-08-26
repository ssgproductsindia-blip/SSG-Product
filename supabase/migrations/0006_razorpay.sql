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
