import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { supabase } from '../db/supabase.js';

const router = Router();

function cookieValue(header: string | undefined, key: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const [name, ...value] = part.trim().split('=');
    if (name === key) return decodeURIComponent(value.join('='));
  }
  return null;
}

router.get('/:code', async (req, res) => {
  const code = String(req.params.code || '').trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{2,79}$/.test(code)) return res.status(404).send('Tracked link not found.');

  const { data: link, error } = await supabase
    .from('marketing_campaign_links')
    .select('id,campaign_id,item_id,code,destination_url,utm_source,utm_medium,utm_campaign,utm_content,utm_term,is_active')
    .eq('code', code)
    .eq('is_active', true)
    .maybeSingle();

  if (error) {
    console.error('[campaign redirect] link lookup failed', error);
    return res.status(503).send('Tracked link is temporarily unavailable.');
  }
  if (!link) return res.status(404).send('Tracked link not found.');

  let destination: URL;
  try {
    destination = new URL(link.destination_url);
    if (!['http:', 'https:'].includes(destination.protocol)) throw new Error('unsupported protocol');
  } catch {
    return res.status(500).send('Tracked link destination is invalid.');
  }

  const params = {
    utm_source: link.utm_source,
    utm_medium: link.utm_medium,
    utm_campaign: link.utm_campaign,
    utm_content: link.utm_content,
    utm_term: link.utm_term,
    campaign_link_code: link.code,
  };
  for (const [key, value] of Object.entries(params)) {
    if (value && !destination.searchParams.has(key)) destination.searchParams.set(key, value);
  }

  const sessionId = cookieValue(req.headers.cookie, 'osw_campaign_session') || randomUUID();
  if (!cookieValue(req.headers.cookie, 'osw_campaign_session')) {
    res.cookie('osw_campaign_session', sessionId, {
      httpOnly: false,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });
  }
  res.setHeader('Cache-Control', 'no-store');

  const { error: insertError } = await supabase.from('marketing_touchpoints').insert({
    campaign_id: link.campaign_id,
    item_id: link.item_id,
    link_id: link.id,
    event_type: 'click',
    provider: 'osw_short_link',
    provider_event_id: randomUUID(),
    source: link.utm_source || 'website',
    medium: link.utm_medium || 'campaign',
    content: link.utm_content,
    anonymous_session_id: sessionId,
    occurred_at: new Date().toISOString(),
    metadata: { code: link.code, placement: 'tracked_link' },
  });
  if (insertError) console.error('[campaign redirect] click insert failed', insertError);

  return res.redirect(302, destination.toString());
});

export default router;
