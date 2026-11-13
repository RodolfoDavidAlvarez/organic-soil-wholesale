-- Paid website checkout writes public.orders. SSW World and the mobile sales
-- app read sp_orders. This migration adds the sync log and the unique partial
-- indexes that make the copy idempotent.
-- Applied live on 2026-11-12 to Supabase project govktyrtmwzbzqkmzmrf
-- (version 20261112235722, sync_website_orders_to_sp_orders).
-- Functions and the orders trigger:
-- 20261112235801_sync_website_orders_to_sp_orders_functions.sql.

-- Durable, idempotent copy of paid website public.orders into the SSW World
-- sales-app tables (sp_orders, sp_order_items, sp_order_payments).
-- Does not create commissions. A trigger failure must never block checkout.

CREATE TABLE IF NOT EXISTS public.osw_web_order_sync_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  website_order_id integer,
  sp_order_id integer,
  event text NOT NULL,
  message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.osw_web_order_sync_log IS
  'Outcomes from sync_osw_web_order_to_sp: synced, skipped, or error. Website checkout must not fail if a row cannot be written.';

ALTER TABLE public.osw_web_order_sync_log ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX IF NOT EXISTS sp_orders_stripe_payment_intent_id_uidx
  ON public.sp_orders (stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS sp_orders_osw_web_internal_label_uidx
  ON public.sp_orders (internal_label)
  WHERE internal_label LIKE 'OSW web #%';
