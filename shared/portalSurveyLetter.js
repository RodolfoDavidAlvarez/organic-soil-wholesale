export const PORTAL_SURVEY_LETTER_TEMPLATE = 'portal_survey_letter';
export const PORTAL_SURVEY_LETTER_SUBJECT = 'How was pickup?';
export const PORTAL_SURVEY_LETTER_SOURCE = 'pickup-plus-3';
export const DEFAULT_PORTAL_SURVEY_LETTER_SINCE = '2026-10-29T00:00:00-07:00';
export const PORTAL_SURVEY_LETTER_FROM = 'Soil Seed & Water <info@soilseedandwater.com>';
export const PORTAL_SURVEY_LETTER_REPLY_TO = 'ralvarez@soilseedandwater.com';
export const SURVEY_LETTER_WAIT_INTERVAL = '3 days';

const APP_URL = 'https://www.organicsoilwholesale.com';
const ASSET_BASE = `${APP_URL}/email-assets`;
const BLOCKED_LETTER_EMAILS = new Set(['dn@soilseedandwater.com', 'test@test.com']);

export function isSurveyLetterSendActive(value = process.env.SURVEY_LETTER_SEND_ACTIVE) {
  return String(value ?? '') === 'true';
}

export function getPortalSurveyLetterSince(value = process.env.PORTAL_SURVEY_LETTER_SINCE) {
  const raw = String(value || '').trim() || DEFAULT_PORTAL_SURVEY_LETTER_SINCE;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return new Date(DEFAULT_PORTAL_SURVEY_LETTER_SINCE);
  return date;
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function firstNameFromCustomerName(value) {
  const raw = String(value || '').replace(/\s+/g, ' ').trim();
  if (!raw) return '';
  return raw.split(' ')[0] || '';
}

export function portalSurveyLetterUrl({ firstName = '', email = '' } = {}) {
  const params = new URLSearchParams({ source: PORTAL_SURVEY_LETTER_SOURCE });
  if (String(firstName || '').trim()) params.set('first_name', String(firstName).trim());
  if (String(email || '').trim()) params.set('email', String(email).trim().toLowerCase());
  return `${APP_URL}/survey?${params.toString()}`;
}

export function portalSurveyLetterIdempotencyKey(email) {
  return `${PORTAL_SURVEY_LETTER_TEMPLATE}/${normalizeEmail(email)}`;
}

export function portalSurveyLetterUnsubscribeUrl(email) {
  return `${APP_URL}/unsubscribe?email=${encodeURIComponent(normalizeEmail(email))}`;
}

export function portalSurveyLetterComplianceHeaders(email) {
  return {
    'List-Unsubscribe': `<${portalSurveyLetterUnsubscribeUrl(email)}>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  };
}

export function skipReasonForPortalSurveyLetter(order = {}, extras = {}) {
  const email = normalizeEmail(order.customer_email || order.email);
  const now = extras.now instanceof Date ? extras.now : new Date(extras.now || Date.now());
  const since = extras.since instanceof Date ? extras.since : getPortalSurveyLetterSince(extras.since);
  const name = `${order.customer_name || order.first_name || ''} ${email}`;

  if (!email) return 'no_email';
  if (order.status && order.status !== 'picked_up') return 'not_picked_up';
  const completedAt = order.picked_up_at || order.paid_at;
  if (!completedAt) return 'not_picked_up';
  if (email.endsWith('@soilseedandwater.com')) return 'internal_ssw';
  if (BLOCKED_LETTER_EMAILS.has(email) || email.endsWith('@example.com') || email.endsWith('@test.com')) {
    return 'test_address';
  }
  if (/nowell/i.test(name) || email === 'dn@soilseedandwater.com') return 'dan_nowell';

  const waitMs = 3 * 24 * 60 * 60 * 1000;
  const pickedUpAt = new Date(completedAt);
  if (Number.isNaN(pickedUpAt.getTime())) return 'not_picked_up';
  if (pickedUpAt.getTime() > now.getTime() - waitMs) return 'too_new';
  if (pickedUpAt.getTime() < since.getTime()) return 'before_cutoff';

  const customer = extras.customer || null;
  if (customer) {
    if (customer.newsletter_unsubscribed_at) return 'unsubscribed';
    if (customer.newsletter_subscribed === false) return 'unsubscribed';
  }

  const events = extras.events || [];
  if (events.some((event) => ['bounced', 'complained', 'suppressed'].includes(event))) {
    return 'suppressed';
  }

  const outbox = extras.outbox || null;
  if (outbox?.status === 'sent' || outbox?.sent_at) return 'already_sent';
  if (outbox?.status === 'skipped') return outbox.skip_reason || 'already_skipped';

  if (extras.alreadyReceivedApology) return 'already_received_apology';
  return null;
}

export function phoenixLetterDate(now = new Date()) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Phoenix',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(now instanceof Date ? now : new Date(now));
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function buildPortalSurveyLetter({ firstName = '', email = '', now = new Date() } = {}) {
  const surveyUrl = portalSurveyLetterUrl({ firstName, email });
  const href = escapeHtml(surveyUrl);
  const unsubscribeUrl = portalSurveyLetterUnsubscribeUrl(email);
  const letterDate = phoenixLetterDate(now);
  const greetingName = String(firstName || '').trim();
  const greeting = greetingName ? `Hey ${escapeHtml(greetingName)},` : 'Hey,';

  return {
    subject: PORTAL_SURVEY_LETTER_SUBJECT,
    html: `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light"><title>How was pickup?</title></head><body style="margin:0;padding:0;background:#d6ccb4;"><div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">Quick note after pickup. Tell us how it went.</div><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#d6ccb4;"><tr><td align="center" style="padding:28px 10px;"><table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fffdf7;border:1px solid #cfc6ae;"><tr><td align="center" bgcolor="#fffdf7" style="padding:32px 40px 8px;background-color:#fffdf7;"><img src="${ASSET_BASE}/ssw-logo-letter.png" alt="Soil Seed and Water" width="248" style="display:block;width:248px;max-width:72%;height:auto;border:0;"></td></tr><tr><td align="center" bgcolor="#fffdf7" style="padding:10px 40px 18px;font-family:Georgia,'Times New Roman',serif;font-size:14px;font-style:italic;color:#5a6058;background-color:#fffdf7;">${escapeHtml(letterDate)}</td></tr><tr><td bgcolor="#fffdf7" style="padding:22px 44px 6px;font-family:Georgia,'Times New Roman',serif;color:#1c201a;font-size:17px;line-height:1.7;background-color:#fffdf7;"><p style="margin:0 0 18px;">${greeting}</p><p style="margin:0 0 18px;">Thanks for coming by. If you have a minute, tell us how pickup went. What worked, what we should fix, and whether you would come back.</p><p style="margin:0 0 22px;">After you submit, you get 30% off one item at the yard. Unique code. Show it when you come in.</p><table role="presentation" align="center" cellpadding="0" cellspacing="0" style="margin:0 auto 28px;"><tr><td align="center" bgcolor="#264027" style="background-color:#264027;"><a href="${href}" style="display:inline-block;padding:12px 28px;font-family:Georgia,'Times New Roman',serif;font-size:17px;color:#ffffff;text-decoration:none;">Tell us how we did</a></td></tr></table><p style="margin:0 0 8px;">With gratitude,</p><p style="margin:6px 0 2px;background-color:#fffdf7;"><img src="${ASSET_BASE}/rodo-signature.jpg" alt="Rodo Alvarez" width="220" style="display:block;width:220px;max-width:60%;height:auto;border:0;background-color:#fffdf7;"></p><p style="margin:4px 0 8px;">Rodo Alvarez<br>Soil Seed and Water</p><p style="margin:0 0 10px;font-size:15px;color:#5a6058;">1634 N 19th Ave, Phoenix &middot; (623) 263-3386<br>Tue through Sat, 8 to 4, closed 1 to 2<br>South entrance from Grand Avenue</p></td></tr><tr><td bgcolor="#fffdf7" style="padding:16px 44px 28px;border-top:1px solid #e4dfd2;font-family:Georgia,'Times New Roman',serif;font-size:12px;line-height:1.55;color:#7a817b;background-color:#fffdf7;">Soil Seed &amp; Water &middot; 1634 N 19th Ave, Phoenix, AZ 85009<br>You received this because you picked up an order from Organic Soil Wholesale.<br><a href="${escapeHtml(unsubscribeUrl)}" style="color:#526055;">Unsubscribe</a></td></tr></table></td></tr></table></body></html>`,
  };
}

export const PORTAL_SURVEY_LETTER_DUE_SQL = `/* portal_survey_letter:list_due */
    SELECT DISTINCT ON (lower(trim(p.customer_email)))
      p.id AS order_id,
      p.customer_email,
      p.customer_name,
      p.picked_up_at AS paid_at,
      p.payment_status
    FROM public.sp_pickup_orders p
    LEFT JOIN public.sp_customers customer
      ON lower(customer.email) = lower(trim(p.customer_email))
    LEFT JOIN public.portal_survey_letter_outbox outbox
      ON lower(outbox.email_normalized) = lower(trim(p.customer_email))
    WHERE p.status = 'picked_up'
      AND p.picked_up_at IS NOT NULL
      AND p.customer_email IS NOT NULL
      AND btrim(p.customer_email) <> ''
      AND p.picked_up_at <= now() - interval '3 days'
      AND p.picked_up_at >= $1::timestamptz
      AND lower(trim(p.customer_email)) NOT LIKE '%@soilseedandwater.com'
      AND lower(trim(p.customer_email)) NOT IN ('test@test.com', 'test@example.com')
      AND lower(trim(p.customer_email)) NOT LIKE '%@example.com'
      AND lower(trim(p.customer_email)) NOT LIKE '%@test.com'
      AND lower(trim(p.customer_email)) NOT LIKE '%nowell%'
      AND (customer.id IS NULL OR (
        customer.newsletter_unsubscribed_at IS NULL
        AND customer.newsletter_subscribed IS NOT FALSE
      ))
      AND (outbox.id IS NULL OR outbox.status = 'pending')
      AND NOT EXISTS (
        SELECT 1 FROM public.email_events event
        WHERE lower(event.email) = lower(trim(p.customer_email))
          AND event.event_type IN ('bounced', 'complained', 'suppressed')
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.newsletter_email_sends send
        LEFT JOIN public.newsletter_campaigns campaign
          ON campaign.id = send.campaign_id
        WHERE lower(send.email) = lower(trim(p.customer_email))
          AND (
            campaign.subject ILIKE '%We owe you an apology%'
            OR campaign.subject ILIKE '%How was pickup?%'
            OR send.newsletter_id ILIKE '%apology%'
          )
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.email_events event
        LEFT JOIN public.newsletter_campaigns campaign
          ON campaign.newsletter_id = event.newsletter_id
        WHERE lower(event.email) = lower(trim(p.customer_email))
          AND (
            campaign.subject ILIKE '%We owe you an apology%'
            OR campaign.subject ILIKE '%How was pickup?%'
            OR event.tags::text ILIKE '%We owe you an apology%'
          )
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.notification_log note
        WHERE lower(note.recipient) = lower(trim(p.customer_email))
          AND (
            note.subject ILIKE '%We owe you an apology%'
            OR note.subject ILIKE '%How was pickup?%'
          )
      )
    ORDER BY lower(trim(p.customer_email)), p.picked_up_at ASC
    LIMIT $2`;

export async function listDuePortalSurveyLetters(client, {
  since = getPortalSurveyLetterSince(),
  limit = 50,
} = {}) {
  const { rows } = await client.query(PORTAL_SURVEY_LETTER_DUE_SQL, [
    since instanceof Date ? since.toISOString() : since,
    Math.min(Math.max(Number(limit) || 50, 1), 100),
  ]);
  return rows;
}

export async function recoverStalePortalSurveyLetterClaims(client, { leaseMinutes = 15 } = {}) {
  const { rows } = await client.query(
    `/* portal_survey_letter:recover_stale */
    UPDATE public.portal_survey_letter_outbox
    SET status = 'pending', claimed_at = NULL, updated_at = now(),
        skip_reason = 'stale_sending_lease_recovered'
    WHERE status = 'sending'
      AND sent_at IS NULL
      AND claimed_at < now() - make_interval(mins => $1)
    RETURNING id`,
    [leaseMinutes],
  );
  return rows.length;
}

export async function claimPortalSurveyLetter(client, order) {
  const email = normalizeEmail(order.customer_email);
  const firstName = firstNameFromCustomerName(order.customer_name);
  const { rows } = await client.query(
    `/* portal_survey_letter:claim */
    INSERT INTO public.portal_survey_letter_outbox (
      email, email_normalized, first_name, source_order_id, paid_at, status, claimed_at
    )
    VALUES ($1, $2, $3, $4, $5, 'sending', now())
    ON CONFLICT (email_normalized) DO UPDATE
      SET status = 'sending',
          claimed_at = now(),
          updated_at = now(),
          first_name = COALESCE(EXCLUDED.first_name, portal_survey_letter_outbox.first_name),
          source_order_id = COALESCE(portal_survey_letter_outbox.source_order_id, EXCLUDED.source_order_id),
          paid_at = COALESCE(portal_survey_letter_outbox.paid_at, EXCLUDED.paid_at),
          skip_reason = NULL
      WHERE portal_survey_letter_outbox.status = 'pending'
    RETURNING *`,
    [order.customer_email, email, firstName || null, order.order_id || order.id || null, order.paid_at],
  );
  return rows[0] || null;
}

export async function recordPortalSurveyLetterSent(client, item, providerId) {
  const { rows } = await client.query(
    `/* portal_survey_letter:sent */
    UPDATE public.portal_survey_letter_outbox
    SET status = 'sent', provider_id = $2, sent_at = COALESCE(sent_at, now()),
        skip_reason = NULL, last_error = NULL, updated_at = now()
    WHERE id = $1 AND status = 'sending'
    RETURNING id`,
    [item.id, providerId],
  );
  return rows.length > 0;
}

export async function recordPortalSurveyLetterFailure(client, item, error) {
  await client.query(
    `/* portal_survey_letter:failed */
    UPDATE public.portal_survey_letter_outbox
    SET status = 'pending', claimed_at = NULL, updated_at = now(),
        last_error = $2
    WHERE id = $1 AND status = 'sending'`,
    [item.id, String(error?.message || error || 'send_failed').slice(0, 1000)],
  );
}

export async function sendClaimedPortalSurveyLetter(client, resend, item, { now = new Date() } = {}) {
  const message = buildPortalSurveyLetter({
    firstName: item.first_name,
    email: item.email || item.email_normalized,
    now,
  });
  const response = await resend.emails.send({
    from: PORTAL_SURVEY_LETTER_FROM,
    replyTo: PORTAL_SURVEY_LETTER_REPLY_TO,
    to: [item.email || item.email_normalized],
    subject: message.subject,
    html: message.html,
    headers: portalSurveyLetterComplianceHeaders(item.email || item.email_normalized),
    tags: [
      { name: 'template', value: PORTAL_SURVEY_LETTER_TEMPLATE },
      { name: 'source', value: PORTAL_SURVEY_LETTER_SOURCE },
    ],
  }, { idempotencyKey: portalSurveyLetterIdempotencyKey(item.email_normalized || item.email) });

  const providerId = response?.data?.id;
  if (response?.error || !providerId) {
    const providerError = new Error(response?.error?.message || 'portal_survey_letter_not_accepted');
    await recordPortalSurveyLetterFailure(client, item, providerError);
    return { status: 'failed', error: providerError.message };
  }
  const recorded = await recordPortalSurveyLetterSent(client, item, providerId);
  if (!recorded) throw new Error('portal_survey_letter_acceptance_lost_claim');
  return { status: 'sent', providerId, id: item.id };
}

export async function processPortalSurveyLetters(client, resend, {
  sendActive = isSurveyLetterSendActive(),
  since = getPortalSurveyLetterSince(),
  limit = 50,
  now = new Date(),
} = {}) {
  const due = await listDuePortalSurveyLetters(client, { since, limit });
  if (!sendActive) {
    return {
      mode: 'dry-run',
      reason: 'send_flag_off',
      due: due.length,
      sent: 0,
      sample: due.slice(0, 5).map((row) => ({
        paid_at: row.paid_at,
        email: row.customer_email ? 'redacted' : null,
      })),
    };
  }

  await recoverStalePortalSurveyLetterClaims(client);
  const summary = { mode: 'apply', due: due.length, claimed: 0, sent: 0, failed: 0, skipped: 0 };
  for (const order of due) {
    const claimed = await claimPortalSurveyLetter(client, order);
    if (!claimed) {
      summary.skipped += 1;
      continue;
    }
    summary.claimed += 1;
    const result = await sendClaimedPortalSurveyLetter(client, resend, claimed, { now });
    if (result.status === 'sent') summary.sent += 1;
    else {
      summary.failed += 1;
      console.error('[portal-survey-letter] send failed:', result.error);
    }
  }
  return summary;
}
