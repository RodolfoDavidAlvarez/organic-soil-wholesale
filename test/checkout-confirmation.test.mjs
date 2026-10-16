import test from 'node:test';
import assert from 'node:assert/strict';
import { confirmPaidCheckout } from '../shared/checkoutConfirmation.js';

const sessionId = 'cs_live_fixtureOrder41';
const items = [{ product_id: 1000, size_option: '1 CF Bag', quantity: 2, unit_price: 10.99 }];
const order = {
  id: 41,
  payment_status: 'paid',
  stripe_checkout_session_id: sessionId,
  total_amount: 0, // Reproduce historical orders whose saved total was missing.
  total: 0,
  fulfillment_type: 'pickup',
  location_id: 1,
  confirmation_code: 'OSW41',
  pickup_scheduled_at: '2026-10-16T18:00:00.000Z',
  order_items: [{ product_id: 1000, size: '1 CF Bag', name: "Simon's Gold" }],
  customer_name: 'Private customer',
  customer_email: 'private@example.test',
  phone: 'private phone',
  delivery_address_json: { street: 'Private address' },
  notes: 'Private notes',
  stripe_payment_intent_id: 'private payment intent',
};
const session = {
  id: sessionId,
  mode: 'payment',
  payment_status: 'paid',
  amount_total: 2198,
  metadata: { order_id: '41' },
  customer_details: { email: 'private@example.test' },
};

function fixture({ orderOverride = {}, sessionOverride = {}, itemError = false, fulfillmentFails = false } = {}) {
  const storedOrder = { ...order, ...orderOverride };
  const stripeSession = { ...session, ...sessionOverride };
  const calls = { sessions: [], fulfillments: [], itemReads: 0 };
  const db = {
    from(table) {
      return {
        select() { return this; },
        eq(column, id) {
          assert.equal(id, 41);
          if (table === 'orders') {
            assert.equal(column, 'id');
            return { single: async () => ({ data: storedOrder }) };
          }
          assert.equal(table, 'order_items');
          assert.equal(column, 'order_id');
          calls.itemReads += 1;
          return Promise.resolve({ data: items, error: itemError ? { message: 'fixture failure' } : null });
        },
      };
    },
  };
  return {
    calls,
    confirm: (input = {}) => confirmPaidCheckout({
      db,
      orderId: 41,
      sessionId,
      retrieveSession: async (id) => {
        calls.sessions.push(id);
        return stripeSession;
      },
      fulfillOrder: async (id, verifiedSession) => {
        calls.fulfillments.push({ id, verifiedSession });
        return fulfillmentFails ? { ok: false } : { ok: true, order: storedOrder, items };
      },
      ...input,
    }),
  };
}

test('a webhook-paid order returns authoritative purchase data without browser storage or another fulfillment', async () => {
  const f = fixture();
  const { payload } = await f.confirm();
  assert.equal(payload.ok, true);
  assert.equal(payload.alreadyPaid, true);
  assert.equal(payload.value, 21.98);
  assert.equal(payload.order.id, 41);
  assert.equal(payload.items[0].product_name, "Simon's Gold");
  assert.deepEqual(payload.items[0], { ...items[0], product_name: "Simon's Gold" });
  assert.deepEqual(f.calls.sessions, [sessionId]);
  assert.equal(f.calls.fulfillments.length, 0);
  assert.equal(f.calls.itemReads, 1);
});

test('paid order numbers alone never expose purchase data or retrieve the stored Stripe session', async () => {
  for (const missing of [undefined, '', null]) {
    const f = fixture();
    await assert.rejects(f.confirm({ sessionId: missing }), (error) => error.status === 400);
    assert.equal(f.calls.sessions.length, 0);
    assert.equal(f.calls.itemReads, 0);
    assert.equal(f.calls.fulfillments.length, 0);
  }
});

test('a different stored checkout session is rejected before retrieval or fulfillment', async () => {
  const f = fixture({ orderOverride: { payment_status: 'pending' } });
  await assert.rejects(f.confirm({ sessionId: 'cs_live_otherOrder' }), (error) => error.status === 403);
  assert.equal(f.calls.sessions.length, 0);
  assert.equal(f.calls.fulfillments.length, 0);
  assert.equal(f.calls.itemReads, 0);
});

test('metadata must bind the returned Stripe session to this exact order even if the stored session was not saved', async () => {
  for (const sessionOverride of [
    { metadata: { order_id: '42' } },
    { metadata: {} },
    { id: 'cs_live_otherOrder' },
    { mode: 'subscription' },
  ]) {
    const f = fixture({ orderOverride: { stripe_checkout_session_id: null }, sessionOverride });
    await assert.rejects(f.confirm(), (error) => error.status === 403);
    assert.equal(f.calls.itemReads, 0);
    assert.equal(f.calls.fulfillments.length, 0);
  }
});

test('unpaid Stripe sessions do not expose data or fulfill orders', async () => {
  const f = fixture({ sessionOverride: { payment_status: 'unpaid' } });
  const { payload } = await f.confirm();
  assert.deepEqual(payload, { ok: false, pending: true, paymentStatus: 'unpaid' });
  assert.equal(f.calls.itemReads, 0);
  assert.equal(f.calls.fulfillments.length, 0);
});

test('a paid session can recover delayed fulfillment and returns the same minimal summary', async () => {
  const f = fixture({ orderOverride: { payment_status: 'pending' } });
  const { payload } = await f.confirm();
  assert.equal(f.calls.fulfillments.length, 1);
  assert.equal(f.calls.fulfillments[0].id, 41);
  assert.equal(f.calls.fulfillments[0].verifiedSession.id, sessionId);
  assert.equal(payload.value, 21.98);
  assert.equal(payload.items.length, 1);
  assert.doesNotMatch(JSON.stringify(payload), /Private|private@example|phone|notes|stripe_payment|customer_details/);
  assert.deepEqual(Object.keys(payload.order).sort(), [
    'confirmation_code', 'fulfillment_type', 'id', 'location_id', 'pickup_scheduled_at',
  ]);
});

test('already-paid summaries also exclude customer identity, address, and Stripe credentials', async () => {
  const { payload } = await fixture().confirm();
  assert.doesNotMatch(JSON.stringify(payload), /Private|private@example|phone|notes|stripe_payment|customer_details|cs_live/);
});

test('free orders keep a minimal acknowledgment without turning line-item prices into paid revenue', async () => {
  const f = fixture({ orderOverride: { stripe_checkout_session_id: null, total_amount: 0 } });
  const result = await f.confirm({ sessionId: undefined });
  assert.deepEqual(result, { payload: { ok: true, alreadyPaid: true }, session: null });
  assert.equal(f.calls.sessions.length, 0);
  assert.equal(f.calls.itemReads, 0);
});

test('read or fulfillment failures do not report a successful purchase', async () => {
  await assert.rejects(fixture({ itemError: true }).confirm(), /confirmed checkout items/);
  await assert.rejects(fixture({ orderOverride: { payment_status: 'pending' }, fulfillmentFails: true }).confirm(), /confirm order payment/);
  await assert.rejects(fixture({ sessionOverride: { amount_total: null } }).confirm(), /paid amount/);
});

test('invalid order IDs fail before a database or Stripe read', async () => {
  const f = fixture();
  for (const orderId of [undefined, 0, -41, '41junk', 41.5]) {
    await assert.rejects(f.confirm({ orderId }), (error) => error.status === 400);
  }
  assert.equal(f.calls.sessions.length, 0);
});
