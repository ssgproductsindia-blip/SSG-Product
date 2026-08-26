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
