import { isWormCastingsCampaignSource } from './wormCastingsCampaign.js';
import { labelForGardenStatus, nextActionLabel } from './wormCastingsRouting.js';
import { sswFrom } from './sswEmailFrom.js';

export const STAFF_SIGNUP_SUBJECT = 'SSW signup';
export const STAFF_GARDEN_CLASS_SUBJECT = 'New Garden Class Registration';
export const STAFF_ALERT_FROM = sswFrom('Soil Seed & Water');
export const STAFF_ALERT_REPLY_TO = 'ralvarez@soilseedandwater.com';
export const STAFF_NEWSLETTER_THREAD_ID = '<ssw-staff-signup@soilseedandwater.com>';
export const STAFF_GARDEN_CLASS_THREAD_ID = '<ssw-staff-garden-class@soilseedandwater.com>';

export function isGardenClassRegistrationSource(source) {
  return /^fall-garden-workshop(?:-|$)/i.test(String(source || '').trim());
}

export function staffAlertThreadingHeaders(threadId) {
  const id = String(threadId || '').trim();
  return {
    'In-Reply-To': id,
    References: id,
    'X-Entity-Ref-ID': id.replace(/[<>]/g, ''),
  };
}

const ADMIN_TEAM = Object.freeze([
  { name: 'Rodolfo Alvarez', email: 'ralvarez@soilseedandwater.com' },
  { name: 'Kerry Cooper', email: 'kcooper@soilseedandwater.com' },
  { name: 'Sabrina Moses', email: 'sabrina@soilseedandwater.com' },
  { name: 'Kash Starks', email: 'kash@soilseedandwater.com' },
  { name: 'Gabriela Perez', email: 'gperez@soilseedandwater.com' },
  { name: 'Alejandra Patricia Alvarez', email: 'alejandrapatriciaalvarez@gmail.com' },
]);

const INTERNAL_TEST_RECIPIENTS = Object.freeze([ADMIN_TEAM[0]]);

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function routingRow(label, value) {
  return `<tr><td style="padding:13px 15px;border-bottom:1px solid #e8ece6;color:#758078;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;">${escapeHtml(label)}</td><td style="padding:13px 15px;border-bottom:1px solid #e8ece6;font-size:15px;color:#243229;">${escapeHtml(value)}</td></tr>`;
}

export function getNewsletterAdminRecipients(active = process.env.NEWSLETTER_ADMIN_NOTIFICATIONS_ACTIVE) {
  return String(active || '').toLowerCase() === 'true' ? ADMIN_TEAM : INTERNAL_TEST_RECIPIENTS;
}

