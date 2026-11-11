-- Preserve existing access behavior for legacy lead sources while protecting
-- new sample requests/feedback. Staff APIs use postgres/service_role.
BEGIN;
ALTER TABLE public.sp_leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY legacy_leads_existing_access ON public.sp_leads
 FOR ALL TO anon, authenticated
 USING (source IS DISTINCT FROM 'osw_sample_program' AND source IS DISTINCT FROM 'osw_sample_feedback')
 WITH CHECK (source IS DISTINCT FROM 'osw_sample_program' AND source IS DISTINCT FROM 'osw_sample_feedback');
COMMIT;
