import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import {
  calculateV5OrderTotals,
  normalizeV5CheckoutItems,
  normalizeV5ProductRecord,
  resolveV5CartPricing,
} from "../shared/oswPricing.js";
import { applyFullFlatbedProductDiscount } from "../shared/flatbedSpots.js";
import {
  applyPromoBundlePricing,
  getPromoBundleBySlug,
  nonBundleProductSubtotal,
  PROMO_BUNDLES,
} from "../shared/promoBundles.js";
import {
  CART_LOAD_GROUP_HINTS,
  CART_LOAD_GROUP_LABELS,
  partitionPayCartItems,
} from "../shared/cartLoadGroups.js";
import {
  cartAllowsPhoenixYardPickup,
  cartItemAllowsPhoenixYardPickup,
  PHOENIX_YARD_PICKUP_GRID_IDS,
  shouldHidePhoenixYardBulkSize,
} from "../shared/phoenixYardPickup.js";

const line = (productId, productName, sizeOption, quantity = 1, price = 0.01) => ({
  productId,
  productName,
  name: productName,
  sizeOption,
  format: sizeOption,
  quantity,
  price,
  unitPrice: price,
});

assert.deepEqual(resolveV5CartPricing(line(111, "Stage Potting Mix", "Pallet of 1.5 cu ft Bags")), {
  productId: 111,
  productName: "PlantPal",
  format: "Pallet (30 x 1.5CF)",
  unitPrice: 263.76,
  listUnitPrice: 329.7,
  savingsPerUnit: 65.94,
  discountPercent: 20,
  unitsPerPallet: 30,
  unit: "per pallet",
});

const exactCases = [
  [137, "Soil Craft", "1.5CF Bag", 15.99, 15.99],
  [137, "Soil Craft", "Pallet (30 x 1.5CF)", 383.76, 479.7],
  [111, "PlantPal", "1.5CF Bag", 10.99, 10.99],
  [111, "PlantPal", "Pallet (30 x 1.5CF)", 263.76, 329.7],
  [3000, "Nature's Blanket Premium", "2CF Bag", 10.99, 10.99],
  [3000, "Nature's Blanket Premium", "Pallet of 2CF Bags", 219.8, 274.75],
  [1000, "Simon's Gold", "9lb Bag", 12.46, 12.46],
  [1000, "Simon's Gold", "Pallet of 9 lb Bags", 1435.39, 1794.24],
  [1000, "Simon's Gold", "1CF Bag", 24.9, 24.9],
  [1000, "Simon's Gold", "Pallet of 1CF Bags", 996, 1245],
  [1001, "Mikey's Worm Poop", "9lb Bag", 18.1, 18.1],
  [1001, "Mikey's Worm Poop", "Pallet of 9 lb Bags", 2085.12, 2606.4],
  [1001, "Mikey's Worm Poop", "1CF Bag", 34.9, 34.9],
  [1001, "Mikey's Worm Poop", "Pallet of 1CF Bags", 1396, 1745],
];

for (const [productId, name, format, expectedSale, expectedList] of exactCases) {
  const pricing = resolveV5CartPricing(line(productId, name, format));
  assert.ok(pricing, `${name} ${format} resolves`);
  assert.equal(pricing.unitPrice, expectedSale);
  assert.equal(pricing.listUnitPrice, expectedList);
  assert.equal(pricing.savingsPerUnit, Math.round((expectedList - expectedSale) * 100) / 100);
  assert.equal(pricing.discountPercent, expectedList > expectedSale ? 20 : 0);
}

const tampered = normalizeV5CheckoutItems([
  line(111, "Stage Potting Mix", "Pallet of 1.5 cu ft Bags", 1, 1),
  line(3000, "Nature's Blanket Premium", "Pallet of 2CF Bags", 1, 9999),
]);
assert.equal(tampered[0].productName, "PlantPal");
assert.equal(tampered[0].price, 263.76);
assert.equal(tampered[1].price, 219.8);

const totals = calculateV5OrderTotals({
  items: tampered,
  deliveryCents: 5000,
  taxRate: 0.091,
});
assert.equal(totals.productSubtotalCents, 48356);
assert.equal(totals.deliveryCents, 5000);
assert.equal(totals.taxableCents, 53356);
assert.equal(totals.taxCents, 4855);
assert.equal(totals.totalCents, 58211);