export function buildNewsletterAdminNotification({ subscriber, testing = true }) {
  const name = String(subscriber?.name || '').trim() || 'Not provided';
  const email = String(subscriber?.email || '').trim();
  const phone = String(subscriber?.phone || '').trim() || 'Not provided';
  const customerCategory = String(subscriber?.customerCategory || '').trim() || 'Not provided';
  const source = String(subscriber?.source || 'website_newsletter_signup').trim();
  const zipCode = String(subscriber?.zipCode || '').trim();
  const gardenStatus = String(subscriber?.gardenStatus || '').trim();
  const propertyProfile = String(subscriber?.propertyProfile || '').trim();
  const offer = String(subscriber?.offer || '').trim();
  const nextAction = String(subscriber?.nextAction || '').trim();
  const customerNumber = String(subscriber?.customerNumber || '').trim();
  const customerCategoryLabel = customerCategory
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
  const sourceLabel = source
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
  const gardenLabel = labelForGardenStatus(gardenStatus) || gardenStatus;
  const nextActionDisplay = nextActionLabel(nextAction) || nextAction;
  const extraRows = [
    customerNumber ? routingRow('Number', customerNumber) : '',
    zipCode ? routingRow('ZIP', zipCode) : '',
    gardenLabel ? routingRow('Garden', gardenLabel) : '',
    propertyProfile ? routingRow('Property', propertyProfile) : '',
    offer ? routingRow('Offer', offer.replace(/[-_]+/g, ' ')) : '',
    nextActionDisplay ? routingRow('Next action', nextActionDisplay) : '',
  ].join('');
  const subscribedAt = subscriber?.subscribedAt ? new Date(subscriber.subscribedAt) : new Date();
  const when = Number.isNaN(subscribedAt.getTime())
    ? 'Just now'
    : subscribedAt.toLocaleString('en-US', {
        timeZone: 'America/Phoenix',
        dateStyle: 'medium',
        timeStyle: 'short',
      });
  if (isGardenClassRegistrationSource(source)) {
    throw new Error('Garden class registrations cannot use the SSW signup staff alert.');
  }

  const isWormCastingsSignup = isWormCastingsCampaignSource(source);
  const signupType = isWormCastingsSignup ? 'Worm castings' : 'Newsletter';
  const notificationTitle = isWormCastingsSignup ? 'New worm castings signup' : 'New newsletter subscriber';
  const notificationLabel = signupType;
  const notificationBadge = 'New signup';
  const notificationHeading = 'New subscriber';
  const personLabel = 'subscriber';
  const actionDescription = `${escapeHtml(name)} signed up through <strong>${escapeHtml(sourceLabel)}</strong>.`;

  return {
    kind: 'newsletter',
    subject: STAFF_SIGNUP_SUBJECT,
    headers: staffAlertThreadingHeaders(STAFF_NEWSLETTER_THREAD_ID),
    html: `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="color-scheme" content="light">
    <meta name="supported-color-schemes" content="light">
    <title>${escapeHtml(notificationTitle)}</title>
  </head>
  <body bgcolor="#eef2ed" style="margin:0;background:#eef2ed;font-family:Arial,Helvetica,sans-serif;color:#243229;">
    <div style="display:none;max-height:0;overflow:hidden;">${escapeHtml(name)} just joined the Soil Seed &amp; Water community.</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#eef2ed" style="width:100%;background:#eef2ed;">
      <tr><td align="center" style="padding:24px 12px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#ffffff" style="width:100%;max-width:600px;background:#ffffff;border:1px solid #dfe6dc;border-radius:16px;overflow:hidden;">
          <tr><td style="padding:22px 26px;border-bottom:1px solid #e6ebe3;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr>
              <td valign="middle"><img src="https://www.organicsoilwholesale.com/email-assets/ssw-logo.png" width="190" alt="Soil Seed &amp; Water" style="display:block;width:190px;max-width:100%;height:auto;border:0;"><div style="margin-top:5px;font-size:11px;color:#748077;letter-spacing:.4px;">Community notifications</div></td>
              <td align="right" valign="middle"><span style="display:inline-block;padding:7px 10px;border-radius:999px;background:#edf5ea;color:#315533;font-size:11px;font-weight:800;letter-spacing:.8px;text-transform:uppercase;">${escapeHtml(notificationBadge)}</span></td>
            </tr></table>
          </td></tr>
          <tr><td bgcolor="#e8f1e6" style="padding:28px 26px;background:#e8f1e6;">
            <div style="font-size:12px;font-weight:800;letter-spacing:1.4px;text-transform:uppercase;color:#8a6a42;">${escapeHtml(notificationLabel)}</div>
            <h1 style="margin:7px 0 8px;font-size:28px;line-height:1.2;color:#1e3824;">${escapeHtml(notificationHeading)}</h1>
            <p style="margin:0;font-size:15px;line-height:1.55;color:#4e6253;">${actionDescription}</p>
          </td></tr>
          <tr><td style="padding:24px 26px;">
            ${testing ? '<div style="margin-bottom:18px;padding:11px 13px;background:#fff8e7;border:1px solid #ead8a8;border-radius:9px;color:#684e12;font-size:13px;"><strong>Internal test mode:</strong> currently delivered only to Rodolfo.</div>' : ''}
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border:1px solid #e2e8df;border-radius:12px;border-collapse:separate;overflow:hidden;">
              <tr><td style="padding:13px 15px;border-bottom:1px solid #e8ece6;color:#758078;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;width:32%;">Type</td><td style="padding:13px 15px;border-bottom:1px solid #e8ece6;font-size:15px;font-weight:700;color:#243229;">${escapeHtml(signupType)}</td></tr>
              <tr><td style="padding:13px 15px;border-bottom:1px solid #e8ece6;color:#758078;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;">Name</td><td style="padding:13px 15px;border-bottom:1px solid #e8ece6;font-size:15px;font-weight:700;color:#243229;">${escapeHtml(name)}</td></tr>
              <tr><td style="padding:13px 15px;border-bottom:1px solid #e8ece6;color:#758078;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;">Email</td><td style="padding:13px 15px;border-bottom:1px solid #e8ece6;font-size:15px;"><a href="mailto:${escapeHtml(email)}" style="color:#315d3a;text-decoration:none;font-weight:700;">${escapeHtml(email)}</a></td></tr>
              <tr><td style="padding:13px 15px;border-bottom:1px solid #e8ece6;color:#758078;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;">Phone</td><td style="padding:13px 15px;border-bottom:1px solid #e8ece6;font-size:15px;"><a href="tel:${escapeHtml(phone)}" style="color:#315d3a;text-decoration:none;font-weight:700;">${escapeHtml(phone)}</a></td></tr>
              <tr><td style="padding:13px 15px;border-bottom:1px solid #e8ece6;color:#758078;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;">Customer</td><td style="padding:13px 15px;border-bottom:1px solid #e8ece6;font-size:15px;color:#243229;">${escapeHtml(customerCategoryLabel)}</td></tr>
              ${extraRows}
              <tr><td style="padding:13px 15px;border-bottom:1px solid #e8ece6;color:#758078;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;">Source</td><td style="padding:13px 15px;border-bottom:1px solid #e8ece6;font-size:15px;color:#243229;">${escapeHtml(sourceLabel)}</td></tr>
              <tr><td style="padding:13px 15px;color:#758078;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;">Joined</td><td style="padding:13px 15px;font-size:15px;color:#243229;">${escapeHtml(when)} AZ</td></tr>
            </table>
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top:16px;"><tr>
              <td width="49%"><a href="mailto:${escapeHtml(email)}" style="display:block;padding:13px 10px;border-radius:9px;background:#264027;color:#ffffff;text-decoration:none;text-align:center;font-size:14px;font-weight:800;">Email ${personLabel}</a></td>
              <td width="2%">&nbsp;</td>
              <td width="49%"><a href="tel:${escapeHtml(phone)}" style="display:block;padding:12px 10px;border:1px solid #cbd6c8;border-radius:9px;background:#ffffff;color:#264027;text-decoration:none;text-align:center;font-size:14px;font-weight:800;">Call ${personLabel}</a></td>
            </tr></table>
            <div style="margin-top:18px;padding:13px 15px;border-radius:10px;background:#f1f6ef;color:#315533;font-size:13px;line-height:1.5;"><strong>✓ Consent recorded</strong><br><span style="color:#66756a;">Email opt-in, source, and timestamp are stored with the customer record.</span></div>
          </td></tr>
          <tr><td bgcolor="#f7f8f5" style="padding:16px 26px;background:#f7f8f5;border-top:1px solid #e6ebe3;color:#748077;font-size:12px;line-height:1.5;">Organic Soil Wholesale · Phoenix, Arizona · (623) 263-3386</td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`,
  };
}

