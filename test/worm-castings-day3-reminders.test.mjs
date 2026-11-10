import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  DAY3_THRESHOLD_MS,
  claimNextReminder,
  isReminderThresholdReached,
  listDay3ReminderDue,
  processDay3Reminders,
  recoverStaleReminderClaims,
  reminderComplianceHeaders,
  reminderIdempotencyKey,
  retryDelaySeconds,
  sendNextReminder,
  updateReminderDeliveryFromWebhook,
} from '../shared/wormCastingsDay3Reminders.js';
import { buildWormCastingsDay3ReminderEmail } from '../shared/wormCastingsCampaign.js';

const BASE_ITEM = {
  id: '11111111-1111-4111-8111-111111111111',
  redemption_id: '22222222-2222-4222-8222-222222222222',
  full_name: 'Phoenix Neighbor',
  email: 'neighbor@example.com',
  recipient: 'neighbor@example.com',
  redemption_token: '33333333-3333-4333-8333-333333333333',
  provider_idempotency_key: 'worm-day3-11111111-1111-4111-8111-111111111111',
  max_attempts: 5,
};

class MemoryClient {
  constructor({ eligible = true, maxAttempts = 5, failAcceptedWriteOnce = false } = {}) {
    this.state = 'pending';
    this.eligible = eligible;
    this.attemptCount = 0;
    this.maxAttempts = maxAttempts;
    this.failAcceptedWriteOnce = failAcceptedWriteOnce;
    this.queries = [];
  }

  async query(sql, params = []) {
    this.queries.push({ sql, params });
    if (sql.includes('worm_day3:list_due')) return { rows: [] };
    if (sql.includes('worm_day3:claim')) {
      if (!this.eligible || !['pending', 'retry'].includes(this.state)) return { rows: [] };
      this.state = 'sending';
      this.attemptCount += 1;
      return { rows: [{
        ...BASE_ITEM,
        status: 'sending',
        attempt_count: this.attemptCount,
        max_attempts: this.maxAttempts,
        lock_token: `44444444-4444-4444-8444-${String(this.attemptCount).padStart(12, '0')}`,
      }] };
    }
    if (sql.includes('worm_day3:accepted')) {
      if (this.failAcceptedWriteOnce) {
        this.failAcceptedWriteOnce = false;
        throw new Error('simulated_commit_loss');
      }
      if (this.state !== 'sending') return { rows: [] };
      this.state = 'sent';
      return { rows: [{ id: 1 }] };
    }
    if (sql.includes('worm_day3:failed')) {
      this.state = this.attemptCount >= this.maxAttempts ? 'dead_letter' : 'retry';
      return { rows: [{ id: BASE_ITEM.id, status: this.state }] };
    }
    if (sql.includes('worm_day3:recover_stale')) {
      if (this.state !== 'sending') return { rows: [] };
      this.state = this.attemptCount >= this.maxAttempts ? 'dead_letter' : 'retry';
      return { rows: [{ id: BASE_ITEM.id, status: this.state }] };
    }
    if (sql.includes('worm_day3:create_run')) return { rows: [{ id: '55555555-5555-4555-8555-555555555555' }] };
    if (sql.includes('worm_day3:enqueue')) return { rows: [] };
    if (sql.includes('worm_day3:cancel_ineligible')) return { rows: [] };
    if (sql.includes('worm_day3:finish_run') || sql.includes('worm_day3:alert_')) return { rows: [] };
    throw new Error(`Unexpected query: ${sql.slice(0, 80)}`);
  }
}

class IdempotentResend {
  constructor({ failures = [] } = {}) {
    this.calls = [];
    this.deliveries = new Map();
    this.failures = [...failures];
    this.emails = { send: this.send.bind(this) };
  }

  async send(payload, options = {}) {
    this.calls.push({ payload, options });
    const failure = this.failures.shift();
    if (failure) return { data: null, error: failure };
    const key = options.idempotencyKey;
    if (!this.deliveries.has(key)) this.deliveries.set(key, `provider-${this.deliveries.size + 1}`);
    return { data: { id: this.deliveries.get(key) }, error: null };
  }
}

