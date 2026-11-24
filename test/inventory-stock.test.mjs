import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { inventoryCheckItems, inventoryKeyForLine, stockForLine, stockKey, stockShortageMessage } from '../shared/inventoryStock.js';
import {
  cardStockBadge,
  cartStockNote,
  primaryBagSizeOption,
  saleCountdownLabel,
  stockLineCopy,
  variantBaselines,
} from '../shared/stockUrgency.js';

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

const duringSale = new Date('2026-11-24T15:39:00-07:00');
const afterSale = new Date('2026-12-01T00:01:00-07:00');

test('primary bag is the size shown before a shopper picks one', () => {
  assert.equal(primaryBagSizeOption(111), '1.5CF Bag');
  assert.equal(primaryBagSizeOption(1001), '9lb Bag');
  assert.equal(primaryBagSizeOption(1000), '1CF Bag');
  assert.equal(primaryBagSizeOption(3000), '2CF Bag');
  assert.equal(primaryBagSizeOption(999), null);
});

test('stock line names the bag and mentions 30% only while that size is on sale', () => {
  const plantpal = { available: 165, provisional: false, baseline: 165 };
  assert.equal(stockLineCopy(plantpal, '1.5CF Bag', duringSale).text, '165 bags of 1.5 cu ft left at 30% off');
  assert.equal(stockLineCopy({ available: 864, provisional: false, baseline: 864 }, '9lb Bag', duringSale).text, '864 bags of 9 lb left at 30% off');
  assert.equal(stockLineCopy(plantpal, '1.5CF Bag', afterSale).text, '165 bags of 1.5 cu ft left');
  assert.equal(stockLineCopy({ available: 5, provisional: false, baseline: 5 }, 'Pallet (30 x 1.5CF)', duringSale).text, 'Only 5 pallets left at 30% off');
  assert.equal(stockLineCopy({ available: 4, provisional: false, baseline: 4 }, 'Tote', duringSale).text, 'Only 4 totes left');
  assert.equal(stockLineCopy(null, '1.5CF Bag', duringSale), null);
});

test('scarcity tiers: selling fast under 25% of the confirmed start, only-n under 10, sold out at 0', () => {
  assert.equal(stockLineCopy({ available: 40, provisional: false, baseline: 165 }, '1.5CF Bag', duringSale).text, 'Selling fast · 40 bags of 1.5 cu ft left at 30% off');
  assert.equal(stockLineCopy({ available: 40, provisional: true, baseline: 165 }, '1.5CF Bag', duringSale).tone, 'ok');
  assert.equal(stockLineCopy({ available: 50, provisional: false, baseline: 165 }, '1.5CF Bag', duringSale).tone, 'ok');
  assert.equal(cardStockBadge({ available: 5, provisional: false }).text, 'Only 5 left');
  assert.equal(cardStockBadge({ available: 165, provisional: false, baseline: 165 }).text, '165 left');
  assert.equal(cardStockBadge({ available: 0, provisional: false }).text, 'Sold out');
  assert.equal(cartStockNote({ available: 165, provisional: false }), '165 left');
  assert.equal(cartStockNote(null), null);
  assert.equal(stockLineCopy({ available: 0, provisional: false, baseline: 165 }, '1.5CF Bag', duringSale).text, 'Sold out');
});

test('sale countdown uses Phoenix end of Nov 30 and hides after the sale', () => {
  assert.equal(saleCountdownLabel(duringSale), 'Sale ends Mon 11/30 · 6d 8h left');
  assert.equal(saleCountdownLabel(afterSale), null);
});

test('variant baseline is the first count, shared across bags and pallets', () => {
  const baselines = variantBaselines(
    [
      { product_id: 111, size_option: '1.5CF Bag', sku_code: 'plantpal-1.5cf-bag', units_per_item: 1 },
      { product_id: 111, size_option: 'Pallet (30 x 1.5CF)', sku_code: 'plantpal-1.5cf-bag', units_per_item: 30 },
    ],
    [
      { sku_code: 'plantpal-1.5cf-bag', on_hand_after: 165, created_at: '2026-11-24T21:55:00Z' },
      { sku_code: 'plantpal-1.5cf-bag', on_hand_after: 100, created_at: '2026-11-25T21:55:00Z' },
    ],
  );
  assert.equal(baselines[stockKey(111, '1.5CF Bag')], 165);
  assert.equal(baselines[stockKey(111, 'Pallet (30 x 1.5CF)')], 5);
});

test('checkout guards stock before charging and the stock endpoint exists', () => {
  const api = readFileSync(new URL('../api/index.js', import.meta.url), 'utf8');
  assert.match(api, /path === '\/api\/inventory\/stock'/);
  assert.match(api, /rpc\('inventory_check_cart'/);
  assert.ok(api.indexOf("rpc('inventory_check_cart'") < api.indexOf("from('orders')\n          .insert(orderData)"));
});
