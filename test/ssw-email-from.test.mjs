import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { buildReminderPayload } from '../shared/giveawayReminderQueue.js';
import { buildAdminApplicationEmail, buildApplicantConfirmationEmail } from '../shared/jobApplications.js';
import { STAFF_ALERT_FROM } from '../shared/newsletterNotifications.js';
import { PORTAL_SURVEY_LETTER_FROM } from '../shared/portalSurveyLetter.js';
import { buildPurchaseThankYouEmail, PURCHASE_THANK_YOU_FROM } from '../shared/purchaseThankYou.js';
import {
  SSW_BUSINESS_CARD_FROM_NAME,
  SSW_EMAIL_FROM_ADDRESS,
  getSswEmailFromAddress,
  resolveSswFrom,
  sswFrom,
} from '../shared/sswEmailFrom.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BLOCKED = /@soilseedandwater\.com/i;

function assertSendable(from, label) {
  assert.equal(typeof from, 'string', label);
  assert.match(from, /@/, label);
  assert.doesNotMatch(from, BLOCKED, `${label}: ${from}`);
}

test('central from address defaults to the verified bettersystems mailbox', () => {
  assert.equal(SSW_EMAIL_FROM_ADDRESS, 'soilseedandwater@bettersystems.ai');
  assert.equal(getSswEmailFromAddress({}), SSW_EMAIL_FROM_ADDRESS);
  assert.equal(sswFrom('Soil Seed & Water', {}), `Soil Seed & Water <${SSW_EMAIL_FROM_ADDRESS}>`);
  assert.equal(
    sswFrom(SSW_BUSINESS_CARD_FROM_NAME, {}),
    'Rodo Alvarez – Soil Seed & Water <soilseedandwater@bettersystems.ai>',
  );
});

test('SSW_EMAIL_FROM_ADDRESS overrides the mailbox unless it is on soilseedandwater.com', () => {
  const env = { SSW_EMAIL_FROM_ADDRESS: 'desk@bettersystems.ai' };
  assert.equal(getSswEmailFromAddress(env), 'desk@bettersystems.ai');
  assert.equal(sswFrom('OSW Alerts', env), 'OSW Alerts <desk@bettersystems.ai>');
  assert.equal(
    getSswEmailFromAddress({ SSW_EMAIL_FROM_ADDRESS: 'Soil Seed & Water <info@soilseedandwater.com>' }),
    SSW_EMAIL_FROM_ADDRESS,
  );
  assert.equal(
    resolveSswFrom('OSW Alerts <info@soilseedandwater.com>', 'OSW Alerts', env),
    'OSW Alerts <desk@bettersystems.ai>',
  );
});

test('per-feature from env vars and the newsletter from_address default cannot send as soilseedandwater.com', () => {
  const blockedEnvValues = [
    ['CHECKOUT_ALERT_FROM', 'OSW Alerts <info@soilseedandwater.com>', 'OSW Alerts'],
    ['INTAKE_NOTIFY_FROM', 'Organic Soil Wholesale <info@soilseedandwater.com>', 'Organic Soil Wholesale'],
    ['WORM_CASTINGS_EMAIL_FROM', 'Soil Seed & Water <info@soilseedandwater.com>', 'Soil Seed & Water'],
    ['WORK_ORDER_NOTIFICATION_FROM_EMAIL', 'SSW Operations <operations@soilseedandwater.com>', 'SSW Operations'],
    ['newsletter_campaigns.from_address', 'Soil Seed & Water <info@soilseedandwater.com>', 'Soil Seed & Water'],
  ];
  for (const [name, value, displayName] of blockedEnvValues) {
    const resolved = resolveSswFrom(value, displayName, {});
    assertSendable(resolved, name);
    assert.match(resolved, new RegExp(`^${displayName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} <`));
    assert.match(resolved, /<soilseedandwater@bettersystems\.ai>$/);
  }

  assert.equal(
    resolveSswFrom('Rodo Alvarez <ralvarez@soilseedandwater.com>', SSW_BUSINESS_CARD_FROM_NAME, {}),
    `Rodo Alvarez – Soil Seed & Water <${SSW_EMAIL_FROM_ADDRESS}>`,
  );

  const kept = resolveSswFrom('Custom Desk <alerts@bettersystems.ai>', 'OSW Alerts', {});
  assert.equal(kept, 'Custom Desk <alerts@bettersystems.ai>');
  assertSendable(kept, 'non-blocked feature from');
});

