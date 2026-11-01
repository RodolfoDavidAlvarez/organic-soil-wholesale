import {
  ADMIN_TEAM,
  STAFF_ALERT_FROM,
  STAFF_ALERT_REPLY_TO,
  STAFF_GARDEN_CLASS_SUBJECT,
  STAFF_GARDEN_CLASS_THREAD_ID,
  STAFF_NEWSLETTER_THREAD_ID,
  STAFF_SIGNUP_SUBJECT,
  staffAlertThreadingHeaders,
} from './newsletterNotifications.js';
import {
  SURVEY_KIND_GARDEN_CLASS,
  isGardenClassSurveySource,
  saveSurveyResponse,
  validateSurveyResponse,
} from './surveyResponses.js';

export const STAFF_YARD_SURVEY_SUBJECT = 'New yard survey';
export const SURVEY_BAG_RECEIPT_SUBJECT = 'Your free bag';
export const STAFF_CLASS_SURVEY_SUBJECT = 'New class survey';
export const STAFF_YARD_SURVEY_THREAD_ID = '<ssw-staff-yard-survey@soilseedandwater.com>';
export const STAFF_CLASS_SURVEY_THREAD_ID = '<ssw-staff-class-survey@soilseedandwater.com>';
export const SURVEY_ADMIN_INBOX_URL = 'https://www.organicsoilwholesale.com/admin/surveys';
export const BLOCKED_SURVEY_ALERT_EMAILS = Object.freeze([
  'dn@soilseedandwater.com',
]);
const BLOCKED_SURVEY_ALERT_PERSON_RE = /nowell|nancy|johnathan|jonathan|luis|\bsimon\b|\bjesus\b/i;

