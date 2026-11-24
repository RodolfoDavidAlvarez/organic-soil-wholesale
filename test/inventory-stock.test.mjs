import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { inventoryCheckItems, inventoryKeyForLine, stockForLine, stockKey, stockShortageMessage } from '../shared/inventoryStock.js';

test('cart labels map to the canonical sizes the inventory map uses', () => {
  assert.deepEqual(inventoryKeyForLine({ productId: 111, format: 'Pallet of 1.5 cu ft Bags' }), { productId: 111, sizeOption: 'Pallet (30 x 1.5CF)' });
  assert.deepEqual(inventoryKeyForLine({ productId: 1001, format: 'Pallet of 9 lb Bags' }), { productId: 1001, sizeOption: 'Pallet (144 x 9lb)' });
  assert.deepEqual(inventoryKeyForLine({ productId: 1000, format: 'Super Sack (2.2 cu yd)' }), { productId: 1000, sizeOption: 'Tote' });
  assert.deepEqual(inventoryKeyForLine({ productId: 4101, format: '16-bag Phoenix pickup bundle' }), { productId: 4101, sizeOption: '16-bag Phoenix pickup bundle' });
});

test('check payload skips quote lines and zero quantities', () => {
  const items = inventoryCheckItems([
    { productId: 111, format: '1.5CF Bag', quantity: 3 },
    { productId: 111, format: 'Tote', quantity: 0 },
    { productId: 1000, format: '1CF Bag', quantity: 2, mode: 'quote' },
  ]);
  assert.deepEqual(items, [{ product_id: 111, size_option: '1.5CF Bag', quantity: 3 }]);
});

test('stock lookup and shortage copy', () => {
  const map = { [stockKey(111, 'Pallet (30 x 1.5CF)')]: { available: 5, provisional: true } };
  assert.equal(stockForLine(map, { productId: 111, format: 'Pallet of 1.5 cu ft Bags' }).available, 5);
  assert.equal(stockForLine(map, { productId: 111, format: 'Bulk Pickup' }), null);
  assert.match(stockShortageMessage([{ label: 'PlantPal Plus 1.5 cu ft bag', on_hand: 165 }]), /165 left/);
});

test('checkout guards stock before charging and the stock endpoint exists', () => {
  const api = readFileSync(new URL('../api/index.js', import.meta.url), 'utf8');
  assert.match(api, /path === '\/api\/inventory\/stock'/);
  assert.match(api, /rpc\('inventory_check_cart'/);
  assert.ok(api.indexOf("rpc('inventory_check_cart'") < api.indexOf("from('orders')\n          .insert(orderData)"));
});
