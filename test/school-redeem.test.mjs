import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSchoolQuoteLine, checkoutDiscountNotes } from '../shared/checkoutDiscount.js';
import {
  SCHOOL_CODE_REFUNDED_MESSAGE,
  SCHOOL_CODE_REFUSED_MESSAGE,
  SCHOOL_CODE_USED_MESSAGE,
  settleSchoolCheckout,
} from '../shared/schoolRedeem.js';

const bag = {
  productId: 134,
  name: "Nature's Blanket",
  format: '2CF Bag',
  sizeOption: '2CF Bag',
  unit: 'per bag',
  quantity: 1,
  price: 8.99,
  unitPrice: 8.99,
  listUnitPrice: 8.99,
  discountPercent: 0,
};

function schoolOrder(id, notes = null) {
  const quote = {
    ok: true,
    code: 'SCHOOL30-AB2C',
    email: 'ada@school.example',
    discountCents: 270,
    lineItems: [buildSchoolQuoteLine(bag)],
  };
  return {
    id,
    notes: notes === null
      ? checkoutDiscountNotes({ ok: true, kind: 'school', code: 'SCHOOL30-AB2C' }, quote).join('\n')
      : notes,
    stripe_payment_intent_id: null,
  };
}

function memoryDb() {
  const updates = [];
  return {
    updates,
    from() {
      return {
        update(patch) {
          return {
            eq(column, id) {
              updates.push({ column, id, patch });
              return Promise.resolve({ error: null });
            },
          };
        },
      };
    },
  };
}

function stripeFor(statuses) {
  const state = { ...statuses };
  const calls = [];
  return {
    calls,
    state,
    paymentIntents: {
      async retrieve(id) {
        return { id, status: state[id] };
      },
      async capture(id) {
        calls.push(`capture:${id}`);
        state[id] = 'succeeded';
        return { id, status: 'succeeded' };
      },
      async cancel(id) {
        calls.push(`cancel:${id}`);
        state[id] = 'canceled';
        return { id, status: 'canceled' };
      },
    },
    refunds: {
      async create({ payment_intent: id }) {
        calls.push(`refund:${id}`);
        return { id: `re_${id}` };
      },
    },
  };
}

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

test('one school code captures the first authorization and voids the second', async () => {
  const stripe = stripeFor({ pi_first: 'requires_capture', pi_second: 'requires_capture' });
  const db = memoryDb();
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return calls === 1
      ? jsonResponse(200, { redeemed: true })
      : jsonResponse(409, { error: 'This school code was already used.' });
  };
  const options = { stripe, fetchImpl, env: { INTERNAL_TRIGGER_SECRET: 'trigger-secret' } };
  const first = await settleSchoolCheckout(db, schoolOrder(41), {
    ...options,
    session: { payment_intent: 'pi_first' },
  });
  const second = await settleSchoolCheckout(db, schoolOrder(42), {
    ...options,
    session: { payment_intent: 'pi_second' },
  });

  assert.equal(first.captured, true);
  assert.equal(second.stop, true);
  assert.equal(second.released, 'voided');
  assert.equal(second.error, SCHOOL_CODE_USED_MESSAGE);
  assert.deepEqual(stripe.calls, ['capture:pi_first', 'cancel:pi_second']);
  assert.equal(stripe.state.pi_first, 'succeeded');
  assert.equal(stripe.state.pi_second, 'canceled');
  assert.equal(db.updates[1].patch.payment_status, 'voided');
  assert.equal(db.updates[1].patch.status, 'cancelled');
  assert.match(db.updates[0].patch.notes, /school_redeemed=yes/);
});

test('a verification outage does not capture or void the card', async () => {
  const stripe = stripeFor({ pi_hold: 'requires_capture' });
  const db = memoryDb();
  await assert.rejects(
    () => settleSchoolCheckout(db, schoolOrder(7), {
      stripe,
      session: { payment_intent: 'pi_hold' },
      env: { INTERNAL_TRIGGER_SECRET: 'trigger-secret' },
      fetchImpl: async () => jsonResponse(503, { error: 'unavailable' }),
    }),
    (error) => error.status === 503,
  );
  await assert.rejects(
    () => settleSchoolCheckout(db, schoolOrder(8), {
      stripe,
      session: { payment_intent: 'pi_hold' },
      env: { INTERNAL_TRIGGER_SECRET: 'trigger-secret' },
      fetchImpl: async () => jsonResponse(401, { error: 'unauthorized' }),
    }),
    (error) => error.status === 503,
  );
  assert.deepEqual(stripe.calls, []);
  assert.equal(stripe.state.pi_hold, 'requires_capture');
  assert.equal(db.updates.length, 0);
});

