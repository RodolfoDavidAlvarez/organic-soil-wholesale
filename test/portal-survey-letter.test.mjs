import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  DEFAULT_PORTAL_SURVEY_LETTER_SINCE,
  PORTAL_SURVEY_LETTER_DUE_SQL,
  PORTAL_SURVEY_LETTER_SOURCE,
  PORTAL_SURVEY_LETTER_SUBJECT,
  PORTAL_SURVEY_LETTER_TEMPLATE,
  buildPortalSurveyLetter,
  getPortalSurveyLetterSince,
  isSurveyLetterSendActive,
  listDuePortalSurveyLetters,
  portalSurveyLetterComplianceHeaders,
  portalSurveyLetterUrl,
  processPortalSurveyLetters,
  skipReasonForPortalSurveyLetter,
} from '../shared/portalSurveyLetter.js';

const NOW = new Date('2026-11-02T18:00:00.000Z');
const SINCE = new Date('2026-10-29T07:00:00.000Z'); // 2026-10-29T00:00:00-07:00
const DUE_PICKED_UP_AT = new Date(NOW.getTime() - 3.5 * 24 * 60 * 60 * 1000).toISOString();

function dueOrder(overrides = {}) {
  return {
    status: 'picked_up',
    payment_status: 'paid',
    picked_up_at: DUE_PICKED_UP_AT,
    paid_at: DUE_PICKED_UP_AT,
    customer_email: 'buyer@gmail.com',
    customer_name: 'Haylee Buyer',
    ...overrides,
  };
}

class MemoryClient {
  constructor({ due = [] } = {}) {
    this.due = due;
    this.outbox = new Map();
    this.queries = [];
  }

  async query(sql, params = []) {
    this.queries.push({ sql, params });
    if (sql.includes('portal_survey_letter:list_due')) {
      return { rows: this.due };
    }
    if (sql.includes('portal_survey_letter:recover_stale')) {
      return { rows: [] };
    }
    if (sql.includes('portal_survey_letter:claim')) {
      const email = String(params[1] || '').toLowerCase();
      const existing = this.outbox.get(email);
      if (existing && existing.status !== 'pending') return { rows: [] };
      const row = {
        id: existing?.id || `outbox-${this.outbox.size + 1}`,
        email: params[0],
        email_normalized: email,
        first_name: params[2],
        source_order_id: params[3],
        paid_at: params[4],
        status: 'sending',
        claimed_at: NOW.toISOString(),
      };
      this.outbox.set(email, row);
      return { rows: [row] };
    }
    if (sql.includes('portal_survey_letter:sent')) {
      for (const row of this.outbox.values()) {
        if (row.id === params[0] && row.status === 'sending') {
          row.status = 'sent';
          row.provider_id = params[1];
          row.sent_at = NOW.toISOString();
          return { rows: [{ id: row.id }] };
        }
      }
      return { rows: [] };
    }
    if (sql.includes('portal_survey_letter:failed')) {
      for (const row of this.outbox.values()) {
        if (row.id === params[0]) {
          row.status = 'pending';
          row.last_error = params[1];
        }
      }
      return { rows: [] };
    }
    throw new Error(`Unexpected query: ${sql.slice(0, 80)}`);
  }
}

class FakeResend {
  constructor() {
    this.calls = [];
    this.emails = { send: this.send.bind(this) };
  }

  async send(payload, options = {}) {
    this.calls.push({ payload, options });
    return { data: { id: `provider-${this.calls.length}` }, error: null };
  }
}

test('send flag is off unless the env string is exactly true', () => {
  assert.equal(isSurveyLetterSendActive(undefined), false);
  assert.equal(isSurveyLetterSendActive(''), false);
  assert.equal(isSurveyLetterSendActive('TRUE'), false);
  assert.equal(isSurveyLetterSendActive('1'), false);
  assert.equal(isSurveyLetterSendActive('true'), true);
});

test('cutoff defaults to the regular-survey start day and is not a historical backfill', () => {
  assert.equal(DEFAULT_PORTAL_SURVEY_LETTER_SINCE, '2026-10-29T00:00:00-07:00');
  assert.equal(getPortalSurveyLetterSince('').toISOString(), SINCE.toISOString());
});

