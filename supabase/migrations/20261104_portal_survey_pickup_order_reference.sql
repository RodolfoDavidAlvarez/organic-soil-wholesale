-- Pickup IDs and sales-order IDs belong to different tables. Preserve legacy
-- sales-order references and store new pickup references separately.
alter table public.portal_survey_letter_outbox
  add column if not exists source_pickup_order_id integer
  references public.sp_pickup_orders(id) on delete set null;
