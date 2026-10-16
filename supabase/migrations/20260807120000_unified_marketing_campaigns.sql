-- Unified marketing campaign foundation.
-- Additive and safe to re-run. Existing newsletter source records remain unchanged.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS marketing_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_key text NOT NULL UNIQUE,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'paused', 'completed', 'archived')),
  objective text NOT NULL DEFAULT 'lead_generation'
    CHECK (objective IN ('lead_generation', 'direct_sales', 'redemption', 'awareness')),
  primary_conversion text,
  offer_title text,
  offer_type text,
  offer_description text,
  audience text,
  owner_user_id integer,
  owner_name text,
  starts_at timestamptz,
  ends_at timestamptz,
  budget_cents bigint NOT NULL DEFAULT 0 CHECK (budget_cents >= 0),
  currency text NOT NULL DEFAULT 'USD',
  landing_url text,
  attribution_window_days integer NOT NULL DEFAULT 30
    CHECK (attribution_window_days BETWEEN 1 AND 365),
  notes text,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS marketing_campaign_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES marketing_campaigns(id) ON DELETE CASCADE,
  channel text NOT NULL,
  item_type text NOT NULL,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  provider text,
  external_id text,
  external_url text,
  newsletter_campaign_id bigint REFERENCES newsletter_campaigns(id) ON DELETE SET NULL,
  published_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE marketing_campaigns ADD COLUMN IF NOT EXISTS owner_name text;

