BEGIN;

CREATE TABLE IF NOT EXISTS public.giveaway_reminder_campaigns (
  campaign_key text PRIMARY KEY,
  state text NOT NULL DEFAULT 'held' CHECK (state IN ('held','active','paused','canceled','complete')),
  expires_at timestamptz NOT NULL,
  approval jsonb,
  sms_permission_evidence text,
  sms_sender_ready boolean NOT NULL DEFAULT false,
  worker_token uuid,
  worker_lease_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.giveaway_reminders (
  id text PRIMARY KEY,
  campaign_key text NOT NULL REFERENCES public.giveaway_reminder_campaigns,
  channel text NOT NULL CHECK (channel IN ('email','sms')),
  audience text NOT NULL CHECK (audience IN ('entrants','invitation')),
  content_key text NOT NULL,
  scheduled_at timestamptz,
  enabled boolean NOT NULL DEFAULT true,
  enroll_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.giveaway_reminder_team (
  campaign_key text NOT NULL REFERENCES public.giveaway_reminder_campaigns,
  email text NOT NULL,
  name text NOT NULL,
  phone text,
  active boolean NOT NULL DEFAULT true,
  PRIMARY KEY (campaign_key,email)
);
CREATE TABLE IF NOT EXISTS public.message_suppressions (
  channel text NOT NULL CHECK (channel IN ('email','sms')),
  destination text NOT NULL,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (channel,destination)
);
CREATE TABLE IF NOT EXISTS public.giveaway_reminder_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reminder_id text NOT NULL REFERENCES public.giveaway_reminders,
  destination text NOT NULL,
  recipient_name text,
  is_team boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'held' CHECK (status IN
    ('held','ready','processing','scheduled','sent','delivered','canceled','suppressed','failed','unknown','expired')),
  cancel_requested boolean NOT NULL DEFAULT false,
  provider_id text,
  provider_status text,
  provider_send_at timestamptz,
  attempts integer NOT NULL DEFAULT 0,
  claimed_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (reminder_id,destination)
);
CREATE INDEX IF NOT EXISTS giveaway_reminder_jobs_pending ON public.giveaway_reminder_jobs(status,updated_at);
CREATE INDEX IF NOT EXISTS giveaway_reminder_jobs_provider ON public.giveaway_reminder_jobs(provider_id) WHERE provider_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS sp_customers_reminder_email ON public.sp_customers(lower(btrim(email)));
CREATE INDEX IF NOT EXISTS sp_giveaway_reminder_email ON public.sp_giveaway_entries(campaign_key,lower(btrim(email))) WHERE NOT is_preview;
CREATE TABLE IF NOT EXISTS public.giveaway_reminder_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  summary jsonb NOT NULL DEFAULT '{}'
);

-- Private operational tables; no browser access. Only server credentials may use them.
ALTER TABLE public.giveaway_reminder_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.giveaway_reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.giveaway_reminder_team ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_suppressions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.giveaway_reminder_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.giveaway_reminder_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.giveaway_reminder_campaigns, public.giveaway_reminders,
  public.giveaway_reminder_team, public.message_suppressions,
  public.giveaway_reminder_jobs, public.giveaway_reminder_runs FROM anon, authenticated;
GRANT ALL ON public.giveaway_reminder_campaigns, public.giveaway_reminders,
  public.giveaway_reminder_team, public.message_suppressions,
  public.giveaway_reminder_jobs, public.giveaway_reminder_runs TO service_role;

