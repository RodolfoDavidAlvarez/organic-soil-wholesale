import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { normalizeV5CartItem } from '../shared/oswPricing.js';
import {
  BLACK_FRIDAY_PROMO,
  applyBlackFridayPrices,
  blackFridayQuote,
  isBlackFridayEligibleLine,
  isBlackFridaySaleActive,
  isFinalBlackFridayDay,
} from '../shared/blackFridayPromo.js';

const IN = new Date('2026-11-27T10:00:00-07:00');
const line = (productId, format, quantity) => normalizeV5CartItem({ productId, format, sizeOption: format, quantity, mode: 'pay' });

test('window: live from Nov 24 through the end of Mon Nov 30 Phoenix, Sunday included', () => {
  assert.equal(BLACK_FRIDAY_PROMO.percent, 30);
  assert.equal(isBlackFridaySaleActive(new Date('2026-11-23T23:59:59-07:00')), false);
  assert.equal(isBlackFridaySaleActive(new Date('2026-11-24T00:00:00-07:00')), true);
  assert.equal(isBlackFridaySaleActive(new Date('2026-11-29T12:00:00-07:00')), true);
  assert.equal(isBlackFridaySaleActive(new Date('2026-11-30T23:59:59-07:00')), true);
  assert.equal(isBlackFridaySaleActive(new Date('2026-12-01T00:00:00-07:00')), false);
  assert.equal(isBlackFridaySaleActive(IN, { ...BLACK_FRIDAY_PROMO, enabled: false }), false);
  assert.equal(isFinalBlackFridayDay(new Date('2026-11-30T09:00:00-07:00')), true);
  assert.equal(isFinalBlackFridayDay(new Date('2026-11-29T09:00:00-07:00')), false);
});

test('eligible: bags and pallets only; never bulk, totes, truckloads, bottles, bundles, gift cards', () => {
  assert.equal(isBlackFridayEligibleLine(line(1001, '9lb Bag', 1)), true);
  assert.equal(isBlackFridayEligibleLine(line(137, 'Pallet (30 x 1.5CF)', 1)), true);
  assert.equal(isBlackFridayEligibleLine(line(1000, 'Tote', 1)), false);
  assert.equal(isBlackFridayEligibleLine(line(1000, 'Bulk Pickup', 1)), false);
  assert.equal(isBlackFridayEligibleLine(line(1000, 'Truckload (~24 tons)', 1)), false);
  assert.equal(isBlackFridayEligibleLine(line(1034, '32 oz Bottle', 1)), false);
  assert.equal(isBlackFridayEligibleLine({ productId: 4100, format: 'Garden bundle', quantity: 1, price: 99 }), false);
  assert.equal(isBlackFridayEligibleLine({ name: 'Gift Card', format: '$100 bag gift card', quantity: 1, price: 80 }), false);
  assert.equal(isBlackFridayEligibleLine({ ...line(1001, '9lb Bag', 1), mode: 'quote' }), false);
});

test('pallet sale price is 30% off list, replacing the 20% pallet price', () => {
  const q = blackFridayQuote({ items: [line(137, 'Pallet (30 x 1.5CF)', 1)], now: IN });
  assert.equal(q.applies, true);
  assert.equal(q.saleCents, 33579);
  assert.equal(q.currentCents, 38376);
  const [priced] = applyBlackFridayPrices(q);
  assert.equal(priced.price, 335.79);
  assert.equal(priced.listUnitPrice, 479.7);
  assert.equal(priced.discountPercent, 30);
});

test('single best discount: an equal or larger existing discount is kept', () => {
  const bags = [line(1001, '9lb Bag', 10)]; // $181.00, sale $126.70 (saves $54.30)
  const tie = blackFridayQuote({ items: bags, existingOffCents: 5430, now: IN });
  assert.equal(tie.applies, false, 'tie keeps the existing discount (e.g. a school code)');
  const bigger = blackFridayQuote({ items: bags, existingOffCents: 6000, now: IN });
  assert.equal(bigger.applies, false);
  assert.equal(applyBlackFridayPrices(bigger), null);
  const smaller = blackFridayQuote({ items: bags, existingOffCents: 3620, now: IN }); // 20% bag tier
  assert.equal(smaller.applies, true);
  assert.equal(smaller.extraSavingsCents, 1810); // $144.80 with the 20% tier vs $126.70 on sale
});

test('mixed cart: only eligible lines change; others keep their exact price', () => {
  const items = [line(1000, 'Tote', 1), line(1001, '9lb Bag', 2)];
  const q = blackFridayQuote({ items, now: IN });
  const priced = applyBlackFridayPrices(q);
  assert.equal(priced[0], items[0], 'tote object untouched');
  assert.equal(priced[1].price, 12.67);
  assert.equal(q.saleCents, 14900 + 1267 * 2);
});

test('outside the window nothing changes', () => {
  const q = blackFridayQuote({ items: [line(1001, '9lb Bag', 1)], now: new Date('2026-12-01T08:00:00-07:00') });
  assert.equal(q.active, false);
  assert.equal(q.applies, false);
});

test('server, dev server, cart and checkout all use the same shared quote', async () => {
  const files = {
    'api/index.js': /blackFridayQuote\(\{ items: canonicalItems, existingOffCents \}\)/,
    'server/routes/checkout.ts': /blackFridayQuote\(\{ items: canonicalItems, existingOffCents \}\)/,
    'client/src/pages/Checkout.tsx': /blackFridayQuote\(\{/,
    'client/src/components/QuoteCartDrawer.tsx': /blackFridayQuote\(\{/,
  };
  for (const [file, pattern] of Object.entries(files)) {
    const source = await readFile(new URL(`../${file}`, import.meta.url), 'utf8');
    assert.match(source, pattern, file);
  }
});

test('banner promises only what checkout does', async () => {
  const source = await readFile(new URL('../client/src/components/layout/BlackFridayBanner.tsx', import.meta.url), 'utf8');
  assert.match(source, /isBlackFridaySaleActive/);
  assert.match(source, /Delivery fees aren&apos;t discounted/);
  assert.match(source, /Doesn&apos;t combine with other discounts/);
  assert.doesNotMatch(source, /Sunday|in stock|open (Sun|Mon)/i);
});
