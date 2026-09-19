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
