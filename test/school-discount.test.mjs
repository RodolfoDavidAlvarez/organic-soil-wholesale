import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  SCHOOL_OFFER_ENDS_AT,
  buildSchoolQuoteLine,
  checkoutDiscountNotes,
  fetchSchoolQuote,
  isBaggedProductLine,
  prepareSchoolCheckoutItems,
  readSchoolCheckoutNote,
  reserveSchoolCheckoutQuote,
  resolveDiscountCode,
  schoolCheckoutCharge,
  schoolOfferEnded,
  schoolStripeCouponParams,
} from '../shared/checkoutDiscount.js';
import { redeemSchoolOrder, schoolInternalKey } from '../shared/schoolRedeem.js';

const bag = (price = 8.99, quantity = 2) => ({
  productId: 134,
  name: "Nature's Blanket",
  format: '2CF Bag',
  sizeOption: '2CF Bag',
  unit: 'per bag',
  quantity,
  price,
  unitPrice: price,
  listUnitPrice: price,
  discountPercent: 0,
});

const pallet = () => ({
  productId: 134,
  name: "Nature's Blanket",
  format: 'Pallet (25 x 2CF)',
  sizeOption: 'Pallet (25 x 2CF)',
  unit: 'per pallet',
  quantity: 1,
  price: 179.8,
  unitPrice: 179.8,
  listUnitPrice: 224.75,
  discountPercent: 20,
});

test('TEST stays 100% off in production, the same as main', () => {
  const production = resolveDiscountCode('TEST', { now: '2026-11-18T00:00:00.000Z' });
  assert.equal(production.ok, true);
  assert.equal(production.kind, 'test');
  assert.equal(production.percent, 100);
  assert.equal(resolveDiscountCode('test').code, 'TEST');
  assert.equal(resolveDiscountCode('SAVE10').ok, false);
  assert.equal(resolveDiscountCode('').kind, 'none');
  const client = readFileSync(new URL('../client/src/pages/Checkout.tsx', import.meta.url), 'utf8');
  assert.equal(client.includes('import.meta.env.PROD'), false);
});

test('school codes match the issued pattern and the Phoenix expiry', () => {
  assert.equal(SCHOOL_OFFER_ENDS_AT, '2027-05-31T23:59:59-07:00');
  assert.equal(schoolOfferEnded('2027-05-31T23:59:59-07:00'), false);
  assert.equal(schoolOfferEnded('2027-06-01T06:59:59.000Z'), false);
  assert.equal(schoolOfferEnded('2027-06-01T07:00:00.000Z'), true);
  const open = resolveDiscountCode('school30-ab2c', { now: '2027-05-31T18:00:00.000Z' });
  assert.equal(open.ok, true);
  assert.equal(open.code, 'SCHOOL30-AB2C');
  assert.equal(resolveDiscountCode('SCHOOL30-AB12').ok, false);
  assert.equal(resolveDiscountCode('SCHOOL30-PHOENIX').ok, false);
  assert.equal(resolveDiscountCode('SCHOOL30-').ok, false);
  const closed = resolveDiscountCode('SCHOOL30-AB2C', { now: '2027-06-01T07:00:00.000Z' });
  assert.equal(closed.ok, false);
});

test('quote lines keep the sale price in cents and send the pallet list price', () => {
  const bagLine = buildSchoolQuoteLine(bag(15.99, 1));
  assert.equal(bagLine.unit_price, 1599);
  assert.equal(bagLine.compare_at_cents, undefined);
  assert.equal(bagLine.discount_percent, undefined);
  assert.equal(bagLine.quantity_type, 'bag');
  assert.equal(1599 - Math.round((1599 * 70) / 100), 480);

  const palletLine = buildSchoolQuoteLine(pallet());
  assert.equal(palletLine.unit_price, 17980);
  assert.equal(palletLine.compare_at_cents, 22475);
  assert.equal(palletLine.discount_percent, 20);
  assert.notEqual(palletLine.unit_price, Math.round(17980 * 0.7));
  const target = Math.round((22475 * 70) / 100);
  assert.equal(17980 - target, 2247);

  const soilCraft = buildSchoolQuoteLine({
    productId: 137,
    format: 'Pallet (30 x 1.5CF)',
    unit: 'per pallet',
    quantity: 1,
    price: 383.76,
    listUnitPrice: 479.7,
    discountPercent: 20,
  });
  assert.equal(soilCraft.unit_price, 38376);
  assert.equal(soilCraft.compare_at_cents, 47970);
  assert.equal(38376 - Math.round((47970 * 70) / 100), 4797);

  const truck = {
    productId: 134,
    format: 'Truckload (22 pallets)',
    unit: 'per truckload',
    quantity: 1,
    price: 2224.72,
    listUnitPrice: 2224.72,
    discountPercent: 0,
  };
  assert.equal(isBaggedProductLine(truck), false);
  assert.equal(buildSchoolQuoteLine(truck).quantity_type, 'truckload');
  assert.equal(buildSchoolQuoteLine({
    productId: 4100,
    format: 'Garden bundle',
    quantity: 1,
    price: 49,
  }).size_category, 'bundle');
  assert.equal(isBaggedProductLine({ format: 'Bulk Pickup', unit: 'per cu yd', quantity: 3, productId: 3000 }), false);
});