for (const quantity of [21, 22, 23]) {
  const canonical = normalizeV5CheckoutItems([line(111, "PlantPal", "Pallet of 1.5 cu ft Bags", quantity)]);
  const result = applyFullFlatbedProductDiscount(canonical);
  assert.equal(result.applied, quantity === 22, `flatbed boundary ${quantity}`);
  if (quantity === 22) {
    assert.equal(result.items[0].price, 237.38);
    assert.equal(result.items[0].listUnitPrice, 329.7);
  }
}

const product = normalizeV5ProductRecord({ id: 111, name: "Stage Potting Mix", size_price_options: [] });
assert.equal(product.name, "PlantPal");
assert.equal(product.sizePriceOptions.find((entry) => entry.label.includes("Pallet")).unitsPerPallet, 30);
assert.equal(product.sizePriceOptions.find((entry) => entry.label.includes("Pallet")).price, 263.76);

assert.throws(
  () => normalizeV5CheckoutItems([line(111, "PlantPal", "Mystery pallet")]),
  /Unsupported V5 format/,
);

assert.equal(PROMO_BUNDLES.length, 3);
assert.equal(getPromoBundleBySlug("raised-bed-refresh")?.salePrice, 99);
assert.equal(getPromoBundleBySlug("garden-refresh-plus")?.salePrice, 149);
assert.equal(getPromoBundleBySlug("garden-bed-builder")?.salePrice, 399);

// The flyer totals must agree with the physical packs customers receive.
// In particular, 30 PlantPal bags are 45 cu ft, not a three-yard tote.
const bundlePackCuFt = new Map([
  ["/products/plantpal", 1.5],
  ["/products/simons-gold", 1],
  ["/products/mikeys-worm-poop", 1],
  ["/products/natures-blanket-premium", 2],
]);
const expectedBundleContents = new Map([
  [4100, { bags: 10, cuFt: 15 }],
  [4101, { bags: 16, cuFt: 24 }],
  [4102, { bags: 40, cuFt: 58 }],
]);
for (const bundle of PROMO_BUNDLES) {
  let bagCount = 0;
  let cuFt = 0;
  for (const item of bundle.items) {
    const pack = item.amount.match(/^(\d+) bags · (\d+(?:\.\d+)?) cu ft/);
    assert.ok(pack, `${bundle.title}: ${item.name} declares bag count and volume`);
    const itemBags = Number(pack[1]);
    const itemCuFt = Number(pack[2]);
    assert.equal(itemCuFt, itemBags * bundlePackCuFt.get(item.href), `${bundle.title}: ${item.name} uses the sold bag size`);
    bagCount += itemBags;
    cuFt += itemCuFt;
  }
  assert.deepEqual({ bags: bagCount, cuFt }, expectedBundleContents.get(bundle.productId), `${bundle.title} physical contents`);
  assert.equal(Number.parseInt(bundle.bagLabel), bagCount, `${bundle.title} displayed bag count`);
  assert.equal(Number.parseFloat(bundle.volumeLabel), cuFt, `${bundle.title} displayed volume`);
  assert.equal(bundle.listPrice - bundle.salePrice, bundle.savings, `${bundle.title} displayed savings`);
  for (const alias of bundle.aliases) {
    assert.equal(getPromoBundleBySlug(alias), bundle, `${alias} keeps its canonical SKU and contents`);
  }
}
const largeBundleVolume = getPromoBundleBySlug("big-garden-setup").volumeLabel;
assert.match(largeBundleVolume, /58 cu ft/);
assert.equal(Number(largeBundleVolume.match(/([\d.]+) cu yd/)[1]), Math.round((58 / 27) * 100) / 100, "Big Garden yard conversion matches its bags");

