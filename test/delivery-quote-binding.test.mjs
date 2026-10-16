import test from 'node:test';
import assert from 'node:assert/strict';
import { deliveryQuoteKey, currentDeliveryQuote } from '../shared/deliveryQuoteBinding.js';

const request = {
  items: [{ productName: "Simon's Gold", sizeOption: 'Pallet (50 x 1CF)', quantity: 22, unit: 'pallet' }],
  zip: '85009', roughAccess: false, semiAccess: true,
};
const quote = { costDollars: 500, originYard: 'congress' };
const binding = { key: deliveryQuoteKey(request), quote };

test('the reviewed quote is usable only for the same load and delivery options', () => {
  assert.equal(currentDeliveryQuote(binding, deliveryQuoteKey(request)), quote);
  assert.equal(currentDeliveryQuote(null, deliveryQuoteKey(request)), null);
  assert.equal(currentDeliveryQuote({ quote }, deliveryQuoteKey(request)), null);
});

test('crossing a truck capacity with another pallet invalidates the old price', () => {
  const changed = { ...request, items: [{ ...request.items[0], quantity: 23 }] };
  assert.equal(currentDeliveryQuote(binding, deliveryQuoteKey(changed)), null);
});

test('adding, removing, or changing product format invalidates the old price', () => {
  for (const items of [
    [],
    [...request.items, { productName: 'Mulch', sizeOption: 'Tote', quantity: 1 }],
    [{ ...request.items[0], sizeOption: 'Truckload (~24 tons)' }],
  ]) assert.equal(currentDeliveryQuote(binding, deliveryQuoteKey({ ...request, items })), null);
});

test('ZIP and site access changes require their own quote', () => {
  for (const change of [{ zip: '85331' }, { roughAccess: true }, { semiAccess: false }]) {
    assert.equal(currentDeliveryQuote(binding, deliveryQuoteKey({ ...request, ...change })), null);
  }
});

test('a delayed old response cannot replace a quote for the current load', () => {
  const changed = { ...request, items: [{ ...request.items[0], quantity: 23 }] };
  const key = deliveryQuoteKey(changed);
  assert.equal(currentDeliveryQuote(binding, key), null);
  const newQuote = { costDollars: 1000, originYard: 'congress' };
  assert.equal(currentDeliveryQuote({ key, quote: newQuote }, key), newQuote);
});

test('reordering the same cart or trimming ZIP whitespace preserves a valid quote', () => {
  const items = [...request.items, { productName: 'Mulch', sizeOption: 'Tote', quantity: 1 }];
  assert.equal(deliveryQuoteKey({ ...request, items }), deliveryQuoteKey({ ...request, items: items.toReversed(), zip: ' 85009 ' }));
});