export function buildGardenClassAdminNotification({ registration, testing = true }) {
  const name = String(registration?.full_name || registration?.name || '').trim() || 'Not provided';
  const email = String(registration?.email || '').trim();
  const phone = String(registration?.phone || '').trim() || 'Not provided';
  const customerCategory = String(registration?.customer_type || registration?.customerCategory || '').trim() || 'Not provided';
  const source = String(registration?.source || 'website').trim();
  const eventName = String(registration?.event_name || 'The Garden Reset').trim();
  const customerCategoryLabel = customerCategory
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
  const sourceLabel = source
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
  const registeredAt = registration?.created_at ? new Date(registration.created_at) : new Date();
  const when = Number.isNaN(registeredAt.getTime())
    ? 'Just now'
    : registeredAt.toLocaleString('en-US', {
        timeZone: 'America/Phoenix',
        dateStyle: 'medium',
        timeStyle: 'short',
      });

  return {
    kind: 'garden-class',
    subject: STAFF_GARDEN_CLASS_SUBJECT,
    headers: staffAlertThreadingHeaders(STAFF_GARDEN_CLASS_THREAD_ID),
    html: `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="color-scheme" content="light">
    <meta name="supported-color-schemes" content="light">
    <title>${escapeHtml(STAFF_GARDEN_CLASS_SUBJECT)}</title>
  </head>
  <body bgcolor="#eef2ed" style="margin:0;background:#eef2ed;font-family:Arial,Helvetica,sans-serif;color:#243229;">
    <div style="display:none;max-height:0;overflow:hidden;">${escapeHtml(name)} registered for ${escapeHtml(eventName)}.</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#eef2ed" style="width:100%;background:#eef2ed;">
      <tr><td align="center" style="padding:24px 12px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#ffffff" style="width:100%;max-width:600px;background:#ffffff;border:1px solid #dfe6dc;border-radius:16px;overflow:hidden;">
          <tr><td style="padding:22px 26px;border-bottom:1px solid #e6ebe3;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr>
              <td valign="middle"><img src="https://www.organicsoilwholesale.com/email-assets/ssw-logo.png" width="190" alt="Soil Seed &amp; Water" style="display:block;width:190px;max-width:100%;height:auto;border:0;"><div style="margin-top:5px;font-size:11px;color:#748077;letter-spacing:.4px;">Community notifications</div></td>
              <td align="right" valign="middle"><span style="display:inline-block;padding:7px 10px;border-radius:999px;background:#edf5ea;color:#315533;font-size:11px;font-weight:800;letter-spacing:.8px;text-transform:uppercase;">New registration</span></td>
            </tr></table>
          </td></tr>
          <tr><td bgcolor="#e8f1e6" style="padding:28px 26px;background:#e8f1e6;">
            <div style="font-size:12px;font-weight:800;letter-spacing:1.4px;text-transform:uppercase;color:#8a6a42;">Garden class</div>
            <h1 style="margin:7px 0 8px;font-size:28px;line-height:1.2;color:#1e3824;">${escapeHtml(STAFF_GARDEN_CLASS_SUBJECT)}</h1>
            <p style="margin:0;font-size:15px;line-height:1.55;color:#4e6253;">${escapeHtml(name)} registered for ${escapeHtml(eventName)} through <strong>${escapeHtml(sourceLabel)}</strong>.</p>
          </td></tr>
          <tr><td style="padding:24px 26px;">
            ${testing ? '<div style="margin-bottom:18px;padding:11px 13px;background:#fff8e7;border:1px solid #ead8a8;border-radius:9px;color:#684e12;font-size:13px;"><strong>Internal test mode:</strong> currently delivered only to Rodolfo.</div>' : ''}
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border:1px solid #e2e8df;border-radius:12px;border-collapse:separate;overflow:hidden;">
              <tr><td style="padding:13px 15px;border-bottom:1px solid #e8ece6;color:#758078;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;width:32%;">Type</td><td style="padding:13px 15px;border-bottom:1px solid #e8ece6;font-size:15px;font-weight:700;color:#243229;">Garden class</td></tr>
              <tr><td style="padding:13px 15px;border-bottom:1px solid #e8ece6;color:#758078;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;">Name</td><td style="padding:13px 15px;border-bottom:1px solid #e8ece6;font-size:15px;font-weight:700;color:#243229;">${escapeHtml(name)}</td></tr>
              <tr><td style="padding:13px 15px;border-bottom:1px solid #e8ece6;color:#758078;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;">Email</td><td style="padding:13px 15px;border-bottom:1px solid #e8ece6;font-size:15px;"><a href="mailto:${escapeHtml(email)}" style="color:#315d3a;text-decoration:none;font-weight:700;">${escapeHtml(email)}</a></td></tr>
              <tr><td style="padding:13px 15px;border-bottom:1px solid #e8ece6;color:#758078;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;">Phone</td><td style="padding:13px 15px;border-bottom:1px solid #e8ece6;font-size:15px;"><a href="tel:${escapeHtml(phone)}" style="color:#315d3a;text-decoration:none;font-weight:700;">${escapeHtml(phone)}</a></td></tr>
              <tr><td style="padding:13px 15px;border-bottom:1px solid #e8ece6;color:#758078;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;">Event</td><td style="padding:13px 15px;border-bottom:1px solid #e8ece6;font-size:15px;color:#243229;">${escapeHtml(eventName)}</td></tr>
              <tr><td style="padding:13px 15px;border-bottom:1px solid #e8ece6;color:#758078;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;">Customer</td><td style="padding:13px 15px;border-bottom:1px solid #e8ece6;font-size:15px;color:#243229;">${escapeHtml(customerCategoryLabel)}</td></tr>
              <tr><td style="padding:13px 15px;border-bottom:1px solid #e8ece6;color:#758078;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;">Source</td><td style="padding:13px 15px;border-bottom:1px solid #e8ece6;font-size:15px;color:#243229;">${escapeHtml(sourceLabel)}</td></tr>
              <tr><td style="padding:13px 15px;color:#758078;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;">Registered</td><td style="padding:13px 15px;font-size:15px;color:#243229;">${escapeHtml(when)} AZ</td></tr>
            </table>
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top:16px;"><tr>
              <td width="49%"><a href="mailto:${escapeHtml(email)}" style="display:block;padding:13px 10px;border-radius:9px;background:#264027;color:#ffffff;text-align:center;text-decoration:none;font-size:14px;font-weight:800;">Email registrant</a></td>
              <td width="2%">&nbsp;</td>
              <td width="49%"><a href="tel:${escapeHtml(phone)}" style="display:block;padding:12px 10px;border:1px solid #cbd6c8;border-radius:9px;background:#ffffff;color:#264027;text-align:center;text-decoration:none;font-size:14px;font-weight:800;">Call registrant</a></td>
            </tr></table>
            <div style="margin-top:18px;padding:13px 15px;border-radius:10px;background:#f1f6ef;color:#315533;font-size:13px;line-height:1.5;"><strong>✓ Consent recorded</strong><br><span style="color:#66756a;">Email opt-in, source, and timestamp are stored with the customer record.</span></div>
          </td></tr>
          <tr><td bgcolor="#f7f8f5" style="padding:16px 26px;background:#f7f8f5;border-top:1px solid #e6ebe3;color:#748077;font-size:12px;line-height:1.5;">Organic Soil Wholesale · Phoenix, Arizona · (623) 263-3386</td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`,
  };
}

