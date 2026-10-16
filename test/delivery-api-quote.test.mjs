import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import * as pricing from '../shared/deliveryPricing.js';

// Run the production quote implementation with a deterministic distance cache.
// No database, real customer request, payment, or email is involved.
const apiSource = readFileSync(new URL('../api/index.js', import.meta.url), 'utf8');
const quoteSource = apiSource.slice(apiSource.indexOf('    const OSW_YARDS ='), apiSource.indexOf('    // GET /api/address/suggest'));
function calculator({ hours = 0.5, storedRates = { walking_floor: { min_fee: 250 } } } = {}) {
  const sandbox = {
    ...pricing,
    AbortSignal,
    fetch: async () => ({ ok: true, json: async () => ({ places: [{ latitude: '34.16', longitude: '-112.85', 'place name': 'Congress', 'state abbreviation': 'AZ' }] }) }),
    db: { from(table) {
      const chain = { select: () => chain, eq: () => chain, single: async () => ({ data: table === 'sp_settings' ? { value: storedRates } : { miles_one_way: 20, hours_one_way: hours } }) };
      return chain;
    } },
  };
  vm.createContext(sandbox);
  vm.runInContext(`${quoteSource}\nthis.calculate = quoteTrucking;`, sandbox);
  return sandbox.calculate;
}
const call = (calculate, items, roughAccess = false) => calculate({ items, zip: '85332', roughAccess });

test('production API enforces new customer minimums even with old stored rates', async () => {
  const calculate = calculator();
  const semi = await call(calculate, [{ sizeOption: 'Truckload (~60 cu yd)', productName: 'PlantPal', quantity: 1 }]);
  assert.equal(semi.costCents, 75000);
  assert.equal(semi.truck, 'walking_floor');
  assert.equal(semi.pricingVersion, pricing.DELIVERY_PRICING_VERSION);
  assert.equal(semi.breakdown.hourlyRate, undefined);
  assert.equal(semi.breakdown.minFee, undefined);
  const dump = await call(calculate, [{ sizeOption: 'Bulk Pickup', productName: "Simon's Gold", quantity: 6, unit: 'per ton' }]);
  assert.equal(dump.costCents, 37500);
  assert.equal(dump.truck, 'dump_truck');
});
test('production API counts full packages and long-distance/access charges correctly', async () => {
  const items = [{ sizeOption: 'Truckload (~24 tons)', quantity: 2 }];
  assert.equal((await call(calculator(), items)).costCents, 150000);
  assert.equal((await call(calculator(), items, true)).costCents, 180000);
  assert.equal((await call(calculator({ hours: 5 }), items)).costCents, 346500);
});
test('pallet delivery prices remain on their existing vehicle and rate', async () => {
  const quote = await call(calculator(), [{ sizeOption: 'Pallet (50 x 1CF)', quantity: 2 }]);
  assert.equal(quote.truck, 'hot_shot');
  assert.equal(quote.costCents, 17500);
});