const tamperedBundle = normalizeV5CheckoutItems([
  line(4100, "Garden Refresh", "whatever", 1, 1),
  line(4101, "Garden Refresh Plus", "16 bags", 2, 9),
  line(4102, "Big Garden Setup", "tote leftover", 1, 459),
]);
assert.equal(tamperedBundle[0].price, 99);
assert.equal(tamperedBundle[0].format, "10-bag Phoenix pickup bundle");
assert.equal(tamperedBundle[1].price, 149);
assert.equal(tamperedBundle[1].quantity, 2);
assert.equal(tamperedBundle[1].format, "16-bag Phoenix pickup bundle");
assert.equal(tamperedBundle[2].price, 399);
assert.equal(tamperedBundle[2].format, "40-bag Phoenix pickup bundle");
assert.doesNotMatch(JSON.stringify(tamperedBundle), /tote/i);
assert.doesNotMatch(JSON.stringify(tamperedBundle), /coupon/i);

const mixedDiscountBase = nonBundleProductSubtotal([
  ...tamperedBundle,
  { productId: 111, price: 10.99, quantity: 1 },
]);
assert.equal(mixedDiscountBase, 10.99);

const bundleWithLegacyToteFormat = applyPromoBundlePricing(line(4102, "Big Garden Setup", "Tote", 1, 1));
const flatbedOnBundle = applyFullFlatbedProductDiscount(Array.from({ length: 22 }, () => ({ ...bundleWithLegacyToteFormat })));
assert.equal(flatbedOnBundle.items[0].price, 399, "already-priced bundles keep the letter-flyer sale price on a full flatbed");
assert.doesNotMatch(bundleWithLegacyToteFormat.format, /tote/i);

assert.equal(CART_LOAD_GROUP_LABELS.offers, "Offers");
assert.equal(CART_LOAD_GROUP_HINTS.offers, "Pickup or delivery at checkout");
assert.equal(CART_LOAD_GROUP_LABELS.bags, "Bags & small items");

const groupedCart = partitionPayCartItems([
  { productId: 4100, format: "10-bag Phoenix pickup bundle", quantity: 1 },
  { productId: 4101, format: "16-bag Phoenix pickup bundle", quantity: 1 },
  { productId: 4102, format: "40-bag Phoenix pickup bundle", quantity: 1 },
  { productId: 1000, format: "1CF Bag", quantity: 2 },
  { productId: 111, format: "Pallet (30 x 1.5CF)", quantity: 1 },
  { productId: 1000, format: "Truckload 24 ton walking floor", quantity: 1 },
]);
assert.deepEqual(
  groupedCart.offerItems.map((item) => item.productId),
  [4100, 4101, 4102],
  "letter-flyer promo bundles group under Offers",
);
assert.deepEqual(groupedCart.yardItems.map((item) => item.productId), [1000]);
assert.deepEqual(groupedCart.flatbedItems.map((item) => item.productId), [111]);
assert.equal(groupedCart.walkingFloorItems.length, 1);
assert.deepEqual(
  groupedCart.otherItems.map((item) => item.productId),
  [1000, 111, 1000],
  "regular bags/totes stay out of Offers",
);

const drawerSource = readFileSync(new URL("../client/src/components/QuoteCartDrawer.tsx", import.meta.url), "utf8");
assert.match(drawerSource, /CART_LOAD_GROUP_LABELS\.offers/);
assert.match(drawerSource, /partitionPayCartItems/);
assert.doesNotMatch(drawerSource, /title="Bags & small items"/);

const checkoutSource = readFileSync(new URL("../client/src/pages/Checkout.tsx", import.meta.url), "utf8");
assert.match(checkoutSource, /CART_LOAD_GROUP_LABELS\.offers/);
assert.match(checkoutSource, /partitionPayCartItems/);
assert.match(checkoutSource, /CART_LOAD_GROUP_HINTS\.offers/);
assert.match(drawerSource, /includedLabel/);
assert.match(checkoutSource, /includedLabel/);
assert.match(checkoutSource, /getPromoBundleByProductId/);