async function sendStaffAlertMessages({ resend, recipients, message }) {
  return Promise.allSettled(recipients.map(async (recipient) => {
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
}

export async function sendNewsletterAdminNotifications({ resend, subscriber, recipients = getNewsletterAdminRecipients() }) {
  if (isGardenClassRegistrationSource(subscriber?.source)) {
    throw new Error('Garden class registrations cannot use the SSW signup staff alert.');
  }
  const testing = recipients.length === 1 && recipients[0]?.email === INTERNAL_TEST_RECIPIENTS[0].email;
  const message = buildNewsletterAdminNotification({ subscriber, testing });
  return sendStaffAlertMessages({ resend, recipients, message });
}

export async function sendGardenClassAdminNotifications({ resend, registration, recipients = getNewsletterAdminRecipients() }) {
  const testing = recipients.length === 1 && recipients[0]?.email === INTERNAL_TEST_RECIPIENTS[0].email;
  const message = buildGardenClassAdminNotification({ registration, testing });
  if (message.subject !== STAFF_GARDEN_CLASS_SUBJECT) {
    throw new Error('Garden class staff alerts must use the class subject.');
  }
  return sendStaffAlertMessages({ resend, recipients, message });
}

export { ADMIN_TEAM, INTERNAL_TEST_RECIPIENTS };
