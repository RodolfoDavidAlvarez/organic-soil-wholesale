import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolvePickupProductName } from '../shared/pickupProductName.js';

const plantPalSnapshot = {
  product_id: 111,
  name: 'PlantPal Plus',
  size: 'Tote',
  quantity: 1,
  price: 48,
  total: 48,
};

test('paid pickup rows use the name stored on the order, not the products join', () => {
  const relational = {
    product_id: 111,
    size_option: 'Tote',
    quantity: 1,
    unit_price: 48,
    total_price: 48,
  };
  assert.equal(
    resolvePickupProductName(relational, [plantPalSnapshot]),
    'PlantPal Plus',
  );
});

test('the purchased name wins over a different catalog name', () => {
  const relational = {
    product_id: 111,
    size_option: 'Tote',
    products: { name: 'Catalog fallback' },
  };
  assert.equal(
    resolvePickupProductName(relational, [plantPalSnapshot]),
    'PlantPal Plus',
  );
});

test('a line that already carries the purchased name is used as-is', () => {
  assert.equal(
    resolvePickupProductName({ productId: 111, name: 'PlantPal Plus', sizeOption: 'Tote' }),
    'PlantPal Plus',
  );
});

test('matches the right line when product ids differ from array order', () => {
  const snapshots = [
    { product_id: 1000, name: "Simon's Gold", size: '1 CF Bag' },
    plantPalSnapshot,
  ];
  assert.equal(
    resolvePickupProductName({ product_id: 111, size_option: 'Tote' }, snapshots, 0),
    'PlantPal Plus',
  );
});

test('skips the bare word Product when another real name exists', () => {
  assert.equal(
    resolvePickupProductName(
      { product_id: 111, product_name: 'Product', products: { name: 'PlantPal Plus' } },
      [{ product_id: 111, name: ' Product ' }],
    ),
    'PlantPal Plus',
  );
});

test('uses the catalog name only when the order snapshot has no name', () => {
  assert.equal(
    resolvePickupProductName(
      { product_id: 111, products: [{ display_title: 'PlantPal Plus' }] },
      [{ product_id: 111, name: '' }],
    ),
    'PlantPal Plus',
  );
});

test('reads a stringified order snapshot', () => {
  assert.equal(
    resolvePickupProductName(
      { product_id: 111, size_option: 'tote' },
      JSON.stringify([plantPalSnapshot]),
    ),
    'PlantPal Plus',
  );
});

test('does not borrow a different product name when ids do not match', () => {
  assert.equal(
    resolvePickupProductName({ product_id: 999, size_option: 'Tote' }, [plantPalSnapshot], 0),
    'Product #999',
  );
});

test('falls back to the product id, then the bare word only when nothing else exists', () => {
  assert.equal(resolvePickupProductName({ product_id: 111 }, []), 'Product #111');
  assert.equal(resolvePickupProductName({}, []), 'Product');
  assert.equal(resolvePickupProductName({ name: '   ' }, 'not-json'), 'Product');
});

test('paid forwarding paths no longer hardcode product_name Product', () => {
  const api = readFileSync(new URL('../api/index.js', import.meta.url), 'utf8');
  const checkout = readFileSync(new URL('../server/routes/checkout.ts', import.meta.url), 'utf8');
  assert.equal(api.includes("product_name: 'Product'"), false);
  assert.equal(api.includes('product_name: "Product"'), false);
  assert.match(api, /resolvePickupProductName\(item, order\?\.order_items, index\)/);
  assert.equal(checkout.includes("item.products?.name || 'Product'"), false);
  assert.match(checkout, /resolvePickupProductName\(item, purchasedItems, index\)/);
});