CREATE OR REPLACE FUNCTION public.giveaway_normalize_phone(value text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN length(d)=10 THEN '+1'||d WHEN length(d)=11 AND left(d,1)='1' THEN '+'||d END
  FROM (SELECT regexp_replace(coalesce(value,''),'[^0-9]','','g') d) p
$$;

CREATE OR REPLACE FUNCTION public.giveaway_email_suppressed(address text)
RETURNS boolean LANGUAGE sql STABLE SET search_path=public AS $$
  SELECT EXISTS (SELECT 1 FROM public.message_suppressions
    WHERE channel='email' AND destination=lower(btrim(address)))
  OR EXISTS (SELECT 1 FROM public.sp_customers WHERE lower(btrim(email))=lower(btrim(address)) AND (
    newsletter_subscribed=false OR newsletter_unsubscribed_at IS NOT NULL OR
    coalesce(newsletter_verification_status,'') ~* 'bounced|complained|suppressed|failed' OR
    source='deleted_by_super_admin'))
$$;

CREATE OR REPLACE FUNCTION public.giveaway_eligible_recipients(key text)
RETURNS TABLE(channel text,destination text,recipient_name text,is_team boolean,audience text)
LANGUAGE sql STABLE SET search_path=public AS $$
  WITH entrants AS (
    SELECT DISTINCT ON (lower(btrim(email))) lower(btrim(email)) email,full_name,phone
    FROM public.sp_giveaway_entries
    WHERE campaign_key=key AND NOT is_preview AND email_consent AND rules_consent
    ORDER BY lower(btrim(email)),created_at,id
  ), members AS (
    SELECT email,full_name,phone,false is_team FROM entrants
    UNION ALL
    SELECT lower(btrim(email)),name,phone,true FROM public.giveaway_reminder_team WHERE campaign_key=key AND active
  ), emails AS (
    SELECT DISTINCT ON(email) email,full_name,is_team FROM members
    WHERE email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
      AND NOT public.giveaway_email_suppressed(email)
    ORDER BY email,is_team DESC
  ), phones AS (
    SELECT DISTINCT ON(public.giveaway_normalize_phone(phone))
      public.giveaway_normalize_phone(phone) phone,full_name,is_team
    FROM members
    WHERE public.giveaway_normalize_phone(phone) IS NOT NULL
    ORDER BY public.giveaway_normalize_phone(phone),is_team DESC
  )
  SELECT 'email',email,full_name,is_team,'entrants' FROM emails
  UNION ALL
  SELECT 'sms',p.phone,p.full_name,p.is_team,'entrants' FROM phones p
    WHERE NOT EXISTS (SELECT 1 FROM public.message_suppressions s WHERE s.channel='sms' AND s.destination=p.phone)
      AND (p.is_team OR EXISTS(SELECT 1 FROM public.giveaway_reminder_campaigns c
        WHERE c.campaign_key=key AND nullif(c.sms_permission_evidence,'') IS NOT NULL))
  UNION ALL
  SELECT DISTINCT ON(lower(btrim(c.email))) 'email',lower(btrim(c.email)),c.full_name,false,'invitation'
    FROM public.sp_customers c
    WHERE c.newsletter_subscribed=true AND c.email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
      AND NOT public.giveaway_email_suppressed(c.email)
      AND coalesce(c.newsletter_vip_tier,'') !~* 'tier 1|tier 2|💎|🏆'
      AND NOT EXISTS(SELECT 1 FROM public.sp_giveaway_entries e WHERE e.campaign_key=key
        AND NOT e.is_preview AND lower(btrim(e.email))=lower(btrim(c.email)))
      AND NOT EXISTS(SELECT 1 FROM public.giveaway_reminder_team t WHERE t.campaign_key=key
        AND t.active AND lower(btrim(t.email))=lower(btrim(c.email)))
$$;

CREATE OR REPLACE FUNCTION public.reconcile_giveaway_reminders(key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE added integer; c public.giveaway_reminder_campaigns;
BEGIN
  SELECT * INTO c FROM public.giveaway_reminder_campaigns WHERE campaign_key=key;
  IF NOT FOUND THEN RETURN jsonb_build_object('skipped','campaign_missing'); END IF;
  -- Never revive a paused/canceled campaign; cancellations still run below.
  IF c.state IN ('held','active') AND c.expires_at > now() THEN
    INSERT INTO public.giveaway_reminder_jobs(reminder_id,destination,recipient_name,is_team,status)
      SELECT r.id,e.destination,e.recipient_name,e.is_team,
        CASE WHEN c.state='active' AND c.approval IS NOT NULL AND r.scheduled_at IS NOT NULL
          AND (r.channel='email' OR c.sms_sender_ready) THEN 'ready' ELSE 'held' END
      FROM public.giveaway_reminders r CROSS JOIN public.giveaway_eligible_recipients(key) e
      WHERE r.campaign_key=key AND r.enabled AND e.channel=r.channel AND e.audience=r.audience
        AND (r.scheduled_at IS NULL OR r.scheduled_at > now())
        AND (r.enroll_until IS NULL OR r.enroll_until > now())
      ON CONFLICT(reminder_id,destination) DO NOTHING;
    GET DIAGNOSTICS added = ROW_COUNT;
  END IF;
  WITH eligible AS MATERIALIZED (SELECT * FROM public.giveaway_eligible_recipients(key))
  UPDATE public.giveaway_reminder_jobs j SET cancel_requested=true,updated_at=now(),
    status=CASE WHEN j.status IN ('held','ready') THEN 'suppressed' ELSE j.status END
    FROM public.giveaway_reminders r
    WHERE r.id=j.reminder_id AND r.campaign_key=key
      AND j.status IN ('held','ready','processing','scheduled','unknown') AND (
        c.state IN ('paused','canceled','complete') OR NOT r.enabled OR
        NOT EXISTS(SELECT 1 FROM eligible e
          WHERE e.channel=r.channel AND e.audience=r.audience AND e.destination=j.destination));
  UPDATE public.giveaway_reminder_jobs j SET status='expired',updated_at=now()
    FROM public.giveaway_reminders r WHERE r.id=j.reminder_id AND r.campaign_key=key
      AND j.status IN ('held','ready') AND (r.scheduled_at<=now() OR c.expires_at<=now());
  UPDATE public.giveaway_reminder_jobs j SET status='ready',updated_at=now()
    FROM public.giveaway_reminders r WHERE r.id=j.reminder_id AND r.campaign_key=key
      AND j.status='held' AND NOT j.cancel_requested AND c.state='active' AND c.approval IS NOT NULL
      AND r.enabled AND r.scheduled_at>now() AND c.expires_at>now()
      AND (r.channel='email' OR c.sms_sender_ready);
  RETURN jsonb_build_object('added',coalesce(added,0),'campaign_state',c.state);
END $$;

CREATE OR REPLACE FUNCTION public.giveaway_entry_queue_trigger()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF TG_OP='DELETE' THEN
    PERFORM public.reconcile_giveaway_reminders(OLD.campaign_key);
    RETURN OLD;
  END IF;
  PERFORM public.reconcile_giveaway_reminders(NEW.campaign_key);
  IF TG_OP='UPDATE' AND OLD.campaign_key<>NEW.campaign_key THEN
    PERFORM public.reconcile_giveaway_reminders(OLD.campaign_key);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS giveaway_reminder_enrollment ON public.sp_giveaway_entries;
CREATE TRIGGER giveaway_reminder_enrollment AFTER INSERT OR UPDATE OR DELETE ON public.sp_giveaway_entries
  FOR EACH ROW EXECUTE FUNCTION public.giveaway_entry_queue_trigger();

CREATE OR REPLACE FUNCTION public.suppress_giveaway_destination()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  UPDATE public.giveaway_reminder_jobs j SET cancel_requested=true,updated_at=now(),
    status=CASE WHEN j.status IN ('held','ready') THEN 'suppressed' ELSE j.status END
    FROM public.giveaway_reminders r WHERE r.id=j.reminder_id AND r.channel=NEW.channel
      AND j.destination=NEW.destination AND j.status IN ('held','ready','processing','scheduled','unknown');
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS giveaway_reminder_suppression ON public.message_suppressions;
CREATE TRIGGER giveaway_reminder_suppression AFTER INSERT OR UPDATE ON public.message_suppressions
  FOR EACH ROW EXECUTE FUNCTION public.suppress_giveaway_destination();

-- Persist an opt-out even when there has never been a newsletter customer row.
-- Create an unsubscribed marker contact so existing newsletter exporters also honor it.
CREATE OR REPLACE FUNCTION public.unsubscribe_email_address(p_email text,p_reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE address text:=lower(btrim(p_email));
BEGIN
  IF address IS NULL OR address !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' OR length(address)>254
    THEN RAISE EXCEPTION 'Invalid email address'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('unsubscribe:'||address,0));
  INSERT INTO public.message_suppressions(channel,destination,reason)
    VALUES('email',address,left(coalesce(nullif(p_reason,''),'Unsubscribed'),1000))
    ON CONFLICT(channel,destination) DO NOTHING;
  UPDATE public.sp_customers SET newsletter_subscribed=false,
    newsletter_unsubscribed_at=coalesce(newsletter_unsubscribed_at,now()),updated_at=now()
    WHERE lower(btrim(email))=address;
  IF NOT FOUND THEN
    INSERT INTO public.sp_customers(full_name,email,source,newsletter_subscribed,newsletter_unsubscribed_at)
      VALUES('Unsubscribed contact',address,'unsubscribe',false,now());
  END IF;
  RETURN jsonb_build_object('updated',true);
END $$;

REVOKE ALL ON FUNCTION public.reconcile_giveaway_reminders(text), public.unsubscribe_email_address(text,text),
  public.giveaway_eligible_recipients(text),public.giveaway_email_suppressed(text),
  public.giveaway_entry_queue_trigger(),public.suppress_giveaway_destination() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_giveaway_reminders(text),public.unsubscribe_email_address(text,text),
  public.giveaway_eligible_recipients(text),public.giveaway_email_suppressed(text) TO service_role;

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
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.record_giveaway_email_delivery() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS giveaway_reminder_email_delivery ON public.email_events;
CREATE TRIGGER giveaway_reminder_email_delivery AFTER INSERT ON public.email_events
  FOR EACH ROW EXECUTE FUNCTION public.record_giveaway_email_delivery();

COMMIT;