const bundleOffersSource = readFileSync(new URL("../client/src/pages/BundleOffers.tsx", import.meta.url), "utf8");
assert.doesNotMatch(bundleOffersSource, /\/api\/contact\/submit/);
assert.match(bundleOffersSource, /Add bundle to order/);
assert.doesNotMatch(bundleOffersSource, /coupon/i);
assert.match(bundleOffersSource, /<title>\s*Soil &amp; Raised Garden Bed Deals\s*\|\s*Organic Soil Wholesale\s*<\/title>/);
assert.match(bundleOffersSource, /PROMO_BUNDLES\.map/);
assert.match(bundleOffersSource, /fmtDealPrice\(offer\.salePrice\)/);
assert.match(bundleOffersSource, /Tue–Sat · 8 am–1 pm &amp; 2–4 pm/);
assert.doesNotMatch(bundleOffersSource, /Three setups\. Tap one\./);
assert.doesNotMatch(bundleOffersSource, /Need a truckload, not a bundle/);
assert.match(bundleOffersSource, /href=\{product\.href\}/);
assert.match(bundleOffersSource, /id="bundle-contents-heading"/);
assert.match(bundleOffersSource, /id="bundle-use-heading"/);
assert.match(bundleOffersSource, /id="bundle-faq-heading"/);
assert.match(bundleOffersSource, /href="\/garden-bed-offer\.html"/);
assert.match(bundleOffersSource, /useRoute\("\/deals\/:slug"\)/);
assert.doesNotMatch(bundleOffersSource, /\$69/);
assert.doesNotMatch(bundleOffersSource, /\$459/);

const headerSource = readFileSync(new URL("../client/src/components/layout/Header.tsx", import.meta.url), "utf8");
assert.match(headerSource, /name: "Products"/);
assert.match(headerSource, /name: "Deals"/);
assert.match(headerSource, /path: "\/offers"/);
assert.match(headerSource, /name: "About Us"/);
assert.match(headerSource, /name: "Contact"/);
assert.match(headerSource, /name: "FAQ"/);
assert.doesNotMatch(headerSource, /Our Education Platform/);
assert.doesNotMatch(headerSource, /weareufe/);
assert.doesNotMatch(headerSource, /<DealList/);
assert.doesNotMatch(headerSource, /name: "Bundles"/);
assert.doesNotMatch(headerSource, /Garden bundles/);

const dealListSource = readFileSync(new URL("../client/src/components/DealList.tsx", import.meta.url), "utf8");
assert.match(dealListSource, /deal\.listCaption/);
assert.match(dealListSource, /href=\{`\/offers\/\$\{deal\.slug\}`\}/);
assert.match(dealListSource, /deal\.bannerImage/, "homepage keeps the user-approved original bundle banners");
assert.match(dealListSource, /58 CU FT TOTAL/, "the original Big Garden banner volume typo stays corrected");
assert.match(dealListSource, /fmtDealPrice\(deal\.salePrice\)/);
assert.match(dealListSource, /Shop offer/);
assert.doesNotMatch(dealListSource, /Buy Now/);

