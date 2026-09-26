-- ============================================================================
-- WhatsApp order-confirmation notifications
-- ----------------------------------------------------------------------------
-- WhatsApp sends reuse the existing notification_logs claim-before-send
-- mechanism (see src/lib/email/send.ts): the partial unique index on
-- (order_id, notification_type) where status = 'sent' is what guarantees one
-- successful send per order per channel. WhatsApp needs its own type so it
-- does not collide with the email row for the same order.
--
-- Must be run once on each database (Supabase SQL Editor). Until it has been,
-- the WhatsApp send reports a failure and the order itself is unaffected.
-- ============================================================================

alter type notification_type add value if not exists 'whatsapp_order_confirmation';
