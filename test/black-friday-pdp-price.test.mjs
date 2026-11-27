import assert from "node:assert/strict";
import test from "node:test";
import { retailOfferPrice } from "../shared/blackFridayPromo.js";

const duringSale = new Date("2026-11-27T12:00:00-07:00");
const afterSale = new Date("2026-12-02T12:00:00-07:00");

test("Mikey's 9 lb pallet card uses 30% off list, not the hardcoded 20% price", () => {
  const offer = retailOfferPrice({
    productId: 1001,
    format: "Pallet (144 x 9lb)",
    unitPrice: 2085.12,
    listUnitPrice: 2606.4,
    now: duringSale,
  });
  assert.equal(offer.onSale, true);
  assert.equal(offer.price, 1824.48);
  assert.equal(offer.compareAt, 2606.4);
  assert.equal(offer.badge, "30% off");
  assert.notEqual(offer.price, 2085.12);
});

test("bag cards show the sale price with the regular price to strike", () => {
  const offer = retailOfferPrice({
    productId: 1001,
    format: "9lb Bag",
    unitPrice: 18.1,
    listUnitPrice: 18.1,
    now: duringSale,
  });
  assert.equal(offer.onSale, true);
  assert.equal(offer.price, 12.67);
  assert.equal(offer.compareAt, 18.1);
});

test("Super Sack and truckload stay off the sale", () => {
  const tote = retailOfferPrice({
    productId: 1001,
    format: "Tote",
    unitPrice: 399,
    listUnitPrice: 399,
    now: duringSale,
  });
  const truck = retailOfferPrice({
    productId: 1001,
    format: "Truckload 24 ton walking floor",
    unitPrice: 4800,
    listUnitPrice: 4800,
    now: duringSale,
  });
  assert.equal(tote.onSale, false);
  assert.equal(tote.notOnSale, true);
  assert.equal(tote.price, 399);
  assert.equal(truck.onSale, false);
  assert.equal(truck.notOnSale, true);
});

test("outside the sale window the pallet card keeps the 20% price", () => {
  const offer = retailOfferPrice({
    productId: 1001,
    format: "Pallet (144 x 9lb)",
    unitPrice: 2085.12,
    listUnitPrice: 2606.4,
    now: afterSale,
  });
  assert.equal(offer.active, false);
  assert.equal(offer.onSale, false);
  assert.equal(offer.price, 2085.12);
});
