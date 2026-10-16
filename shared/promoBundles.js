/**
 * Phoenix yard pickup promo bundles.
 *
 * These are already-discounted pay-and-pickup SKUs. Checkout must charge the
 * letter-flyer sale price as a single cart line. Survey 30% and other percent
 * discounts stay off these lines (TEST / 100% QA still applies to the whole order).
 *
 * Product rows 4100–4102 already exist in Supabase (catalog disabled) so
 * order_items.product_id FK inserts succeed. Do not invent coupon codes.
 * Do not mint new SKUs — keep 4100–4102 so old cart links still work.
 */

export const PROMO_BUNDLE_PRODUCT_IDS = Object.freeze([4100, 4101, 4102]);

const productImages = {
  plantpal: {
    image: "/images/optimized/plantpal-bag-context.webp",
    alt: "PlantPal all-stage potting mix bag with fresh vegetables",
    href: "/products/plantpal",
  },
  simons: {
    image: "/images/optimized/simons-gold-bag-context.webp",
    alt: "Simon's Gold dairy compost bag with fresh vegetables",
    href: "/products/simons-gold",
  },
  mikeys: {
    image: "/images/optimized/mikeys-worm-poop-bag-context.webp",
    alt: "Mikey's Worm Poop worm castings bag with vegetables and soil",
    href: "/products/mikeys-worm-poop",
  },
  mulch: {
    image: "/images/optimized/natures-blanket-bag-context.webp",
    alt: "Nature's Blanket Premium mulch bag with rich brown mulch",
    href: "/products/natures-blanket-premium",
  },
};

export const PROMO_BUNDLES = Object.freeze([
  {
    productId: 4100,
    slug: "garden-refresh",
    aliases: ["raised-bed-refresh"],
    eyebrow: "The 4×8 raised-bed reset",
    title: "Garden Refresh",
    shortTitle: "Garden Refresh",
    listCaption: "Perfect for an existing garden. Quick soil feed and replenishment.",
    lpHeadline: "One 4×8 bed.",
    lpLine: "10 bags. Compost, worm castings, mulch.",
    lpUse: "Feed the soil. Cover with mulch. Pickup at the yard.",
    description:
      "Fifteen cubic feet across ten bags: mulch, dairy compost, and worm castings for one 4×8 raised bed.",
    heroImage: "/images/bundles/natures-blanket-premium-texture-640.webp",
    bannerImage: "/images/offers/banners/garden-refresh.webp",
    heroAlt: "Enhanced wood-fiber mulch included in the Garden Refresh bundle",
    listPrice: 199,
    salePrice: 99,
    savings: 100,
    badge: "Save $100",
    format: "10-bag Phoenix pickup bundle",
    phoenixYardPickup: true,
    includedLabel: "5 Nature's Blanket, 3 Simon's Gold free, 2 Mikey's Worm Poop",
    unit: "per bundle",
    volumeLabel: "15 cu ft",
    bagLabel: "10 bags",
    bedLabel: "One 4×8 bed",
    idealFor: "Refreshing one existing 4×8 raised bed for fall",
    result: "Three cubic feet of compost plus two cubic feet of worm castings feed the soil, and ten cubic feet of mulch cover the same bed.",
    pickupNote: "Phoenix yard pickup. Add other bags from Products and check out together.",
    items: [
      { name: "Nature's Blanket Premium mulch", amount: "5 bags · 10 cu ft", ...productImages.mulch },
      { name: "Simon's Gold dairy compost", amount: "3 bags · 3 cu ft included", ...productImages.simons },
      { name: "Mikey's Worm Poop worm castings", amount: "2 bags · 2 cu ft", ...productImages.mikeys },
    ],
  },
  {
    productId: 4101,
    slug: "garden-refresh-plus",
    aliases: [],
    eyebrow: "Mix, not just compost",
    title: "Garden Refresh Plus",
    shortTitle: "Garden Refresh Plus",
    listCaption: "A little soil with worm castings and mulch. Fill and feed one bed.",
    lpHeadline: "One 4×8 bed.",
    lpLine: "16 bags. Soil, worm castings, mulch free.",
    lpUse: "Fill the bed. Feed it. Cover it.",
    description:
      "Twenty-four cubic feet across sixteen bags: PlantPal mix, three free mulch bags, and worm castings for one 4×8 raised bed.",
    heroImage: "/images/bundles/plantpal-texture-640.webp",
    bannerImage: "/images/offers/banners/garden-refresh-plus.webp",
    heroAlt: "Growing mix texture for the Garden Refresh Plus bundle",
    listPrice: 247,
    salePrice: 149,
    savings: 98,
    badge: "Save $98",
    format: "16-bag Phoenix pickup bundle",
    phoenixYardPickup: true,
    includedLabel: "10 PlantPal, 3 Nature's Blanket free, 3 Mikey's Worm Poop",
    unit: "per bundle",
    volumeLabel: "24 cu ft",
    bagLabel: "16 bags",
    bedLabel: "One 4×8 bed",
    idealFor: "Filling and feeding one 4×8 raised bed with living mix, not just compost",
    result: "Fifteen cubic feet of PlantPal, three cubic feet of castings, and six cubic feet of mulch included free.",
    pickupNote: "Phoenix yard pickup. The three Nature's Blanket bags are included—already in this bundle price.",
    items: [
      { name: "PlantPal all-stage potting mix", amount: "10 bags · 15 cu ft", ...productImages.plantpal },
      { name: "Nature's Blanket Premium mulch", amount: "3 bags · 6 cu ft included", ...productImages.mulch },
      { name: "Mikey's Worm Poop worm castings", amount: "3 bags · 3 cu ft", ...productImages.mikeys },
    ],
  },
  {
    productId: 4102,
    slug: "big-garden-setup",
    aliases: ["garden-bed-builder"],
    eyebrow: "Fill the beds. Feed the soil. Finish the surface.",
    title: "Big Garden Setup",
    shortTitle: "Big Garden Setup",
    listCaption: "Bags of soil with feed and mulch. Two to three beds.",
    lpHeadline: "2 to 3 beds.",
    lpLine: "40 bags. Soil, compost, worm castings, mulch.",
    lpUse: "Fill, feed, cover. Pickup at the yard.",
    description:
      "Fifty-eight cubic feet (about 2.15 cubic yards) across forty bags of PlantPal, compost, worm castings, and mulch. Fill depth and the amount already in your beds determine coverage.",
    heroImage: "/images/bundles/plantpal-texture-640.webp",
    bannerImage: "/images/offers/banners/big-garden-setup.webp",
    heroAlt: "Growing mix texture for the Big Garden Setup bundle",
    listPrice: 566,
    salePrice: 399,
    savings: 167,
    badge: "Save $167",
    format: "40-bag Phoenix pickup bundle",
    phoenixYardPickup: true,
    includedLabel: "30 PlantPal, 4 Simon's Gold, 3 Mikey's Worm Poop, 3 Nature's Blanket",
    unit: "per bundle",
    volumeLabel: "58 cu ft / approx. 2.15 cu yd",
    bagLabel: "40 bags",
    bedLabel: "2–3 4×8 beds",
    idealFor: "Building or deeply resetting two to three 4×8 garden beds",
    result: "Forty bags fill two to three 4×8 beds depending on depth—45 cu ft of PlantPal plus feed and mulch.",
    pickupNote: "Phoenix yard pickup. Add other bags from Products and check out together.",
    items: [
      { name: "PlantPal all-stage potting mix", amount: "30 bags · 45 cu ft", ...productImages.plantpal },
      { name: "Simon's Gold dairy compost", amount: "4 bags · 4 cu ft", ...productImages.simons },
      { name: "Mikey's Worm Poop worm castings", amount: "3 bags · 3 cu ft", ...productImages.mikeys },
      { name: "Nature's Blanket Premium mulch", amount: "3 bags · 6 cu ft", ...productImages.mulch },
    ],
  },
]);

