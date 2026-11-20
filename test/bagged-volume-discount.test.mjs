import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GROUP_CODE_RULES,
  MAX_CUSTOMER_DISCOUNT_PERCENT,
  baggedVolumeHint,
  baggedVolumeQuote,
  baggedVolumeSavingsLabel,
  chargeOrderDiscounts,
  chooseSingleDiscount,
  isRetailBagLine,
} from '../shared/baggedVolumeDiscount.js';

const bag = (quantity, unitPrice = 10.99) => ({
  productId: 111,
  format: '1.5CF Bag',
  unit: 'per bag',
  quantity,
  unitPrice,
  mode: 'pay',
});

test('bag tiers apply only to retail bags under a pallet', () => {
  assert.equal(baggedVolumeQuote([bag(45)]).percent, 0);
  const ten = baggedVolumeQuote([bag(46)]);
  assert.equal(ten.percent, 10);
  assert.equal(baggedVolumeSavingsLabel(ten.percent), '10% off bags');
  assert.equal(baggedVolumeHint(ten, (n) => `$${n.toFixed(2)}`), `Add $${(ten.next.remainingCents / 100).toFixed(2)} for 20% off bags.`);
  assert.equal(ten.amountCents, Math.round(ten.subtotalCents * 0.1));
  const twenty = baggedVolumeQuote([bag(137)]);
  assert.equal(twenty.percent, 20);
  assert.equal(twenty.next, null);
});

test('pallets, totes, bundles, and bulk do not count and a pallet blocks the tier', () => {
  const tote = { productId: 111, format: 'Tote', unit: 'per tote', quantity: 2, unitPrice: 247.28, mode: 'pay' };
  const pallet = { productId: 111, format: 'Pallet (30 x 1.5CF)', unit: 'per pallet', quantity: 1, unitPrice: 263.76, mode: 'pay' };
  const bundle = { productId: 4100, format: 'Garden Refresh', quantity: 1, unitPrice: 99, mode: 'pay' };
  const bulk = { productId: 111, format: 'Bulk Pickup', unit: 'per cu yd', quantity: 4, unitPrice: 80, mode: 'pay' };
  assert.equal(isRetailBagLine(tote), false);
  assert.equal(isRetailBagLine(pallet), false);
  assert.equal(isRetailBagLine(bundle), false);
  assert.equal(baggedVolumeQuote([bag(46), tote, bundle, bulk]).subtotalCents, baggedVolumeQuote([bag(46)]).subtotalCents);
  assert.equal(baggedVolumeQuote([bag(137), pallet]).amountCents, 0);
  assert.equal(baggedVolumeQuote([bag(10), { productId: 134, format: 'Truckload (22 pallets)', quantity: 1, unitPrice: 2224.72 }]).amountCents, 0);
});

test('volume and a group code never both apply, and the larger savings wins', () => {
  const bags = [bag(46)];
  const volumeCents = baggedVolumeQuote(bags).amountCents;
  const schoolWins = chargeOrderDiscounts({ items: bags, discountKind: 'school', schoolDiscountCents: volumeCents + 1 });
  assert.equal(schoolWins.choice.winner, 'group');
  assert.equal(schoolWins.choice.volumeCents, 0);
  const volumeWins = chargeOrderDiscounts({ items: bags, discountKind: 'school', schoolDiscountCents: volumeCents - 1 });
  assert.equal(volumeWins.choice.winner, 'volume');
  assert.equal(volumeWins.choice.groupCents, 0);
  assert.equal(chooseSingleDiscount({ volumeCents: 100, groupCents: 100, groupKind: 'school' }).winner, 'group');
  assert.deepEqual(chooseSingleDiscount({ volumeCents: 400, groupCents: 900, groupKind: 'test' }), {
    winner: 'test', volumeCents: 0, groupCents: 0,
  });
  assert.equal(chooseSingleDiscount({ volumeCents: 4000, groupCents: 5000, groupKind: 'reseller' }).volumeCents, 0);
});

test('unverified group rates stay unpaid and stay at or under 50 percent', () => {
  for (const rule of GROUP_CODE_RULES) {
    assert.ok(rule.percent <= MAX_CUSTOMER_DISCOUNT_PERCENT);
    assert.ok(rule.proof);
    if (rule.id !== 'school') assert.equal(rule.payable, false);
  }
  assert.equal(GROUP_CODE_RULES.find((rule) => rule.id === 'school').payable, true);
});
