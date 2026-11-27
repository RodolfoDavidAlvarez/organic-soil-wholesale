/**
 * Phoenix, AZ combined retail transaction privilege tax (business code 017).
 *
 * Arizona Department of Revenue, Transaction Privilege and Other Tax Rate Tables
 * effective November 1, 2026 (https://azdor.gov/sites/default/files/document/TPT_RATETABLE_11012026.pdf):
 *   - State retail TPT is 5.6%. Maricopa County (MAR) state+county retail is 6.3%,
 *     so the county excise portion is 0.7%.
 *   - City of Phoenix (region PX, county MAR) Retail Sales 017 is 2.80%.
 *     The single-item portion over $14,338 (code 366) is 2.00% and is not used here.
 * City of Phoenix combined chart, effective January 1, 2026
 * (https://www.phoenix.gov/content/dam/phoenix/financesite/documents/privilege-use-tax/Combined-Tax-Rate-Chart-0126.pdf):
 *   Retail Level 1 = Phoenix 2.8% + State 5.6% + County 0.7% = 9.1%.
 *
 * This pass applies the Phoenix rate to every checkout, including Congress pickup
 * and delivery addresses outside Phoenix. Those locations can differ.
 *
 * Tax base matches RodolfoDavidAlvarez/myorganicsoil.com api/sales-pricing-contract.js:
 *   taxable = max(0, product cents − discount cents + delivery cents)
 *   tax = round half up once (taxable × rate), in integer cents.
 * Delivery stays in the base. Arizona retail TPT is on the seller's gross receipts,
 * and the sister sales contract taxes freight the same way.
 */

/** Combined Phoenix retail TPT. The only rate checkout is allowed to charge. */
export const PHOENIX_RETAIL_TPT_RATE = 0.091;

const RATE_PER_THOUSAND = 91;

export function salesTaxPercentLabel(rate = PHOENIX_RETAIL_TPT_RATE) {
  const percent = Math.round(Number(rate) * 1000) / 10;
  if (!Number.isFinite(percent)) return "0%";
  return Number.isInteger(percent) ? `${percent}%` : `${percent.toFixed(1)}%`;
}

/** Positive half-up. 0.5 rounds away from zero. */
export function roundHalfUp(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.sign(n) * Math.floor(Math.abs(n) + 0.5);
}

/**
 * Integer-cent tax. Uses 91/1000 for the Phoenix rate so 0.5¢ cannot drift
 * through a binary float. Other rates fall back to one half-up rounding.
 */
export function salesTaxCents(taxableCents, rate = PHOENIX_RETAIL_TPT_RATE) {
  const base = Math.max(0, Math.round(Number(taxableCents) || 0));
  if (rate === PHOENIX_RETAIL_TPT_RATE) {
    return Math.floor((base * RATE_PER_THOUSAND + 500) / 1000);
  }
  return Math.max(0, roundHalfUp(base * (Number(rate) || 0)));
}

export function checkoutSalesTax({
  productCents = 0,
  discountCents = 0,
  deliveryCents = 0,
  rate = PHOENIX_RETAIL_TPT_RATE,
} = {}) {
  const product = Math.max(0, Math.round(Number(productCents) || 0));
  const discount = Math.max(0, Math.round(Number(discountCents) || 0));
  const delivery = Math.max(0, Math.round(Number(deliveryCents) || 0));
  const taxableCents = Math.max(0, product - discount + delivery);
  const taxCents = salesTaxCents(taxableCents, rate);
  return {
    productCents: product,
    discountCents: discount,
    deliveryCents: delivery,
    taxableCents,
    taxCents,
    totalCents: taxableCents + taxCents,
    rate,
  };
}

/**
 * Server charge for one checkout. Item prices are already the prices Stripe
 * will list (Black Friday and flatbed rewritten onto the line). School, bag
 * volume, and the 100% TEST code are the discount cents.
 * TEST at 100% discounts products and delivery, so the taxable base is 0
 * and the order stays free.
 */
export function chargeCheckoutTotals({
  items,
  deliveryCents = 0,
  discountPercent = 0,
  schoolDiscountCents = 0,
  volumeDiscountCents = 0,
} = {}) {
  const productCents = (Array.isArray(items) ? items : []).reduce((sum, item) => {
    const unit = Math.round((Number(item?.price) + Number.EPSILON) * 100);
    const qty = Math.max(0, Number(item?.quantity) || 0);
    return sum + (Number.isFinite(unit) && unit > 0 ? unit : 0) * qty;
  }, 0);
  const delivery = Math.max(0, Math.round(Number(deliveryCents) || 0));
  const percent = Number(discountPercent) || 0;
  const school = Math.max(0, Math.round(Number(schoolDiscountCents) || 0));
  const volume = Math.max(0, Math.round(Number(volumeDiscountCents) || 0));
  const discountCents = percent >= 100 ? productCents + delivery : school + volume;
  const quoted = checkoutSalesTax({ productCents, discountCents, deliveryCents: delivery });
  return {
    ...quoted,
    totalDollars: quoted.totalCents / 100,
    taxDollars: quoted.taxCents / 100,
    isFreeOrder: quoted.totalCents === 0 && percent > 0,
  };
}

export function salesTaxLineItem(taxCents, rate = PHOENIX_RETAIL_TPT_RATE) {
  const amount = Math.max(0, Math.round(Number(taxCents) || 0));
  if (amount <= 0) return null;
  return {
    price_data: {
      currency: "usd",
      product_data: {
        name: `Sales tax (${salesTaxPercentLabel(rate)})`,
        description: "Phoenix, AZ combined transaction privilege tax",
      },
      unit_amount: amount,
    },
    quantity: 1,
  };
}
