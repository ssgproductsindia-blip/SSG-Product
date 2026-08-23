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
