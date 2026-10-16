/** Retain the last non-direct campaign touch for lead / order attribution. */

const STORAGE_KEY = 'osw.marketingAttribution.v1';
const WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

export type PageAttribution = {
  source_url: string;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
  campaign_link_code: string | null;
  captured_at: string | null;
};

function emptyAttribution(sourceUrl: string): PageAttribution {
  return {
    source_url: sourceUrl,
    utm_source: null,
    utm_medium: null,
    utm_campaign: null,
    utm_content: null,
    utm_term: null,
    campaign_link_code: null,
    captured_at: null,
  };
}

function readStored(): PageAttribution | null {
  if (typeof window === 'undefined') return null;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || 'null') as PageAttribution | null;
    const captured = parsed?.captured_at ? new Date(parsed.captured_at).getTime() : 0;
    if (!parsed || !captured || Date.now() - captured > WINDOW_MS) {
      window.localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function capturePageAttribution(fallbackUrl = 'https://organicsoilwholesale.com/'): PageAttribution {
  const href =
    typeof window !== 'undefined' && window.location?.href
      ? window.location.href
      : fallbackUrl;
  try {
    const u = new URL(href);
    const current: PageAttribution = {
      source_url: href,
      utm_source: u.searchParams.get('utm_source'),
      utm_medium: u.searchParams.get('utm_medium'),
      utm_campaign: u.searchParams.get('utm_campaign'),
      utm_content: u.searchParams.get('utm_content'),
      utm_term: u.searchParams.get('utm_term'),
      campaign_link_code: u.searchParams.get('campaign_link_code'),
      captured_at: new Date().toISOString(),
    };
    const isCampaignTouch = Boolean(current.utm_campaign || current.campaign_link_code);
    if (isCampaignTouch && typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
      } catch {
        // Storage can be unavailable in private browsing; current-page attribution still works.
      }
      return current;
    }
    const stored = readStored();
    return stored ? { ...stored, source_url: href } : { ...current, captured_at: null };
  } catch {
    return readStored() || emptyAttribution(href);
  }
}

export function attributedPageUrl(fallbackUrl = 'https://organicsoilwholesale.com/'): string {
  const attr = capturePageAttribution(fallbackUrl);
  try {
    const url = new URL(attr.source_url || fallbackUrl);
    for (const key of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'campaign_link_code'] as const) {
      const value = attr[key];
      if (value && !url.searchParams.has(key)) url.searchParams.set(key, value);
    }
    return url.toString();
  } catch {
    return fallbackUrl;
  }
}

export function attributionToSourceData(attr: PageAttribution, extra: Record<string, unknown> = {}) {
  return {
    ...extra,
    ...(attr.utm_source ? { utm_source: attr.utm_source } : {}),
    ...(attr.utm_medium ? { utm_medium: attr.utm_medium } : {}),
    ...(attr.utm_campaign ? { utm_campaign: attr.utm_campaign } : {}),
    ...(attr.utm_content ? { utm_content: attr.utm_content } : {}),
    ...(attr.utm_term ? { utm_term: attr.utm_term } : {}),
    ...(attr.campaign_link_code ? { campaign_link_code: attr.campaign_link_code } : {}),
    ...(attr.captured_at ? { attribution_captured_at: attr.captured_at } : {}),
  };
}