test('quote uses the verification service and does not price the cart locally', async () => {
  const calls = [];
  const quote = await fetchSchoolQuote({
    code: 'SCHOOL30-AB2C',
    contactEmail: 'Ada@School.Example',
    items: [bag(15.99, 1), pallet()],
  }, {
    env: { SCHOOL_VERIFICATION_API_BASE: 'https://quotes.test' },
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return {
        ok: true,
        status: 200,
        json: async () => ({ valid: true, discount_cents: 480 + 2247 }),
      };
    },
  });
  assert.equal(quote.ok, true);
  assert.equal(quote.discountCents, 2727);
  assert.equal(calls[0].url, 'https://quotes.test/api/school-verifications/quote');
  const body = JSON.parse(calls[0].options.body);
  assert.equal(body.contact_email, 'ada@school.example');
  assert.equal(Object.hasOwn(body, 'order_reference'), false);
  assert.equal(body.line_items[1].unit_price, 17980);
  assert.equal(body.line_items[1].compare_at_cents, 22475);
  assert.equal(Object.hasOwn(calls[0].options.headers, 'x-internal-key'), false);
  const notes = checkoutDiscountNotes({ ok: true, kind: 'school', code: 'SCHOOL30-AB2C' }, quote);
  const saved = readSchoolCheckoutNote(notes.join('\n'));
  assert.equal(saved.discountCents, 2727);
  assert.equal(saved.lineItems[0].unit_price, 1599);
});

test('redeem sends the internal key only from the server', async () => {
  const calls = [];
  const result = await redeemSchoolOrder({
    code: 'SCHOOL30-AB2C',
    email: 'ada@school.example',
    orderReference: 'osw-44',
    discountCents: 480,
    lineItems: [buildSchoolQuoteLine(bag(15.99, 1))],
  }, {
    env: { MOS_LEAD_INGEST_SECRET: 'test-only-key', SCHOOL_VERIFICATION_API_BASE: 'https://quotes.test' },
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return { ok: true, status: 200, json: async () => ({ redeemed: true }) };
    },
  });
  assert.equal(result.ok, true);
  assert.equal(calls[0].url, 'https://quotes.test/api/school-verifications/redeem');
  assert.equal(calls[0].options.headers['x-internal-key'], 'test-only-key');
  const body = JSON.parse(calls[0].options.body);
  assert.equal(body.order_reference, 'osw-44');
  assert.equal(body.discount_cents, 480);
  const client = readFileSync(new URL('../client/src/pages/Checkout.tsx', import.meta.url), 'utf8');
  assert.equal(client.includes('x-internal-key'), false);
  assert.equal(client.includes('MOS_LEAD_INGEST_SECRET'), false);
  assert.equal(client.includes('* 0.7'), false);
  assert.equal(client.includes('* 0.70'), false);
});

test('a school quote cannot exceed the catalog sale, and the browser price is ignored', async () => {
  const priced = prepareSchoolCheckoutItems([{
    productId: 137,
    format: '1.5CF Bag',
    quantity: 1,
    price: 0.01,
    unitPrice: 0.01,
  }]);
  assert.equal(priced[0].price, 15.99);
  assert.equal(priced[0].unitPrice, 15.99);
  assert.throws(
    () => prepareSchoolCheckoutItems([{ productId: 999001, format: 'Bag', quantity: 1, price: 0.01 }]),
    (error) => error.status === 400,
  );

  const quote = await fetchSchoolQuote({
    code: 'SCHOOL30-AB2C',
    contactEmail: 'ada@school.example',
    items: priced,
  }, {
    env: { SCHOOL_VERIFICATION_API_BASE: 'https://quotes.test' },
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ({ valid: true, discount_cents: 1599 }),
    }),
  });
  assert.equal(quote.ok, false);
  assert.equal(quote.status, 400);
});

