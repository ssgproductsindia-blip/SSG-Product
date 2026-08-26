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