test('due-query includes a picked-up order 3 days old after cutoff and encodes every skip gate', () => {
  const sql = PORTAL_SURVEY_LETTER_DUE_SQL;
  assert.match(sql, /FROM public\.sp_pickup_orders p/);
  assert.doesNotMatch(sql, /FROM public\.sp_orders o/);
  assert.match(sql, /p\.status = 'picked_up'/);
  assert.match(sql, /picked_up_at <= now\(\) - interval '3 days'/);
  assert.match(sql, /picked_up_at >= \$1::timestamptz/);
  assert.match(sql, /customer_email IS NOT NULL/);
  assert.match(sql, /@soilseedandwater\.com/);
  assert.match(sql, /test@test\.com/);
  assert.match(sql, /newsletter_unsubscribed_at IS NULL/);
  assert.match(sql, /newsletter_subscribed IS NOT FALSE/);
  assert.match(sql, /bounced.*complained.*suppressed/s);
  assert.match(sql, /We owe you an apology/);
  assert.match(sql, /How was pickup\?/);
  assert.match(sql, /portal_survey_letter_outbox/);
  assert.match(sql, /DISTINCT ON \(lower\(trim\(p\.customer_email\)\)\)/);
});

test('eligibility helper includes 3-day picked-up email after cutoff and excludes the skip cases', () => {
  const extras = { now: NOW, since: SINCE };
  assert.equal(skipReasonForPortalSurveyLetter(dueOrder(), extras), null);

  assert.equal(skipReasonForPortalSurveyLetter(dueOrder({ status: 'queued' }), extras), 'not_picked_up');
  assert.equal(
    skipReasonForPortalSurveyLetter(dueOrder({
      picked_up_at: new Date(NOW.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    }), extras),
    'too_new',
  );
  assert.equal(
    skipReasonForPortalSurveyLetter(dueOrder({
      picked_up_at: new Date('2026-10-20T12:00:00-07:00').toISOString(),
    }), extras),
    'before_cutoff',
  );
  assert.equal(skipReasonForPortalSurveyLetter(dueOrder({ customer_email: '' }), extras), 'no_email');
  assert.equal(
    skipReasonForPortalSurveyLetter(dueOrder(), { ...extras, customer: { newsletter_unsubscribed_at: NOW.toISOString() } }),
    'unsubscribed',
  );
  assert.equal(
    skipReasonForPortalSurveyLetter(dueOrder(), { ...extras, customer: { newsletter_subscribed: false } }),
    'unsubscribed',
  );
  assert.equal(
    skipReasonForPortalSurveyLetter(dueOrder(), { ...extras, customer: null }),
    null,
  );
  assert.equal(
    skipReasonForPortalSurveyLetter(dueOrder(), { ...extras, events: ['complained'] }),
    'suppressed',
  );
  assert.equal(
    skipReasonForPortalSurveyLetter(dueOrder(), { ...extras, outbox: { status: 'sent', sent_at: NOW.toISOString() } }),
    'already_sent',
  );
  assert.equal(
    skipReasonForPortalSurveyLetter(dueOrder({ customer_email: 'dn@soilseedandwater.com' }), extras),
    'internal_ssw',
  );
  assert.equal(
    skipReasonForPortalSurveyLetter(dueOrder({ customer_email: 'dan.nowell@gmail.com' }), extras),
    'dan_nowell',
  );
});

test('flag off dry-runs due rows and never calls Resend', async () => {
  const client = new MemoryClient({ due: [dueOrder({ order_id: 99 })] });
  const resend = new FakeResend();
  const result = await processPortalSurveyLetters(client, resend, {
    sendActive: false,
    since: SINCE,
    now: NOW,
  });
  assert.equal(result.mode, 'dry-run');
  assert.equal(result.reason, 'send_flag_off');
  assert.equal(result.due, 1);
  assert.equal(result.sent, 0);
  assert.equal(resend.calls.length, 0);
  assert.equal(client.outbox.size, 0);
  assert.equal(client.queries.some((entry) => entry.sql.includes('portal_survey_letter:claim')), false);
});

test('unset SURVEY_LETTER_SEND_ACTIVE is a no-op for customer mail', async () => {
  const previous = process.env.SURVEY_LETTER_SEND_ACTIVE;
  delete process.env.SURVEY_LETTER_SEND_ACTIVE;
  try {
    const client = new MemoryClient({ due: [dueOrder({ order_id: 1 })] });
    const resend = new FakeResend();
    const result = await processPortalSurveyLetters(client, resend);
    assert.equal(result.mode, 'dry-run');
    assert.equal(resend.calls.length, 0);
  } finally {
    if (previous == null) delete process.env.SURVEY_LETTER_SEND_ACTIVE;
    else process.env.SURVEY_LETTER_SEND_ACTIVE = previous;
  }
});

test('letter HTML is a regular pickup survey without the apology framing', () => {
  const letter = buildPortalSurveyLetter({
    firstName: 'Haylee',
    email: 'haylee@example.com',
    now: new Date('2026-10-29T18:00:00.000Z'),
  });
  assert.equal(letter.subject, 'How was pickup?');
  assert.doesNotMatch(letter.subject, /\[TEST\]/);
  assert.doesNotMatch(letter.html, /We owe you an apology/);
  assert.doesNotMatch(letter.html, /heads-down being a store/);
  assert.doesNotMatch(letter.html, /August gift/);
  assert.match(letter.html, /How was pickup/);
  assert.match(letter.html, /tell us how pickup went/);
  assert.match(letter.html, /30% off one item/);
  assert.match(letter.html, /pickup-plus-3/);
  assert.match(letter.html, /first_name=Haylee/);
  assert.match(letter.html, /haylee%40example.com/);
  assert.match(letter.html, /ssw-logo-letter\.png/);
  assert.match(letter.html, /unsubscribe\?email=haylee%40example.com/);
  assert.doesNotMatch(letter.html, /phoenix-yard-entrance-map/);
  assert.doesNotMatch(letter.html, /yard-map/);
  const headers = portalSurveyLetterComplianceHeaders('haylee@example.com');
  assert.match(headers['List-Unsubscribe'], /unsubscribe\?email=haylee%40example.com/);
  assert.equal(headers['List-Unsubscribe-Post'], 'List-Unsubscribe=One-Click');
  assert.equal(
    portalSurveyLetterUrl({ firstName: 'Haylee', email: 'haylee@example.com' }),
    'https://www.organicsoilwholesale.com/survey?source=pickup-plus-3&first_name=Haylee&email=haylee%40example.com',
  );
  assert.equal(PORTAL_SURVEY_LETTER_SOURCE, 'pickup-plus-3');
  assert.equal(PORTAL_SURVEY_LETTER_TEMPLATE, 'portal_survey_letter');
  assert.equal(PORTAL_SURVEY_LETTER_SUBJECT, 'How was pickup?');
});

test('flag on claims then sends one Resend call per due email', async () => {
  const client = new MemoryClient({ due: [dueOrder({ order_id: 11, customer_email: 'buyer@gmail.com' })] });
  const resend = new FakeResend();
  const result = await processPortalSurveyLetters(client, resend, {
    sendActive: true,
    since: SINCE,
    now: NOW,
  });
  assert.equal(result.mode, 'apply');
  assert.equal(result.sent, 1);
  assert.equal(resend.calls.length, 1);
  assert.equal(resend.calls[0].payload.subject, PORTAL_SURVEY_LETTER_SUBJECT);
  assert.deepEqual(resend.calls[0].payload.to, ['buyer@gmail.com']);
  assert.equal(resend.calls[0].payload.from, 'Soil Seed & Water <info@soilseedandwater.com>');
  assert.equal(resend.calls[0].payload.replyTo, 'ralvarez@soilseedandwater.com');
  assert.equal(resend.calls[0].options.idempotencyKey, 'portal_survey_letter/buyer@gmail.com');
});

test('cron and payment paths stay isolated', async () => {
  const api = await readFile(new URL('../api/index.js', import.meta.url), 'utf8');
  const vercel = await readFile(new URL('../vercel.json', import.meta.url), 'utf8');
  const letter = await readFile(new URL('../shared/portalSurveyLetter.js', import.meta.url), 'utf8');
  const pay = await readFile(new URL('../server/routes/payAndPickup.ts', import.meta.url), 'utf8');
  assert.match(api, /\/api\/cron\/portal-survey-letter/);
  assert.match(vercel, /\/api\/cron\/portal-survey-letter/);
  assert.match(vercel, /\/api\/cron\/worm-castings-day3/);
  assert.match(vercel, /\/api\/cron\/checkout-monitor/);
  assert.match(letter, /SURVEY_LETTER_SEND_ACTIVE/);
  assert.match(letter, /sp_pickup_orders/);
  assert.doesNotMatch(letter, /payAndPickup/);
  assert.doesNotMatch(letter, /stripe/i);
  assert.doesNotMatch(pay, /portalSurveyLetter/);
  assert.doesNotMatch(pay, /SURVEY_LETTER_SEND_ACTIVE/);
});

test('listDue uses the tagged SQL against the injected client', async () => {
  const client = new MemoryClient({ due: [dueOrder({ order_id: 7 })] });
  const rows = await listDuePortalSurveyLetters(client, { since: SINCE, limit: 10 });
  assert.equal(rows.length, 1);
  assert.match(client.queries[0].sql, /portal_survey_letter:list_due/);
  assert.equal(client.queries[0].params[0], SINCE.toISOString());
});