test('the Stripe school coupon is one amount, single use, and expires with the offer', () => {
  const now = Date.parse('2026-11-18T00:00:00.000Z');
  const params = schoolStripeCouponParams(480, now);
  assert.equal(params.amount_off, 480);
  assert.equal(params.currency, 'usd');
  assert.equal(params.duration, 'once');
  assert.equal(params.max_redemptions, 1);
  assert.equal(params.redeem_by, Math.floor(Date.parse(SCHOOL_OFFER_ENDS_AT) / 1000));
  assert.equal(params.name, 'School rate');
  assert.equal(params.metadata.purpose, 'school_rate');
  assert.equal(Object.hasOwn(params, 'percent_off'), false);
  assert.throws(() => schoolStripeCouponParams(0, now), (error) => error.status === 400);
  assert.throws(
    () => schoolStripeCouponParams(480, Date.parse('2027-06-01T07:00:00.000Z')),
    (error) => error.status === 400,
  );

  const hold = schoolCheckoutCharge({ order_id: '9' }, { metadata: { order_id: '9' } });
  assert.equal(hold.metadata.school_hold, '1');
  assert.equal(hold.payment_intent_data.capture_method, 'manual');
  assert.equal(hold.payment_intent_data.metadata.order_id, '9');
  assert.equal(hold.payment_intent_data.metadata.school_hold, '1');
});

test('the order quote holds SCHOOL30 for osw-{id} and a second checkout is refused', async () => {
  const calls = [];
  const quote = {
    ok: true,
    code: 'SCHOOL30-AB2C',
    email: 'ada@school.example',
    discountCents: 480,
  };
  const held = await reserveSchoolCheckoutQuote(quote, [bag(15.99, 1)], 41, {
    env: { SCHOOL_VERIFICATION_API_BASE: 'https://quotes.test' },
    fetchImpl: async (url, options) => {
      calls.push(JSON.parse(options.body));
      return {
        ok: true,
        status: 200,
        json: async () => ({
          valid: true,
          discount_cents: 480,
          reserved_until: '2026-11-19T00:00:00.000Z',
        }),
      };
    },
  });
  assert.equal(held.ok, true);
  assert.equal(held.orderReference, 'osw-41');
  assert.equal(calls[0].order_reference, 'osw-41');
  assert.equal(calls[0].line_items[0].unit_price, 1599);

  const refused = await reserveSchoolCheckoutQuote(quote, [bag(15.99, 1)], 42, {
    env: { SCHOOL_VERIFICATION_API_BASE: 'https://quotes.test' },
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        valid: false,
        code: 'code_held',
        error: 'This school code is already in another checkout. It can be used on one order.',
      }),
    }),
  });
  assert.equal(refused.ok, false);
  assert.equal(refused.status, 400);
  assert.match(refused.error, /another checkout/);

  const notReady = await fetchSchoolQuote({
    code: 'SCHOOL30-AB2C',
    contactEmail: 'ada@school.example',
    items: [bag(15.99, 1)],
    orderReference: 'osw-43',
  }, {
    env: { SCHOOL_VERIFICATION_API_BASE: 'https://quotes.test' },
    fetchImpl: async () => ({
      ok: false,
      status: 503,
      json: async () => ({ error: 'School discounts are not available yet.' }),
    }),
  });
  assert.equal(notReady.ok, false);
  assert.equal(notReady.status, 503);
  assert.equal(notReady.error, 'School discounts are not available yet.');
});

test('manual capture is only attached to a school checkout, and TEST stays a normal free order', () => {
  const api = readFileSync(new URL('../api/index.js', import.meta.url), 'utf8');
  const express = readFileSync(new URL('../server/routes/checkout.ts', import.meta.url), 'utf8');
  for (const source of [api, express]) {
    assert.equal(source.includes('prepareSchoolCheckoutItems'), true);
    const holdCall = source.indexOf('await reserveSchoolCheckoutQuote');
    assert.ok(holdCall > source.indexOf('isFreeOrder'));
    assert.ok(holdCall < source.indexOf('coupons.create'));
    assert.equal(source.includes('schoolCheckoutCharge'), true);
    assert.equal(source.includes("capture_method: 'manual'"), false);
    assert.equal(source.includes("capture_method: 'automatic'"), false);
    assert.match(source, /discountDecision\.kind === 'test' \? 100 : 0/);
  }
  assert.equal(
    schoolInternalKey({
      INTERNAL_TRIGGER_SECRET: 'trigger-secret',
      MOS_LEAD_INGEST_SECRET: 'mos-secret',
      LEAD_INGEST_SECRET: 'lead-secret',
    }),
    'trigger-secret',
  );
  assert.equal(
    schoolInternalKey({ MOS_LEAD_INGEST_SECRET: 'mos-secret', LEAD_INGEST_SECRET: 'lead-secret' }),
    'mos-secret',
  );
});
