import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  SCHOOL_OFFER_ENDS_AT,
  buildSchoolQuoteLine,
  checkoutDiscountNotes,
  fetchSchoolQuote,
  isBaggedProductLine,
  readSchoolCheckoutNote,
  resolveDiscountCode,
  schoolOfferEnded,
  testDiscountAllowed,
} from '../shared/checkoutDiscount.js';
import { redeemSchoolOrder } from '../shared/schoolRedeem.js';

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

test('TEST is refused in production and accepted only outside it', () => {
  assert.equal(testDiscountAllowed({ NODE_ENV: 'production' }), false);
  assert.equal(testDiscountAllowed({ NODE_ENV: 'development', VERCEL_ENV: 'production' }), false);
  assert.equal(testDiscountAllowed({ NODE_ENV: 'development' }), true);
  assert.equal(resolveDiscountCode('TEST', { env: { NODE_ENV: 'production' } }).ok, false);
  assert.equal(resolveDiscountCode('test', { env: { NODE_ENV: 'development' } }).kind, 'test');
  assert.equal(resolveDiscountCode('SAVE10').ok, false);
  assert.equal(resolveDiscountCode('').kind, 'none');
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