test('eligibility boundary is exactly 72 hours after coupon delivery', () => {
  const now = new Date('2026-08-08T16:00:00.000Z');
  const threshold = now.getTime() - DAY3_THRESHOLD_MS;
  assert.equal(isReminderThresholdReached(new Date(threshold + 1000), now), false);
  assert.equal(isReminderThresholdReached(new Date(threshold), now), true);
  assert.equal(isReminderThresholdReached(new Date(threshold - 1000), now), true);
});

test('eligibility SQL anchors to distribution_sent_at and applies every suppression gate', async () => {
  const client = new MemoryClient();
  await listDay3ReminderDue(client);
  const sql = client.queries[0].sql;
  assert.match(sql, /distribution_sent_at <= now\(\) - interval '3 days'/);
  assert.doesNotMatch(sql, /issued_at <=/);
  assert.match(sql, /redeemed_at IS NULL/);
  assert.match(sql, /newsletter_subscribed IS TRUE/);
  assert.match(sql, /newsletter_unsubscribed_at IS NULL/);
  for (const event of ['bounced', 'complained', 'suppressed']) assert.match(sql, new RegExp(event));
});

test('email is clear, complete, compliant, and contains working destination shapes', () => {
  const email = buildWormCastingsDay3ReminderEmail({
    fullName: 'Phoenix Neighbor',
    token: BASE_ITEM.redemption_token,
    email: BASE_ITEM.email,
  });
  assert.equal(email.subject, 'Your free worm castings bag is still waiting');
  assert.match(email.html, /free 9-lb bag/i);
  assert.match(email.html, /Tuesday–Saturday, 8:00 AM–4:00 PM/);
  assert.match(email.html, /Closed for break from 1:00–2:00 PM/);
  assert.match(email.html, /1634 N 19th Ave, Phoenix, AZ 85009/);
  assert.match(email.html, /\(623\) 263-3386/);
  assert.match(email.html, new RegExp(`/redeem/worm-castings/${BASE_ITEM.redemption_token}`));
  assert.match(email.html, /unsubscribe\?email=neighbor%40example\.com/);
  assert.doesNotMatch(email.html, /\(602\) 637-0032/);
  const headers = reminderComplianceHeaders(BASE_ITEM.email);
  assert.match(headers['List-Unsubscribe'], /unsubscribe\?email=neighbor%40example\.com/);
  assert.equal(headers['List-Unsubscribe-Post'], 'List-Unsubscribe=One-Click');
});

test('two concurrent workers make one provider request and one durable acceptance', async () => {
  const client = new MemoryClient();
  const resend = new IdempotentResend();
  const options = { fromAddress: 'Soil Seed & Water <info@soilseedandwater.com>', sourceApp: 'test' };
  const results = await Promise.all([
    sendNextReminder(client, resend, options),
    sendNextReminder(client, resend, options),
  ]);
  assert.deepEqual(results.map((result) => result.status).sort(), ['empty', 'sent']);
  assert.equal(resend.calls.length, 1);
  assert.equal(resend.calls[0].payload.from, 'Soil Seed & Water <soilseedandwater@bettersystems.ai>');
  assert.equal(client.state, 'sent');
});

test('crash after provider acceptance recovers without a second delivery', async () => {
  const client = new MemoryClient({ failAcceptedWriteOnce: true });
  const resend = new IdempotentResend();
  const options = { fromAddress: 'Soil Seed & Water <info@soilseedandwater.com>', sourceApp: 'test' };
  await assert.rejects(sendNextReminder(client, resend, options), /simulated_commit_loss/);
  assert.equal(client.state, 'sending');
  const recovery = await recoverStaleReminderClaims(client, { leaseMinutes: 0 });
  assert.equal(recovery.recovered, 1);
  const result = await sendNextReminder(client, resend, options);
  assert.equal(result.status, 'sent');
  assert.equal(resend.calls.length, 2);
  assert.equal(resend.deliveries.size, 1);
  assert.equal(resend.calls[0].options.idempotencyKey, resend.calls[1].options.idempotencyKey);
});

