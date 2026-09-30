BEGIN;

-- Entrants can receive reminders without an sp_customers record. Persist their
-- provider suppression directly so later native schedules are canceled too.
CREATE OR REPLACE FUNCTION public.record_giveaway_email_delivery()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s text;
BEGIN
  s:=CASE WHEN NEW.event_type IN ('delivered','opened','clicked') THEN 'delivered'
    WHEN NEW.event_type='sent' THEN 'sent'
    WHEN NEW.event_type IN ('failed','bounced','complained','suppressed') THEN 'failed' END;
  IF s IS NOT NULL THEN
    UPDATE public.giveaway_reminder_jobs SET status=s,provider_status=NEW.event_type,updated_at=now()
      WHERE provider_id=NEW.resend_email_id AND status<>'canceled'
        AND (status<>'delivered' OR s='failed');
  END IF;
  IF NEW.event_type IN ('bounced','complained','suppressed') THEN
    INSERT INTO public.message_suppressions(channel,destination,reason)
      SELECT DISTINCT 'email',j.destination,'Resend '||NEW.event_type||': giveaway delivery event'
      FROM public.giveaway_reminder_jobs j JOIN public.giveaway_reminders r ON r.id=j.reminder_id
      WHERE j.provider_id=NEW.resend_email_id AND r.channel='email'
      ON CONFLICT(channel,destination) DO NOTHING;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.record_giveaway_email_delivery() FROM PUBLIC,anon,authenticated;

-- Preserve already-observed provider failures. A generic failure can represent
-- an account/service problem and must not suppress an otherwise valid contact.
INSERT INTO public.message_suppressions(channel,destination,reason)
  SELECT DISTINCT ON(j.destination) 'email',j.destination,
    'Resend '||j.provider_status||': existing giveaway delivery event'
  FROM public.giveaway_reminder_jobs j JOIN public.giveaway_reminders r ON r.id=j.reminder_id
  WHERE r.channel='email' AND j.provider_status IN ('bounced','complained','suppressed')
  ORDER BY j.destination,j.updated_at DESC
  ON CONFLICT(channel,destination) DO NOTHING;

COMMIT;