CREATE TABLE IF NOT EXISTS marketing_campaign_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES marketing_campaigns(id) ON DELETE CASCADE,
  item_id uuid REFERENCES marketing_campaign_items(id) ON DELETE SET NULL,
  code text NOT NULL UNIQUE,
  label text NOT NULL,
  placement text,
  destination_url text NOT NULL,
  utm_source text,
  utm_medium text,
  utm_campaign text NOT NULL,
  utm_content text,
  utm_term text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS marketing_touchpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES marketing_campaigns(id) ON DELETE CASCADE,
  item_id uuid REFERENCES marketing_campaign_items(id) ON DELETE SET NULL,
  link_id uuid REFERENCES marketing_campaign_links(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  provider text,
  provider_event_id text,
  source text,
  medium text,
  content text,
  customer_id integer REFERENCES sp_customers(id) ON DELETE SET NULL,
  lead_id integer REFERENCES sp_leads(id) ON DELETE SET NULL,
  order_id integer REFERENCES sp_orders(id) ON DELETE SET NULL,
  redemption_id uuid REFERENCES sp_worm_castings_redemptions(id) ON DELETE SET NULL,
  anonymous_session_id text,
  revenue_cents bigint NOT NULL DEFAULT 0,
  is_attribution_winner boolean NOT NULL DEFAULT false,
  attribution_explanation text,
  occurred_at timestamptz NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS marketing_spend_daily (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES marketing_campaigns(id) ON DELETE CASCADE,
  item_id uuid REFERENCES marketing_campaign_items(id) ON DELETE SET NULL,
  spend_date date NOT NULL,
  channel text NOT NULL,
  provider text NOT NULL DEFAULT 'manual',
  spend_cents bigint NOT NULL DEFAULT 0 CHECK (spend_cents >= 0),
  impressions integer,
  clicks integer,
  source text NOT NULL DEFAULT 'manual',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE marketing_touchpoints
  ADD COLUMN IF NOT EXISTS attributed_touchpoint_id uuid
  REFERENCES marketing_touchpoints(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_marketing_campaigns_status
  ON marketing_campaigns (status, starts_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_marketing_items_campaign
  ON marketing_campaign_items (campaign_id, channel);
CREATE UNIQUE INDEX IF NOT EXISTS idx_marketing_items_provider_external
  ON marketing_campaign_items (provider, external_id)
  WHERE provider IS NOT NULL AND external_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_marketing_items_newsletter
  ON marketing_campaign_items (newsletter_campaign_id)
  WHERE newsletter_campaign_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_marketing_links_campaign
  ON marketing_campaign_links (campaign_id, is_active);
CREATE INDEX IF NOT EXISTS idx_marketing_touchpoints_campaign_time
  ON marketing_touchpoints (campaign_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_marketing_touchpoints_lead
  ON marketing_touchpoints (lead_id, occurred_at DESC) WHERE lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_marketing_touchpoints_order
  ON marketing_touchpoints (order_id, occurred_at DESC) WHERE order_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_marketing_touchpoints_provider_event
  ON marketing_touchpoints (provider, provider_event_id)
  WHERE provider IS NOT NULL AND provider_event_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_marketing_spend_dedupe
  ON marketing_spend_daily (
    campaign_id,
    coalesce(item_id, '00000000-0000-0000-0000-000000000000'::uuid),
    spend_date,
    provider,
    source
  );

-- The first two cross-channel campaign records.
INSERT INTO marketing_campaigns (
  campaign_key, name, status, objective, primary_conversion, offer_title,
  offer_type, offer_description, audience, owner_name, starts_at, ends_at, landing_url, notes
)
VALUES (
  'free-worm-castings-2026-08',
  'Free Worm Castings 2026-08',
  'active',
  'redemption',
  'redemption',
  'Free 9 lb bag of worm castings',
  'gift',
  'One free 9 lb bag of Mikey''s Worm Poop with registration and coupon redemption.',
  'Local gardeners and newsletter subscribers',
  'Gabriela Perez',
  '2026-07-21T00:00:00-07:00',
  '2026-08-31T23:59:59-07:00',
  'https://www.organicsoilwholesale.com/newsletter',
  'Initial cross-channel campaign. Historical source data is linked, never overwritten.'
), (
  'garden-refresh-plus',
  'Garden Refresh Plus',
  'draft',
  'direct_sales',
  'order',
  'Garden Refresh Plus',
  'bundle',
  'Draft seasonal garden refresh offer combining mulch, worm castings, and dairy compost. Final pricing and channel mix require approval.',
  'Local homeowners refreshing existing gardens',
  'Gabriela Perez',
  NULL,
  NULL,
  'https://www.organicsoilwholesale.com/',
  'Draft campaign based on the agreed offer direction. No performance is inferred before launch.'
)
ON CONFLICT (campaign_key) DO UPDATE SET
  name = EXCLUDED.name,
  objective = EXCLUDED.objective,
  primary_conversion = EXCLUDED.primary_conversion,
  offer_title = EXCLUDED.offer_title,
  offer_type = EXCLUDED.offer_type,
  offer_description = EXCLUDED.offer_description,
  audience = EXCLUDED.audience,
  owner_name = EXCLUDED.owner_name,
  landing_url = EXCLUDED.landing_url,
  updated_at = now();

-- Only NL-2026-07 has a clear historical relationship.
INSERT INTO marketing_campaign_items (
  campaign_id, channel, item_type, name, status, provider, external_id,
  newsletter_campaign_id, published_at, metadata
)
SELECT
  mc.id,
  'email',
  'email_send',
  coalesce(nc.subject, 'NL-2026-07'),
  nc.status,
  'resend',
  nc.newsletter_id,
  nc.id,
  nc.sent_at,
  jsonb_build_object(
    'newsletter_id', nc.newsletter_id,
    'historical_metrics_available', (nc.total_delivered > 0),
    'historical_metrics_warning',
      CASE WHEN nc.total_delivered > nc.total_sent AND nc.total_sent > 0
        THEN 'Delivered count exceeds sent count in the provider source.'
        ELSE NULL END
  )
FROM marketing_campaigns mc
JOIN newsletter_campaigns nc ON nc.newsletter_id = 'NL-2026-07'
WHERE mc.campaign_key = 'free-worm-castings-2026-08'
ON CONFLICT (provider, external_id) WHERE provider IS NOT NULL AND external_id IS NOT NULL
DO UPDATE SET
  campaign_id = EXCLUDED.campaign_id,
  newsletter_campaign_id = EXCLUDED.newsletter_campaign_id,
  name = EXCLUDED.name,
  status = EXCLUDED.status,
  published_at = EXCLUDED.published_at,
  metadata = EXCLUDED.metadata,
  updated_at = now();

-- Existing Instagram Reel / QR placement documented for the worm-castings offer.
INSERT INTO marketing_campaign_links (
  campaign_id, code, label, placement, destination_url,
  utm_source, utm_medium, utm_campaign, utm_content
)
SELECT
  id,
  'wormpoop-ig-reel',
  'Free worm castings Instagram Reel',
  'Instagram Reel and printed QR',
  'https://www.organicsoilwholesale.com/newsletter',
  'instagram',
  'reel',
  campaign_key,
  'free-worm-castings'
FROM marketing_campaigns
WHERE campaign_key = 'free-worm-castings-2026-08'
ON CONFLICT (code) DO UPDATE SET
  campaign_id = EXCLUDED.campaign_id,
  label = EXCLUDED.label,
  placement = EXCLUDED.placement,
  destination_url = EXCLUDED.destination_url,
  utm_source = EXCLUDED.utm_source,
  utm_medium = EXCLUDED.utm_medium,
  utm_campaign = EXCLUDED.utm_campaign,
  utm_content = EXCLUDED.utm_content,
  updated_at = now();

-- Registration, coupon delivery, and redemption source events.
INSERT INTO marketing_touchpoints (
  campaign_id, event_type, provider, provider_event_id, source, medium,
  customer_id, lead_id, redemption_id, occurred_at, metadata
)
SELECT
  mc.id,
  'registration',
  'worm_castings',
  'registration:' || r.id::text,
  CASE
    WHEN lower(coalesce(c.newsletter_notes, '')) LIKE '%instagram%' THEN 'instagram_organic'
    WHEN lower(coalesce(c.newsletter_notes, '')) LIKE '%facebook%' THEN 'facebook_organic'
    WHEN lower(coalesce(c.newsletter_notes, '')) LIKE '%qr%' THEN 'print_qr'
    WHEN lower(coalesce(c.newsletter_source, '')) LIKE '%newsletter%' THEN 'email'
    WHEN r.lead_id IS NOT NULL THEN 'website'
    ELSE 'direct'
  END,
  CASE
    WHEN lower(coalesce(c.newsletter_notes, '')) LIKE '%qr%' THEN 'qr'
    WHEN lower(coalesce(c.newsletter_notes, '')) LIKE '%instagram%' OR lower(coalesce(c.newsletter_notes, '')) LIKE '%facebook%' THEN 'organic_social'
    WHEN lower(coalesce(c.newsletter_source, '')) LIKE '%newsletter%' THEN 'email'
    ELSE 'web'
  END,
  r.customer_id::integer,
  r.lead_id::integer,
  r.id,
  r.created_at,
  jsonb_build_object('email', r.email, 'campaign_key', r.campaign_key)
FROM marketing_campaigns mc
JOIN sp_worm_castings_redemptions r ON r.campaign_key = mc.campaign_key
LEFT JOIN sp_customers c ON c.id = r.customer_id
WHERE mc.campaign_key = 'free-worm-castings-2026-08'
ON CONFLICT (provider, provider_event_id) WHERE provider IS NOT NULL AND provider_event_id IS NOT NULL
DO NOTHING;

INSERT INTO marketing_touchpoints (
  campaign_id, event_type, provider, provider_event_id, source, medium,
  customer_id, lead_id, redemption_id, occurred_at, metadata
)
SELECT
  mc.id,
  CASE WHEN r.distribution_status = 'failed' THEN 'coupon_failed' ELSE 'coupon_sent' END,
  'worm_castings',
  'coupon:' || r.id::text,
  'email',
  'email',
  r.customer_id::integer,
  r.lead_id::integer,
  r.id,
  coalesce(r.distribution_sent_at, r.updated_at, r.created_at),
  jsonb_build_object(
    'distribution_status', r.distribution_status,
    'provider_id', r.distribution_provider_id,
    'error', r.distribution_last_error
  )
FROM marketing_campaigns mc
JOIN sp_worm_castings_redemptions r ON r.campaign_key = mc.campaign_key
WHERE mc.campaign_key = 'free-worm-castings-2026-08'
  AND r.distribution_status IS NOT NULL
ON CONFLICT (provider, provider_event_id) WHERE provider IS NOT NULL AND provider_event_id IS NOT NULL
DO NOTHING;

INSERT INTO marketing_touchpoints (
  campaign_id, event_type, provider, provider_event_id, source, medium,
  customer_id, lead_id, redemption_id, occurred_at, metadata
)
SELECT
  mc.id,
  'redemption',
  'worm_castings',
  'redemption:' || r.id::text,
  'in_person',
  'coupon',
  r.customer_id::integer,
  r.lead_id::integer,
  r.id,
  r.redeemed_at,
  jsonb_build_object('location', r.redeemed_location, 'note', r.redeemed_note)
FROM marketing_campaigns mc
JOIN sp_worm_castings_redemptions r ON r.campaign_key = mc.campaign_key
WHERE mc.campaign_key = 'free-worm-castings-2026-08'
  AND r.redeemed_at IS NOT NULL
ON CONFLICT (provider, provider_event_id) WHERE provider IS NOT NULL AND provider_event_id IS NOT NULL
DO NOTHING;

-- Map leads only when the campaign key is explicit in UTM/source data or source URL.
INSERT INTO marketing_touchpoints (
  campaign_id, event_type, provider, provider_event_id, source, medium,
  lead_id, order_id, revenue_cents, occurred_at, metadata
)
SELECT
  mc.id,
  CASE WHEN l.converted_order_id IS NOT NULL THEN 'order' ELSE 'lead' END,
  'sp_leads',
  CASE WHEN l.converted_order_id IS NOT NULL THEN 'order:' || l.converted_order_id::text ELSE 'lead:' || l.id::text END,
  lower(coalesce(l.source_data->>'utm_source', l.source, 'website')),
  lower(coalesce(l.source_data->>'utm_medium', 'web')),
  l.id,
  l.converted_order_id,
  CASE WHEN l.converted_order_id IS NOT NULL
    THEN round(coalesce(o.subtotal, 0) * 100)::bigint
    ELSE 0 END,
  coalesce(o.created_at, l.created_at),
  jsonb_build_object(
    'utm_campaign', l.source_data->>'utm_campaign',
    'source_url', l.source_url,
    'attribution', 'Explicit campaign key from lead source data'
  )
FROM marketing_campaigns mc
JOIN sp_leads l ON (
  lower(coalesce(l.source_data->>'utm_campaign', '')) = lower(mc.campaign_key)
  OR lower(coalesce(l.source_data->>'campaign_key', '')) = lower(mc.campaign_key)
  OR lower(coalesce(l.source_url, '')) LIKE '%' || lower(mc.campaign_key) || '%'
)
LEFT JOIN sp_orders o ON o.id = l.converted_order_id
ON CONFLICT (provider, provider_event_id) WHERE provider IS NOT NULL AND provider_event_id IS NOT NULL
DO NOTHING;