test('module senders and built messages stay off soilseedandwater.com', () => {
  const rls = buildPurchaseThankYouEmail({
    fullName: 'Ada',
    brandName: 'Regenerative Landscaper Supply',
  });
  const applicant = buildApplicantConfirmationEmail({
    preferred_name: 'Ada',
    first_name: 'Ada',
    email: 'ada@example.com',
    position_title: 'General Application',
  });
  const admin = buildAdminApplicationEmail({
    first_name: 'Ada',
    last_name: 'Lovelace',
    email: 'ada@example.com',
    position_title: 'General Application',
    position_slug: 'sales',
    city: 'Phoenix',
    state: 'AZ',
  }, []);
  const reminder = buildReminderPayload({
    channel: 'email',
    destination: 'person@example.com',
    content_key: 'email-1',
    scheduled_at: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(),
    reminder_id: 'reminder-1',
  });

  const senders = [
    ['purchase thank-you', PURCHASE_THANK_YOU_FROM],
    ['purchase thank-you message', buildPurchaseThankYouEmail({ fullName: 'Ada' }).from],
    ['regenerative landscaper supply', rls.from],
    ['staff alert', STAFF_ALERT_FROM],
    ['portal survey letter', PORTAL_SURVEY_LETTER_FROM],
    ['giveaway lead report', sswFrom('SSW Lead Report', {})],
    ['job applicant', applicant.from],
    ['job admin', admin.from],
    ['giveaway reminder', reminder.from],
    ['business card', sswFrom(SSW_BUSINESS_CARD_FROM_NAME, {})],
    ['organic soil wholesale', sswFrom('Organic Soil Wholesale', {})],
    ['ssw operations', sswFrom('SSW Operations', {})],
    ['osw alerts', sswFrom('OSW Alerts', {})],
  ];

  for (const [label, from] of senders) assertSendable(from, label);
  assert.match(applicant.from, /^Soil Seed & Water </);
  assert.match(admin.from, /^Soil Seed & Water Careers </);
  assert.match(rls.from, /^Regenerative Landscaper Supply </);
  assert.match(sswFrom('SSW Lead Report', {}), /^SSW Lead Report </);
  const giveawaySource = readFileSync(path.join(root, 'shared/giveawayNotifications.js'), 'utf8');
  assert.match(giveawaySource, /GIVEAWAY_LEAD_REPORT_FROM = sswFrom\('SSW Lead Report'\)/);
  assert.equal(applicant.replyTo, 'ralvarez@soilseedandwater.com');
  assert.equal(reminder.reply_to, 'ralvarez@soilseedandwater.com');
});

test('production source does not assign a From address on soilseedandwater.com', () => {
  const dirs = ['api', 'shared', 'server', 'scripts'].map((dir) => path.join(root, dir));
  const files = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      if (entry === 'node_modules' || entry === 'dist') continue;
      const full = path.join(dir, entry);
      const info = statSync(full);
      if (info.isDirectory()) walk(full);
      else if (/\.(js|mjs|cjs|ts|tsx)$/.test(entry)) files.push(full);
    }
  };
  dirs.forEach(walk);

  const assignment = /(?:\bfrom|\bfromAddress|\bFROM_EMAIL|\bSTAFF_ALERT_FROM|\bPORTAL_SURVEY_LETTER_FROM|\bPURCHASE_THANK_YOU_FROM|\bGIVEAWAY_LEAD_REPORT_FROM)\s*[:=]\s*(?:process\.env\.[A-Z0-9_]+\s*(?:\|\||\?\?)\s*)?['"`][^'"`\n]*@soilseedandwater\.com/i;
  const offenders = [];
  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    if (assignment.test(text)) offenders.push(path.relative(root, file));
  }
  assert.deepEqual(offenders, []);
});
