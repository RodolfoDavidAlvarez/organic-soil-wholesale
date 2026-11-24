// End-to-end check of the PRODUCTION checkout handler (api/index.js) with the
// Black Friday sale. Supabase and Stripe are replaced by in-memory fakes, so
// nothing touches a real database, card, or Stripe account.
//
//   node --test --experimental-test-module-mocks test/black-friday-checkout.e2e.test.mjs
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { slotStartMs } from '../shared/pickupSchedule.js';

// Wed Nov 25 10 AM Phoenix: a real open slot, so pallet/tote tests cannot skip.
const SLOT = new Date(slotStartMs('2026-11-25', 10)).toISOString();

const inserted = [];
const stripeCalls = { sessions: [], coupons: [] };

function builder(table) {
  const state = { table, op: 'select', payload: null };
  const result = () => {
    if (state.op === 'insert' && table === 'orders') {
      const row = Array.isArray(state.payload) ? state.payload[0] : state.payload;
      return { data: { id: 9001, confirmation_code: 'TESTCODE', ...row }, error: null };
    }
    return { data: state.single ? null : [], error: null };
  };
  const api = new Proxy({}, {
    get(_, prop) {
      if (prop === 'then') return (resolve, reject) => Promise.resolve(result()).then(resolve, reject);
      if (prop === 'insert') return (payload) => { state.op = 'insert'; state.payload = payload; inserted.push({ table, payload }); return api; };
      if (prop === 'update' || prop === 'upsert' || prop === 'delete') return () => { state.op = prop; return api; };
      if (prop === 'single' || prop === 'maybeSingle') return () => { state.single = true; return api; };
      return () => api;
    },
  });
  return api;
}

mock.module('@supabase/supabase-js', {
  namedExports: {
    createClient: () => ({
      from: (table) => builder(table),
      rpc: async () => ({ data: null, error: null }),
      storage: { from: () => ({ upload: async () => ({}), getPublicUrl: () => ({ data: {} }) }) },
    }),
  },
});

class FakeStripe {
  static createFetchHttpClient() { return {}; }
  constructor() {
    this.checkout = { sessions: { create: async (params) => { stripeCalls.sessions.push(params); return { id: 'cs_test_fake', url: 'https://checkout.stripe.test/fake' }; } } };
    this.coupons = {
      create: async (params) => { stripeCalls.coupons.push(params); return { id: `coupon_${stripeCalls.coupons.length}` }; },
      del: async () => ({}),
    };
  }
}
mock.module('stripe', { defaultExport: FakeStripe });

process.env.STRIPE_SECRET_KEY = 'sk_test_fake_not_real';
process.env.SUPABASE_URL = 'http://supabase.invalid';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake';
process.env.JWT_SECRET = 'fake';

const { default: handler } = await import('../api/index.js');