assert.equal(getPromoBundleBySlug("garden-refresh")?.listCaption, "Perfect for an existing garden. Quick soil feed and replenishment.");
assert.equal(getPromoBundleBySlug("garden-refresh-plus")?.listCaption, "A little soil with worm castings and mulch. Fill and feed one bed.");
assert.equal(getPromoBundleBySlug("big-garden-setup")?.listCaption, "Bags of soil with feed and mulch. Two to three beds.");
assert.doesNotMatch(getPromoBundleBySlug("big-garden-setup")?.listCaption || "", /tote/i);
assert.equal(PROMO_BUNDLES.map((bundle) => bundle.salePrice).join(","), "99,149,399");
assert.equal(PROMO_BUNDLES.map((bundle) => bundle.bagLabel).join(","), "10 bags,16 bags,40 bags");
assert.equal(getPromoBundleBySlug("garden-refresh")?.lpHeadline, "One 4×8 bed.");
assert.equal(getPromoBundleBySlug("garden-refresh-plus")?.lpHeadline, "One 4×8 bed.");
assert.equal(getPromoBundleBySlug("big-garden-setup")?.lpHeadline, "2 to 3 beds.");
assert.match(getPromoBundleBySlug("big-garden-setup")?.lpLine || "", /40 bags/);
assert.doesNotMatch(JSON.stringify(PROMO_BUNDLES), /tote/i);
assert.doesNotMatch(JSON.stringify(PROMO_BUNDLES), /\$69/);
assert.doesNotMatch(JSON.stringify(PROMO_BUNDLES), /\$459/);
assert.equal(getPromoBundleBySlug("garden-refresh")?.items.length, 3);
assert.match(getPromoBundleBySlug("garden-refresh")?.items[0].amount || "", /5 bags/);
assert.equal(getPromoBundleBySlug("garden-refresh")?.items[0].href, "/products/natures-blanket-premium");
assert.equal(getPromoBundleBySlug("garden-refresh")?.items[1].href, "/products/simons-gold");
assert.equal(getPromoBundleBySlug("garden-refresh")?.items[2].href, "/products/mikeys-worm-poop");
assert.equal(getPromoBundleBySlug("garden-refresh-plus")?.items[0].href, "/products/plantpal");
assert.match(getPromoBundleBySlug("garden-refresh")?.items[1].amount || "", /3 bags/);
assert.match(getPromoBundleBySlug("garden-refresh")?.items[2].amount || "", /2 bags/);
assert.match(getPromoBundleBySlug("big-garden-setup")?.items.find((item) => item.name.includes("PlantPal"))?.amount || "", /30 bags/);
assert.equal(getPromoBundleBySlug("garden-refresh")?.includedLabel, "5 Nature's Blanket, 3 Simon's Gold free, 2 Mikey's Worm Poop");
assert.equal(getPromoBundleBySlug("garden-refresh-plus")?.includedLabel, "10 PlantPal, 3 Nature's Blanket free, 3 Mikey's Worm Poop");
assert.equal(getPromoBundleBySlug("big-garden-setup")?.includedLabel, "30 PlantPal, 4 Simon's Gold, 3 Mikey's Worm Poop, 3 Nature's Blanket");
assert.equal(getPromoBundleBySlug("garden-refresh")?.phoenixYardPickup, true);
assert.equal(getPromoBundleBySlug("garden-refresh-plus")?.phoenixYardPickup, true);
assert.equal(getPromoBundleBySlug("big-garden-setup")?.phoenixYardPickup, true);

assert.deepEqual([...PHOENIX_YARD_PICKUP_GRID_IDS], [111, 1001, 1000, 3000, 1034]);
assert.equal(resolveV5CartPricing(line(1034, "Sabrina Kills Bugs", "32 oz Bottle"))?.unitPrice, 18.99);
assert.equal(resolveV5CartPricing(line(1034, "Sabrina Kills Bugs", "1 Gallon"))?.unitPrice, 89.99);
assert.equal(cartItemAllowsPhoenixYardPickup(line(1034, "Sabrina Kills Bugs", "32 oz Bottle")), true);
assert.equal(cartItemAllowsPhoenixYardPickup(line(1034, "Sabrina Kills Bugs", "1 Gallon")), true);
assert.equal(cartItemAllowsPhoenixYardPickup(line(1000, "Simon's Gold", "9lb Bag")), true);
assert.equal(cartItemAllowsPhoenixYardPickup(line(134, "Nature's Blanket", "2CF Bag")), true);
assert.equal(cartItemAllowsPhoenixYardPickup(line(3000, "Nature's Blanket Premium", "Bulk Pickup")), true);
assert.equal(cartItemAllowsPhoenixYardPickup(line(111, "PlantPal", "1.5CF Bag")), true);
assert.equal(cartItemAllowsPhoenixYardPickup(line(1001, "Mikey's Worm Poop", "9lb Bag")), true);
assert.equal(cartItemAllowsPhoenixYardPickup(line(1001, "Mikey's Worm Poop", "Bulk Pickup")), false);
assert.equal(cartAllowsPhoenixYardPickup([line(4100, "Garden Refresh", "10-bag Phoenix pickup bundle")]), true);
assert.equal(cartAllowsPhoenixYardPickup([line(4101, "Garden Refresh Plus", "16-bag Phoenix pickup bundle")]), true);
assert.equal(cartAllowsPhoenixYardPickup([line(4102, "Big Garden Setup", "40-bag Phoenix pickup bundle")]), true);
assert.equal(shouldHidePhoenixYardBulkSize(111, "Bulk Pickup"), true);
assert.equal(shouldHidePhoenixYardBulkSize(1001, "Bulk Pickup"), true);
assert.equal(shouldHidePhoenixYardBulkSize(137, "Bulk Pickup"), true);
assert.equal(shouldHidePhoenixYardBulkSize(1000, "Bulk Pickup"), false);
assert.equal(shouldHidePhoenixYardBulkSize(3000, "Bulk Pickup"), false);
assert.equal(cartItemAllowsPhoenixYardPickup(line(137, "Soil Craft", "1.5CF Bag")), false);

