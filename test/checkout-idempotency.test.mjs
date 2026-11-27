import assert from "node:assert/strict";
import test from "node:test";
import { checkoutCartFingerprint, checkoutIdempotencyKey, checkoutKeyMarker } from "../shared/checkoutIdempotency.js";

const base = {
  phone: "(623) 555-0100",
  items: [{ productId: 1001, sizeOption: "9lb Bag", quantity: 6, price: 12.67 }],
  fulfillment: "pickup",
  discountCode: null,
  locationId: 1,
  pickupTime: "2026-11-27T18:04:42.000Z",
  deliveryCents: 0,
};

test("the same cart produces the same Stripe idempotency key", () => {
  const first = checkoutIdempotencyKey(checkoutCartFingerprint(base));
  const second = checkoutIdempotencyKey(checkoutCartFingerprint({
    ...base,
    phone: "6235550100",
    pickupTime: "2026-11-27T18:04:59.000Z",
    items: [{ price: 12.67, quantity: 6, sizeOption: "9lb Bag", productId: 1001 }],
  }));
  assert.equal(first, second);
  assert.match(first, /^osw-checkout-[a-f0-9]{32}$/);
  assert.equal(checkoutKeyMarker(first), `checkout_key:${first}`);
});

test("a different quantity or address is a different checkout", () => {
  const original = checkoutIdempotencyKey(checkoutCartFingerprint(base));
  const moreBags = checkoutIdempotencyKey(checkoutCartFingerprint({
    ...base,
    items: [{ productId: 1001, sizeOption: "9lb Bag", quantity: 7, price: 12.67 }],
  }));
  const delivery = checkoutIdempotencyKey(checkoutCartFingerprint({
    ...base,
    fulfillment: "delivery",
    deliveryZip: "85006",
    deliveryStreet: "1 E Washington St",
    deliveryCents: 12500,
  }));
  assert.notEqual(original, moreBags);
  assert.notEqual(original, delivery);
});
