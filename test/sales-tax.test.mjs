import assert from "node:assert/strict";
import test from "node:test";
import {
  PHOENIX_RETAIL_TPT_RATE,
  chargeCheckoutTotals,
  checkoutSalesTax,
  roundHalfUp,
  salesTaxCents,
  salesTaxLineItem,
  salesTaxPercentLabel,
} from "../shared/salesTax.js";

test("Phoenix retail TPT rate is 9.1%", () => {
  assert.equal(PHOENIX_RETAIL_TPT_RATE, 0.091);
  assert.equal(salesTaxPercentLabel(), "9.1%");
});

test("6 × 9 lb Mikey's bags after 30% off: $76.02 base → $6.92 tax", () => {
  // List $18.10, Black Friday 30% off list = $12.67, × 6 = $76.02.
  const charge = chargeCheckoutTotals({
    items: [{ price: 12.67, quantity: 6 }],
    deliveryCents: 0,
    discountPercent: 0,
  });
  assert.equal(charge.productCents, 7602);
  assert.equal(charge.taxableCents, 7602);
  assert.equal(charge.taxCents, 692);
  assert.equal(charge.totalCents, 8294);
  assert.equal(charge.taxDollars, 6.92);
  assert.equal(charge.totalDollars, 82.94);
  assert.equal(charge.isFreeOrder, false);
});

test("rounds half up once on the whole tax, in integer cents", () => {
  // 500¢ × 0.091 = 45.5¢ → 46¢
  assert.equal(salesTaxCents(500), 46);
  assert.equal(roundHalfUp(45.5), 46);
  assert.equal(roundHalfUp(45.4), 45);
  // 1¢ × 0.091 = 0.091 → 0¢. Not a per-line accumulation.
  assert.equal(salesTaxCents(1), 0);
  assert.equal(checkoutSalesTax({ productCents: 1, deliveryCents: 1 }).taxCents, 0);
});

test("delivery is in the tax base, matching the sister sales contract", () => {
  const quoted = checkoutSalesTax({
    productCents: 7602,
    discountCents: 0,
    deliveryCents: 2500,
  });
  assert.equal(quoted.taxableCents, 10102);
  assert.equal(quoted.taxCents, salesTaxCents(10102));
  assert.equal(quoted.totalCents, 10102 + quoted.taxCents);
});

test("order discount reduces the base before the single tax rounding", () => {
  const quoted = checkoutSalesTax({
    productCents: 10000,
    discountCents: 1000,
    deliveryCents: 2000,
  });
  assert.equal(quoted.taxableCents, 11000);
  assert.equal(quoted.taxCents, 1001);
});

test("100% TEST code still zeros the order, including tax", () => {
  const charge = chargeCheckoutTotals({
    items: [{ price: 12.67, quantity: 6 }],
    deliveryCents: 4500,
    discountPercent: 100,
  });
  assert.equal(charge.taxableCents, 0);
  assert.equal(charge.taxCents, 0);
  assert.equal(charge.totalCents, 0);
  assert.equal(charge.isFreeOrder, true);
  assert.equal(salesTaxLineItem(charge.taxCents), null);
});

test("Stripe tax line is the server-computed cents, not a client amount", () => {
  const line = salesTaxLineItem(692);
  assert.equal(line.price_data.unit_amount, 692);
  assert.equal(line.price_data.product_data.name, "Sales tax (9.1%)");
  assert.equal(line.quantity, 1);
});