test('429 failures retry with bounded backoff and then dead-letter', async () => {
  const client = new MemoryClient({ maxAttempts: 3 });
  const resend = new IdempotentResend({ failures: [
    { message: 'rate limited', statusCode: 429 },
    { message: 'rate limited', statusCode: 429 },
    { message: 'rate limited', statusCode: 429 },
  ] });
  const options = { fromAddress: 'Soil Seed & Water <info@soilseedandwater.com>', sourceApp: 'test' };
  assert.equal((await sendNextReminder(client, resend, options)).status, 'retry');
  assert.equal((await sendNextReminder(client, resend, options)).status, 'retry');
  assert.equal((await sendNextReminder(client, resend, options)).status, 'dead_letter');
  assert.equal(retryDelaySeconds(1), 60);
  assert.equal(retryDelaySeconds(2), 120);
  assert.equal(retryDelaySeconds(20), 86400);
});

test('redemption, opt-out, bounce, or complaint at claim time prevents delivery', async () => {
  for (const reason of ['redeemed', 'opted_out', 'bounced', 'complained']) {
    const client = new MemoryClient({ eligible: false });
    const resend = new IdempotentResend();
    const result = await sendNextReminder(client, resend, {
      fromAddress: 'Soil Seed & Water <info@soilseedandwater.com>', sourceApp: reason,
    });
    assert.equal(result.status, 'empty');
    assert.equal(resend.calls.length, 0);
  }
});

test('one-email cadence remains closed after successful send', async () => {
  const client = new MemoryClient();
  const resend = new IdempotentResend();
  const options = { fromAddress: 'Soil Seed & Water <info@soilseedandwater.com>', sourceApp: 'test' };
  assert.equal((await sendNextReminder(client, resend, options)).status, 'sent');
  assert.equal((await sendNextReminder(client, resend, options)).status, 'empty');
  assert.equal(resend.calls.length, 1);
  assert.equal(reminderIdempotencyKey(BASE_ITEM.id), BASE_ITEM.provider_idempotency_key);
});

test('webhook delivery and complaint events update only the reminder ledger', async () => {
  const updates = [];
  const supabase = {
    from(table) {
      return {
        update(patch) {
          return {
            eq(column, value) {
              updates.push({ table, patch, column, value });
              return Promise.resolve({ error: null });
            },
          };
        },
      };
    },
  };
  await updateReminderDeliveryFromWebhook(supabase, {
    providerId: 'provider-1', kind: 'delivered', now: '2026-08-08T16:00:00.000Z',
  });
  await updateReminderDeliveryFromWebhook(supabase, {
    providerId: 'provider-2', kind: 'complained', now: '2026-08-08T16:01:00.000Z',
  });
  assert.equal(updates.length, 4);
  assert.deepEqual(updates.map((entry) => entry.table), [
    'worm_castings_reminder_outbox', 'worm_castings_reminder_attempts',
    'worm_castings_reminder_outbox', 'worm_castings_reminder_attempts',
  ]);
  assert.equal(updates[0].patch.status, 'delivered');
  assert.equal(updates[2].patch.status, 'complained');
  assert.ok(updates.every((entry) => !entry.table.includes('redemptions')));
});

test('dry-run never sends and reports only query results', async () => {
  const client = new MemoryClient();
  const resend = new IdempotentResend();
  const result = await processDay3Reminders(client, resend, { apply: false });
  assert.equal(result.mode, 'dry-run');
  assert.equal(resend.calls.length, 0);
});

test('campaign UI gives clear user-visible coupon delivery failure guidance', async () => {
  const source = await readFile(new URL('../client/src/pages/WormCastingsCampaign.tsx', import.meta.url), 'utf8');
  assert.match(source, /Your sign-up is saved, but we could not email the coupon yet\. Please try again shortly\./);
  assert.match(source, /role="alert"/);
  assert.match(source, /Please check your inbox, Spam, and Promotions folders/);
});