const BUNDLE_BY_ID = new Map(PROMO_BUNDLES.map((bundle) => [bundle.productId, bundle]));
const BUNDLE_BY_SLUG = new Map();
for (const bundle of PROMO_BUNDLES) {
  BUNDLE_BY_SLUG.set(bundle.slug, bundle);
  for (const alias of bundle.aliases) BUNDLE_BY_SLUG.set(alias, bundle);
}

const normalizedText = (value) =>
  String(value || "")
    .toLowerCase()
    .replace(/[’]/g, "'")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

export function isPromoBundleProductId(productId) {
  const id = Number(productId);
  return Number.isInteger(id) && BUNDLE_BY_ID.has(id);
}

export function getPromoBundleBySlug(slug) {
  if (!slug) return null;
  return BUNDLE_BY_SLUG.get(String(slug).trim().toLowerCase()) || null;
}

export function getPromoBundleByProductId(productId) {
  const id = Number(productId);
  return Number.isInteger(id) ? BUNDLE_BY_ID.get(id) || null : null;
}

export function resolvePromoBundle(item) {
  if (!item || typeof item !== "object") return null;
  const byId = getPromoBundleByProductId(item.productId ?? item.product_id);
  if (byId) return byId;
  const bySlug = getPromoBundleBySlug(item.productSlug ?? item.product_slug ?? item.slug);
  if (bySlug) return bySlug;
  const name = normalizedText(item.productName ?? item.name);
  if (!name) return null;
  return PROMO_BUNDLES.find((bundle) => normalizedText(bundle.title) === name) || null;
}

export function promoBundleHref(productId) {
  const bundle = getPromoBundleByProductId(productId);
  return bundle ? `/offers/${bundle.slug}` : null;
}

export function promoBundleCartItem(bundle, quantity = 1) {
  const qty = Math.max(1, Math.round(Number(quantity) || 1));
  return {
    productId: bundle.productId,
    productName: bundle.title,
    name: bundle.title,
    productSlug: bundle.slug,
    format: bundle.format,
    sizeOption: bundle.format,
    quantity: qty,
    unitPrice: bundle.salePrice,
    price: bundle.salePrice,
    listUnitPrice: bundle.listPrice,
    savingsPerUnit: bundle.savings,
    discountPercent: 0,
    unit: bundle.unit,
    mode: "pay",
    imageUrl: bundle.heroImage,
  };
}

export function applyPromoBundlePricing(item) {
  const bundle = resolvePromoBundle(item);
  if (!bundle) return item;
  const quantity = Math.max(1, Math.round(Number(item.quantity) || 1));
  return {
    ...item,
    ...promoBundleCartItem(bundle, quantity),
    quantity,
  };
}

/**
 * Percent discounts (survey 30%, etc.) must not reduce already-priced bundles.
 * TEST / 100% QA still applies to the whole order in checkout.
 */
export function nonBundleProductSubtotal(items) {
  return (items || []).reduce((sum, item) => {
    if (resolvePromoBundle(item)) return sum;
    const price = Number(item.price ?? item.unitPrice) || 0;
    const quantity = Math.max(0, Number(item.quantity) || 0);
    return sum + price * quantity;
  }, 0);
}
