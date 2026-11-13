-- lock_down_osw_web_order_bridge
-- Bridge functions are internal: callable only by postgres/service_role, not via PostgREST RPC.
-- Trigger still fires for anon/authenticated writers (trigger functions are not EXECUTE-checked at fire time; verified).
REVOKE EXECUTE ON FUNCTION public.sync_osw_web_order_to_sp(integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_osw_web_orders_backfill() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_sync_osw_web_order() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_osw_web_order_to_sp(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.sync_osw_web_orders_backfill() TO service_role;
GRANT EXECUTE ON FUNCTION public.trg_sync_osw_web_order() TO service_role;

REVOKE ALL ON TABLE public.osw_web_order_sync_log FROM anon, authenticated;