const plantPalRecord = normalizeV5ProductRecord({ id: 111, name: "PlantPal", size_price_options: [] });
assert.equal(plantPalRecord.sizePriceOptions.find((entry) => entry.label === "Bulk Pickup").isActive, false);
const simonsRecord = normalizeV5ProductRecord({ id: 1000, name: "Simon's Gold", size_price_options: [] });
assert.equal(simonsRecord.sizePriceOptions.find((entry) => entry.label === "Bulk Pickup").isActive, true);
assert.equal(resolveV5CartPricing(line(134, "Nature's Blanket", "2CF Bag"))?.unitPrice, 8.99);

const payPickupGridSource = readFileSync(new URL("../client/src/components/PayPickupGrid.tsx", import.meta.url), "utf8");
assert.match(payPickupGridSource, /PHOENIX_YARD_PICKUP_GRID_IDS/);
assert.match(payPickupGridSource, /plantpal-with-veggies/);
assert.match(payPickupGridSource, /mikeys-worm-poop-bag-context/);

for (const slug of ["garden-refresh", "garden-refresh-plus", "big-garden-setup"]) {
  const heroPath = getPromoBundleBySlug(slug)?.heroImage || "";
  assert.match(heroPath, /^\/images\/bundles\/.+\.webp$/, `${slug} uses current product imagery`);
  const hero = statSync(new URL(`../client/public${heroPath}`, import.meta.url));
  assert.ok(hero.size < 100_000, `${slug} active product image too large: ${hero.size}`);
}

const footerSource = readFileSync(new URL("../client/src/components/layout/Footer.tsx", import.meta.url), "utf8");
assert.match(footerSource, />\s*Deals\s*</);
assert.doesNotMatch(footerSource, /Garden Bundles/);

const vercelConfig = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));
assert.equal(vercelConfig.redirects.find((rule) => rule.source === "/promos")?.destination, "/offers");
assert.equal(vercelConfig.redirects.find((rule) => rule.source === "/promo")?.destination, "/offers");
assert.equal(vercelConfig.redirects.find((rule) => rule.source === "/promos/:path*")?.destination, "/offers/:path*");
assert.equal(vercelConfig.redirects.find((rule) => rule.source === "/deals")?.destination, "/offers");
assert.equal(vercelConfig.redirects.find((rule) => rule.source === "/deals/:path*")?.destination, "/offers/:path*");

const appSource = readFileSync(new URL("../client/src/App.tsx", import.meta.url), "utf8");
assert.match(appSource, /path="\/deals"/);
assert.match(appSource, /path="\/deals\/:slug"/);

const wholesaleSource = readFileSync(new URL("../client/src/pages/Wholesale.tsx", import.meta.url), "utf8");
assert.doesNotMatch(wholesaleSource, /PlantPal[^\n]*(?:1CF|50\/pallet)/, "PlantPal wholesale request option uses the V5 physical pack");
assert.match(wholesaleSource, /PlantPal Potting Mix \(1\.5CF, 30\/pallet\)/);
const workOrderSource = readFileSync(new URL("../client/src/pages/admin/CreateWorkOrder.tsx", import.meta.url), "utf8");
assert.match(workOrderSource, /code: '1\.5cf'.*unitsPerPallet: 30/);
assert.match(workOrderSource, /code: '2cf'.*unitsPerPallet: 25/);

const homeSource = readFileSync(new URL("../client/src/pages/Home.tsx", import.meta.url), "utf8");
assert.match(homeSource, /<DealHubCards/);
assert.doesNotMatch(homeSource, /Phoenix pickup · already priced/);
assert.doesNotMatch(homeSource, /\$69/);
assert.doesNotMatch(homeSource, /\$459/);
assert.doesNotMatch(homeSource, /1 tote \+ 10 bags/);

console.log("OSW V5 pricing: exact prices, pallet boundaries, mixed totals, rounding, delivery/tax separation, aliases, tamper normalization, and letter-flyer promo bundle prices ok");