test('a used code voids an authorization and refunds a charge that already captured', async () => {
  const stripe = stripeFor({ pi_auth: 'requires_capture', pi_paid: 'succeeded' });
  const db = memoryDb();
  const fetchImpl = async () => jsonResponse(409, { error: 'used' });
  const env = { INTERNAL_TRIGGER_SECRET: 'trigger-secret' };
  const voided = await settleSchoolCheckout(db, schoolOrder(11), {
    stripe, fetchImpl, env, session: { payment_intent: 'pi_auth' },
  });
  const refunded = await settleSchoolCheckout(db, schoolOrder(12), {
    stripe, fetchImpl, env, session: { payment_intent: 'pi_paid' },
  });
  assert.equal(voided.released, 'voided');
  assert.equal(voided.error, SCHOOL_CODE_USED_MESSAGE);
  assert.equal(refunded.released, 'refunded');
  assert.equal(refunded.error, SCHOOL_CODE_REFUNDED_MESSAGE);
  assert.deepEqual(stripe.calls, ['cancel:pi_auth', 'refund:pi_paid']);
  assert.equal(db.updates[1].patch.payment_status, 'refunded');
});

test('a refused code releases the card with the refusal message', async () => {
  const stripe = stripeFor({ pi_refused: 'requires_capture' });
  const released = await settleSchoolCheckout(memoryDb(), schoolOrder(13), {
    stripe,
    env: { INTERNAL_TRIGGER_SECRET: 'trigger-secret' },
    session: { payment_intent: 'pi_refused' },
    fetchImpl: async () => jsonResponse(400, { error: 'The quoted discount does not match.' }),
  });
  assert.equal(released.released, 'voided');
  assert.equal(released.error, SCHOOL_CODE_REFUSED_MESSAGE);
  assert.deepEqual(stripe.calls, ['cancel:pi_refused']);
});

test('checking again repeats the stored release and does not redeem a second time', async () => {
  const stripe = stripeFor({ pi_refused: 'requires_capture' });
  const db = memoryDb();
  const order = schoolOrder(15);
  const released = await settleSchoolCheckout(db, order, {
    stripe,
    env: { INTERNAL_TRIGGER_SECRET: 'trigger-secret' },
    session: { payment_intent: 'pi_refused' },
    fetchImpl: async () => jsonResponse(400, { error: 'The quoted discount does not match.' }),
  });
  let called = false;
  const again = await settleSchoolCheckout(memoryDb(), { ...order, notes: db.updates[0].patch.notes }, {
    stripe: stripeFor({ pi_refused: 'succeeded' }),
    env: { INTERNAL_TRIGGER_SECRET: 'trigger-secret' },
    session: { payment_intent: 'pi_refused' },
    fetchImpl: async () => {
      called = true;
      return jsonResponse(200, { redeemed: true });
    },
  });
  assert.equal(called, false);
  assert.equal(again.released, 'voided');
  assert.equal(again.error, released.error);
  assert.equal(again.error, SCHOOL_CODE_REFUSED_MESSAGE);
});

test('a saved redemption is not claimed or captured again', async () => {
  const stripe = stripeFor({ pi_done: 'requires_capture' });
  const db = memoryDb();
  let called = false;
  const result = await settleSchoolCheckout(db, schoolOrder(14, 'school_redeemed=yes'), {
    stripe,
    session: { payment_intent: 'pi_done' },
    env: { INTERNAL_TRIGGER_SECRET: 'trigger-secret' },
    fetchImpl: async () => {
      called = true;
      return jsonResponse(200, { redeemed: true });
    },
  });
  assert.equal(result.already, true);
  assert.equal(called, false);
  assert.deepEqual(stripe.calls, []);
  assert.equal(db.updates.length, 0);
});