async function checkout(items, extra = {}) {
  inserted.length = 0;
  stripeCalls.sessions.length = 0;
  stripeCalls.coupons.length = 0;
  const res = {
    statusCode: 200, headers: {}, body: null,
    setHeader(k, v) { this.headers[k] = v; return this; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    send(body) { this.body = body; return this; },
    end() { return this; },
  };
  await handler({
    method: 'POST',
    url: '/api/checkout/create-session',
    headers: { origin: 'http://localhost:5173', host: 'localhost' },
    query: {},
    body: {
      items,
      customerInfo: { name: 'Fixture Buyer', phone: '6235550100' },
      fulfillmentType: 'pickup',
      pickupMode: 'asap',
      ...extra,
    },
  }, res);
  const order = inserted.find((entry) => entry.table === 'orders')?.payload;
  const session = stripeCalls.sessions[0];
  const stripeTotal = session
    ? session.line_items.reduce((sum, line) => sum + line.price_data.unit_amount * line.quantity, 0)
      - stripeCalls.coupons.reduce((sum, c) => sum + (c.amount_off || 0), 0)
    : null;
  return { res, order, session, stripeTotal };
}

const bag = (productId, format, quantity) => ({ productId, sizeOption: format, format, quantity, price: 0.01 });

test('bags get 30% off regular price; client price is ignored; Stripe and order agree', async () => {
  // Mikey's 9lb bag regular $18.10 -> $12.67. Simon's 1CF bag $14.95 -> $10.47.
  const { res, order, session, stripeTotal } = await checkout([bag(1001, '9lb Bag', 2), bag(1000, '1CF Bag', 1)]);
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  const amounts = session.line_items.map((l) => l.price_data.unit_amount);
  assert.deepEqual(amounts, [1267, 1047]);
  assert.equal(stripeCalls.coupons.length, 0, 'no stacked coupon');
  assert.equal(stripeTotal, 1267 * 2 + 1047);
  assert.equal(order.total, stripeTotal);
  assert.match(order.notes, /Black Friday sale: 30% off list/);
  assert.equal(order.order_items[0].discount_percent, 30);
  assert.equal(order.order_items[0].list_price, 18.1);
});

test('pallet: 30% off list replaces the 20% pallet price (not 20% + 30%)', async () => {
  const { res, session, order } = await checkout([bag(137, 'Pallet (30 x 1.5CF)', 1)], { pickupMode: 'schedule', pickupTime: SLOT });
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  // Soil Craft pallet: list $479.70, normally $383.76 (20%). Sale: $335.79, never $268.63.
  assert.equal(session.line_items[0].price_data.unit_amount, 33579);
  assert.equal(order.total, 33579);
});

test('bulk / tote lines keep their regular price and are never discounted', async () => {
  const { res, session } = await checkout([bag(1000, 'Tote', 1), bag(1001, '9lb Bag', 1)], { pickupMode: 'schedule', pickupTime: SLOT });
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  const [tote, bagLine] = session.line_items.map((l) => l.price_data.unit_amount);
  assert.equal(tote, 14900);
  assert.equal(bagLine, 1267);
});

test('a larger existing discount is kept: full-flatbed totes beat the sale on one bag', async () => {
  // 22 Simon's Gold totes earn the full-flatbed 10% ($327.80 off). The sale would
  // only save $5.43 on the single bag, so the order keeps the flatbed discount.
  const { res, session, order } = await checkout(
    [bag(1000, 'Tote', 22), bag(1001, '9lb Bag', 1)],
    { pickupMode: 'schedule', pickupTime: SLOT, locationId: 2, pickupLocation: 'Congress Plant' },
  );
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  const amounts = session.line_items.map((l) => l.price_data.unit_amount);
  assert.deepEqual(amounts, [13410, 1810]); // flatbed 10% is on the totes only
  assert.doesNotMatch(order.notes, /Black Friday/);
  assert.match(order.notes, /Full flatbed/);
});

test('full-flatbed pallets: sale (70% of list) beats pallet + flatbed (72% of list)', async () => {
  const { res, session, order } = await checkout(
    [bag(137, 'Pallet (30 x 1.5CF)', 22)],
    { pickupMode: 'schedule', pickupTime: SLOT, locationId: 2, pickupLocation: 'Congress Plant' },
  );
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.equal(session.line_items[0].price_data.unit_amount, 33579);
  assert.match(order.notes, /Black Friday/);
  assert.doesNotMatch(order.notes, /Full flatbed/);
});

test('outside the window the sale does not apply', async () => {
  mock.timers.enable({ apis: ['Date'], now: new Date('2026-12-01T00:00:00-07:00') });
  try {
    const { res, session, order } = await checkout([bag(1001, '9lb Bag', 2)]);
    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.equal(session.line_items[0].price_data.unit_amount, 1810);
    assert.doesNotMatch(order.notes || '', /Black Friday/);
  } finally {
    mock.timers.reset();
  }
});

test('TEST code keeps its own 100% path, no sale pricing mixed in', async () => {
  const { res, order } = await checkout([bag(1001, '9lb Bag', 1)], { discountCode: 'TEST' });
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.equal(res.body.free, true);
  assert.doesNotMatch(order.notes || '', /Black Friday/);
});

test('Thanksgiving (Thu Nov 26) pickup is refused by the server', async () => {
  const thanksgiving = new Date(slotStartMs('2026-11-26', 10)).toISOString();
  const { res, session } = await checkout([bag(1001, '9lb Bag', 1)], { pickupMode: 'schedule', pickupTime: thanksgiving });
  assert.equal(res.statusCode, 400);
  assert.match(res.body.error, /closed that day/);
  assert.equal(session, undefined, 'no Stripe session created');
});