const ADMIN_INBOX_PATH = '/admin/surveys';

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatPhoenixTime(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return 'Just now';
  return date.toLocaleString('en-US', {
    timeZone: 'America/Phoenix',
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

export function isBlockedSurveyAlertRecipient(person) {
  const email = normalizeEmail(person?.email);
  const hay = `${person?.name || ''} ${email}`;
  if (!email) return true;
  if (BLOCKED_SURVEY_ALERT_EMAILS.includes(email)) return true;
  if (BLOCKED_SURVEY_ALERT_PERSON_RE.test(hay)) return true;
  return false;
}

export function parseSurveyAlertRecipientEnv(value) {
  return String(value || '')
    .split(',')
    .map((part) => normalizeEmail(part))
    .filter(Boolean)
    .map((email) => ({ name: email, email }));
}

export function getSurveyAlertRecipients({
  envRecipients = process.env.SURVEY_ALERT_RECIPIENTS,
} = {}) {
  const fromEnv = parseSurveyAlertRecipientEnv(envRecipients);
  const source = fromEnv.length > 0 ? fromEnv : ADMIN_TEAM;
  const seen = new Set();
  const recipients = [];
  for (const person of source) {
    const email = normalizeEmail(person?.email);
    if (!email || seen.has(email) || isBlockedSurveyAlertRecipient({ ...person, email })) {
      continue;
    }
    seen.add(email);
    recipients.push({ name: person?.name || email, email });
  }
  return recipients;
}

export function isYardSurveyAlert(saved = {}) {
  if (isGardenClassSurveySource(saved.source) || saved.survey_kind === SURVEY_KIND_GARDEN_CLASS) {
    return false;
  }
  return true;
}

export function surveyStaffAlertSubject(saved = {}) {
  return isYardSurveyAlert(saved) ? STAFF_YARD_SURVEY_SUBJECT : STAFF_CLASS_SURVEY_SUBJECT;
}

function formatScores(saved = {}) {
  const scores = saved.scores && typeof saved.scores === 'object' ? saved.scores : {};
  const parts = Object.entries(scores)
    .filter(([, value]) => value === 0 || value)
    .map(([key, value]) => `${key}: ${value}`);
  return parts.length ? parts.join(', ') : 'None';
}

function detailRow(label, value) {
  return `<tr><td style="padding:13px 15px;border-bottom:1px solid #e8ece6;color:#758078;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;width:32%;">${escapeHtml(label)}</td><td style="padding:13px 15px;border-bottom:1px solid #e8ece6;font-size:15px;color:#243229;">${value}</td></tr>`;
}

export function buildSurveyStaffAlert({ saved, coupon = null } = {}) {
  const yard = isYardSurveyAlert(saved);
  const subject = yard ? STAFF_YARD_SURVEY_SUBJECT : STAFF_CLASS_SURVEY_SUBJECT;
  const threadId = yard ? STAFF_YARD_SURVEY_THREAD_ID : STAFF_CLASS_SURVEY_THREAD_ID;
  const firstName = String(saved?.first_name || '').trim() || 'Not provided';
  const email = String(saved?.email || saved?.email_normalized || '').trim();
  const kind = String(saved?.survey_kind || (yard ? 'purchase' : SURVEY_KIND_GARDEN_CLASS)).trim();
  const source = String(saved?.source || '').trim() || 'osw-survey';
  const notes = String(saved?.notes || '').trim() || 'None';
  const couponCode = String(coupon?.code || saved?.coupon_code || '').trim() || 'None';
  const createdAt = formatPhoenixTime(saved?.created_at);
  const badge = yard ? 'New yard survey' : 'New class survey';
  const inboxUrl = SURVEY_ADMIN_INBOX_URL;

  if (subject === STAFF_SIGNUP_SUBJECT || subject === STAFF_GARDEN_CLASS_SUBJECT) {
    throw new Error('Survey staff alerts cannot reuse signup or class-registration subjects.');
  }
  if (threadId === STAFF_NEWSLETTER_THREAD_ID || threadId === STAFF_GARDEN_CLASS_THREAD_ID) {
    throw new Error('Survey staff alerts cannot reuse signup or class-registration thread headers.');
  }

  return {
    kind: yard ? 'yard-survey' : 'class-survey',
    subject,
    headers: staffAlertThreadingHeaders(threadId),
    html: `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="color-scheme" content="light">
    <meta name="supported-color-schemes" content="light">
    <title>${escapeHtml(subject)}</title>
  </head>
  <body bgcolor="#eef2ed" style="margin:0;background:#eef2ed;font-family:Arial,Helvetica,sans-serif;color:#243229;">
    <div style="display:none;max-height:0;overflow:hidden;">${escapeHtml(firstName)} submitted a ${escapeHtml(kind)} survey.</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#eef2ed" style="width:100%;background:#eef2ed;">
      <tr><td align="center" style="padding:24px 12px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#ffffff" style="width:100%;max-width:600px;background:#ffffff;border:1px solid #dfe6dc;border-radius:16px;overflow:hidden;">
          <tr><td style="padding:22px 26px;border-bottom:1px solid #e6ebe3;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr>
              <td valign="middle"><img src="https://www.organicsoilwholesale.com/email-assets/ssw-logo.png" width="190" alt="Soil Seed &amp; Water" style="display:block;width:190px;max-width:100%;height:auto;border:0;"><div style="margin-top:5px;font-size:11px;color:#748077;letter-spacing:.4px;">Survey notifications</div></td>
              <td align="right" valign="middle"><span style="display:inline-block;padding:7px 10px;border-radius:999px;background:#edf5ea;color:#315533;font-size:11px;font-weight:800;letter-spacing:.8px;text-transform:uppercase;">${escapeHtml(badge)}</span></td>
            </tr></table>
          </td></tr>
          <tr><td bgcolor="#e8f1e6" style="padding:28px 26px;background:#e8f1e6;">
            <div style="font-size:12px;font-weight:800;letter-spacing:1.4px;text-transform:uppercase;color:#8a6a42;">${escapeHtml(kind)}</div>
            <h1 style="margin:7px 0 8px;font-size:28px;line-height:1.2;color:#1e3824;">${escapeHtml(subject)}</h1>
            <p style="margin:0;font-size:15px;line-height:1.55;color:#4e6253;">${escapeHtml(firstName)} submitted a survey. This is an internal staff ping only.</p>
          </td></tr>
          <tr><td style="padding:24px 26px;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border:1px solid #e2e8df;border-radius:12px;border-collapse:separate;overflow:hidden;">
              ${detailRow('First name', escapeHtml(firstName))}
              ${detailRow('Email', `<a href="mailto:${escapeHtml(email)}" style="color:#315d3a;text-decoration:none;font-weight:700;">${escapeHtml(email)}</a>`)}
              ${detailRow('Kind', escapeHtml(kind))}
              ${detailRow('Source', escapeHtml(source))}
              ${detailRow('Scores', escapeHtml(formatScores(saved)))}
              ${detailRow('Notes', escapeHtml(notes))}
              ${detailRow('Coupon', escapeHtml(couponCode))}
              ${detailRow('Created', `${escapeHtml(createdAt)} AZ`)}
            </table>
            <p style="margin:16px 0 0;"><a href="${escapeHtml(inboxUrl)}" style="display:inline-block;padding:13px 18px;border-radius:9px;background:#264027;color:#ffffff;text-decoration:none;font-size:14px;font-weight:800;">Open ${ADMIN_INBOX_PATH}</a></p>
          </td></tr>
          <tr><td bgcolor="#f7f8f5" style="padding:16px 26px;background:#f7f8f5;border-top:1px solid #e6ebe3;color:#748077;font-size:12px;line-height:1.5;">Organic Soil Wholesale · Phoenix, Arizona · (623) 263-3386</td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`,
  };
}

export function buildSurveyBagReceipt({ coupon, firstName = '' } = {}) {
  const code = String(coupon?.code || '').trim().toUpperCase();
  if (!code.startsWith('SSWBAG-') || !coupon?.qrUrl) return null;
  const name = String(firstName || coupon.firstName || '').trim();
  const greeting = name
    ? `Hey ${escapeHtml(name)}, this code is for your next visit.`
    : 'This code is for your next visit.';
  const qrUrl = `https://www.organicsoilwholesale.com${coupon.qrUrl}`;
  return {
    subject: SURVEY_BAG_RECEIPT_SUBJECT,
    html: `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Your free bag</title></head><body style="margin:0;padding:0;background:#d6ccb4;"><div style="display:none;max-height:0;overflow:hidden;">Show this at the yard. 90 days to redeem.</div><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#d6ccb4;"><tr><td align="center" style="padding:22px 12px;"><table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#fffdf7;border:1px solid #cfc6ae;"><tr><td bgcolor="#fffdf7" style="padding:28px 36px 22px;font-family:Georgia,'Times New Roman',serif;color:#1c201a;font-size:16px;line-height:1.55;background-color:#fffdf7;"><p style="margin:0 0 14px;">${greeting}</p><p style="margin:0 0 8px;">One free 50 pound dairy compost.</p><img src="${escapeHtml(qrUrl)}" alt="Yard redemption code" width="220" height="220" style="display:block;width:220px;height:auto;border:0;margin:12px 0;"><p style="margin:0 0 8px;font-family:Consolas,monospace;letter-spacing:1px;">${escapeHtml(code)}</p><p style="margin:0 0 8px;">Show this at the yard.</p><p style="margin:0;font-size:14px;color:#5a6058;">90 days to redeem.</p></td></tr><tr><td bgcolor="#fffdf7" style="padding:14px 36px 22px;border-top:1px solid #e4dfd2;font-family:Georgia,'Times New Roman',serif;font-size:12px;line-height:1.5;color:#7a817b;background-color:#fffdf7;">Soil Seed &amp; Water &middot; 1634 N 19th Ave, Phoenix, AZ 85009<br>(623) 263-3386</td></tr></table></td></tr></table></body></html>`,
  };
}

export async function sendSurveyBagReceipt({ resend, coupon, email, firstName } = {}) {
  const message = buildSurveyBagReceipt({ coupon, firstName });
  const to = normalizeEmail(email);
  if (!message || !to || !resend?.emails?.send) return { sent: false };
  const result = await resend.emails.send({
    from: STAFF_ALERT_FROM,
    replyTo: STAFF_ALERT_REPLY_TO,
    to,
    subject: message.subject,
    html: message.html,
  }, { idempotencyKey: `survey_bag_receipt/${coupon.code}` });
  if (result?.error || !result?.data?.id) {
    console.error('[Survey] Bag receipt failed:', result?.error?.message || result?.error || 'not accepted');
    return { sent: false };
  }
  return { sent: true, id: result.data.id };
}

function staffRecipientsExcludingCustomer(recipients, saved) {
  const customerEmail = normalizeEmail(saved?.email || saved?.email_normalized);
  return (recipients || []).filter((person) => {
    const email = normalizeEmail(person?.email);
    if (!email || email === customerEmail) return false;
    if (isBlockedSurveyAlertRecipient({ ...person, email })) return false;
    return true;
  });
}

export async function sendSurveyStaffAlerts({
  resend,
  saved,
  coupon = null,
  recipients = getSurveyAlertRecipients(),
} = {}) {
  if (!resend?.emails?.send) return { accepted: 0, results: [] };
  const message = buildSurveyStaffAlert({ saved, coupon });
  const to = staffRecipientsExcludingCustomer(recipients, saved);
  if (!to.length) return { accepted: 0, results: [] };

  const results = await Promise.allSettled(to.map(async (recipient) => {
    const result = await resend.emails.send({
      from: STAFF_ALERT_FROM,
      replyTo: STAFF_ALERT_REPLY_TO,
      to: recipient.email,
      subject: message.subject,
      html: message.html,
      headers: message.headers,
    });
    if (result?.error) throw new Error(result.error.message || JSON.stringify(result.error));
    return { recipient, id: result?.data?.id || null, subject: message.subject };
  }));

  const accepted = results.filter((entry) => entry.status === 'fulfilled' && entry.value?.id).length;
  results.forEach((entry, index) => {
    if (entry.status === 'rejected') {
      console.error(
        `[Survey] Staff alert to ${to[index]?.email} failed:`,
        entry.reason?.message || entry.reason,
      );
    }
  });
  return { accepted, results };
}

export async function markSurveyStaffAlerted(db, responseId, now = new Date()) {
  if (!db?.from || !responseId) return false;
  const { error } = await db
    .from('sp_survey_responses')
    .update({ follow_up_alerted_at: now instanceof Date ? now.toISOString() : now })
    .eq('id', responseId);
  if (error) {
    console.error('[Survey] follow_up_alerted_at update failed:', error.message || error);
    return false;
  }
  return true;
}

async function resolveResend(resend) {
  if (resend) return resend;
  if (!process.env.RESEND_API_KEY) return null;
  const { Resend } = await import('resend');
  return new Resend(process.env.RESEND_API_KEY);
}

export async function processSurveySubmission({
  db,
  body,
  userAgent = '',
  resend = null,
  getRecipients = getSurveyAlertRecipients,
  now = new Date(),
} = {}) {
  const validation = validateSurveyResponse(body || {}, { userAgent });
  if (!validation.ok) return { status: 400, json: { error: validation.error } };
  if (validation.bot) return { status: 200, json: { success: true } };

  const result = await saveSurveyResponse({ db, response: validation.response, now });

  try {
    const client = await resolveResend(resend);
    if (client) {
      const ping = await sendSurveyStaffAlerts({
        resend: client,
        saved: result.response,
        coupon: result.coupon,
        recipients: getRecipients(),
      });
      if (ping.accepted > 0) {
        await markSurveyStaffAlerted(db, result.response.id, now);
      }
    }
  } catch (error) {
    console.error('[Survey] Staff alert error:', error?.message || error);
  }

  try {
    const client = await resolveResend(resend);
    if (client && result.coupon?.code) {
      await sendSurveyBagReceipt({
        resend: client,
        coupon: result.coupon,
        email: result.response?.email || result.response?.email_normalized,
        firstName: result.response?.first_name,
      });
    }
  } catch (error) {
    console.error('[Survey] Bag receipt error:', error?.message || error);
  }

  return {
    status: 201,
    json: {
      success: true,
      responseId: result.response.id,
      message: 'Thank you. We read these.',
      coupon: result.coupon,
    },
  };
}
