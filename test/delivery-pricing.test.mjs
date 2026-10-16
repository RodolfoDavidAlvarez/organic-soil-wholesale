import test from 'node:test';
import assert from 'node:assert/strict';
import { applyDeliveryPriceMinimums, bulkDeliveryPlan, calculateDeliveryCharge, deliveryQuantity } from '../shared/deliveryPricing.js';
const defaults = {
  walking_floor: { min_fee: 400, hourly_rate: 165, capacity_label: 'legacy' },
  hot_shot: { min_fee: 175, hourly_rate: 95 },
  flatbed_moffett: { min_fee: 400, hourly_rate: 150 },
};
const rates = applyDeliveryPriceMinimums(defaults, { walking_floor: { min_fee: 250 } });
const bulk = (quantity, unit = 'per ton', productName = "Simon's Gold") => [{ sizeOption: 'Bulk Pickup', quantity, unit, productName }];

test('old stored settings cannot override approved customer price minimums', () => {
  assert.equal(rates.walking_floor.min_fee, 750);
  assert.equal(rates.walking_floor.hourly_rate, 165);
  assert.equal(rates.dump_truck.min_fee, 375);
  assert.equal(rates.hot_shot.min_fee, 175);
  assert.equal(applyDeliveryPriceMinimums(defaults, { walking_floor: { min_fee: 900 } }).walking_floor.min_fee, 900);
});
test('small bulk uses dump truck; large and multiple loads retain sufficient capacity', () => {
  assert.deepEqual(bulkDeliveryPlan(bulk(6)), { truck: 'dump_truck', loadCount: 1 });
  assert.deepEqual(bulkDeliveryPlan(bulk(24)), { truck: 'walking_floor', loadCount: 1 });
  assert.deepEqual(bulkDeliveryPlan(bulk(25)), { truck: 'walking_floor', loadCount: 2 });
  assert.deepEqual(bulkDeliveryPlan(bulk(15, 'per cu yd', 'PlantPal')), { truck: 'dump_truck', loadCount: 1 });
  assert.equal(bulkDeliveryPlan(bulk(16, 'per cu yd', 'PlantPal')).truck, 'walking_floor');
  assert.equal(bulkDeliveryPlan(bulk(15, 'per cu yd', "Simon's Gold")).truck, 'walking_floor');
  assert.deepEqual(bulkDeliveryPlan(bulk(61, 'per cu yd', 'PlantPal')), { truck: 'walking_floor', loadCount: 2 });
});
test('packaged truckloads are counted as full loads, not as a few yards or tons', () => {
  for (const sizeOption of ['Truckload (~60 cu yd)', 'Truckload (~24 tons)', 'Truckload']) {
    assert.deepEqual(bulkDeliveryPlan([{ sizeOption, quantity: 2, unit: 'per truckload', productName: 'PlantPal' }]), { truck: 'walking_floor', loadCount: 2 });
  }
});
test('do not assume different bulk materials fit one small dump truck', () => {
  assert.deepEqual(bulkDeliveryPlan([...bulk(3), ...bulk(3, 'per ton', "Mikey's Worm Poop")]), { truck: 'walking_floor', loadCount: 2 });
});
test('fees preserve long-distance pricing, extra loads and access surcharge', () => {
  assert.equal(calculateDeliveryCharge({ truckRate: rates.walking_floor, oneWayHours: 0.5 }).costCents, 75000);
  assert.equal(calculateDeliveryCharge({ truckRate: rates.dump_truck, oneWayHours: 0.5 }).costCents, 37500);
  assert.equal(calculateDeliveryCharge({ truckRate: rates.walking_floor, oneWayHours: 0.5, loadCount: 2 }).costCents, 150000);
  assert.equal(calculateDeliveryCharge({ truckRate: rates.walking_floor, oneWayHours: 0.5, roughAccess: true }).costCents, 90000);
  assert.equal(calculateDeliveryCharge({ truckRate: rates.walking_floor, oneWayHours: 5 }).costCents, 173250);
});
test('per-unit delivered rates use actual ordered units and never invent cross-material density', () => {
  assert.deepEqual(deliveryQuantity([{ sizeOption: 'Truckload (~60 cu yd)', quantity: 2, unit: 'per truckload' }]), { amount: 120, unit: 'cu yd' });
  assert.deepEqual(deliveryQuantity(bulk(6)), { amount: 6, unit: 'ton' });
  assert.equal(deliveryQuantity([{ sizeOption: 'Pallet', quantity: 2 }]), null);
  assert.equal(deliveryQuantity([{ sizeOption: 'Truckload', quantity: 1 }]), null);
});

test('checkout requests a fresh review when delivery changes before payment', async () => {
  const { deliveryPriceChanged } = await import('../shared/deliveryPricing.js');
  assert.equal(deliveryPriceChanged({ costCents: 25000 }, { costCents: 75000 }), true);
  assert.equal(deliveryPriceChanged({ costCents: 75000 }, { costCents: 75000 }), false);
  assert.equal(deliveryPriceChanged(null, { costCents: 75000 }), false);
});
