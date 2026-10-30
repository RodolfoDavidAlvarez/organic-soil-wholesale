/**
 * Organic Soil Wholesale local pricing V5.
 *
 * This module is intentionally OSW-only. SSW Mobile is a read-only reference.
 * Dollar values are used at the website boundary because the existing cart and
 * checkout payloads use dollars. Calculations convert to cents before rounding.
 */

import { applyPromoBundlePricing, resolvePromoBundle } from "./promoBundles.js";
import { shouldHidePhoenixYardBulkSize } from "./phoenixYardPickup.js";

export const PALLET_VOLUME_DISCOUNT = 0.2;

const money = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
const cents = (value) => Math.round(Number(value) * 100);

const option = (key, label, price, unit, extra = {}) => ({
  key,
  label,
  price: money(price),
  priceCents: cents(price),
  unit,
  isActive: true,
  ...extra,
});

export const V5_PRODUCT_PRICING = Object.freeze({
  137: {
    name: "Soil Craft",
    aliases: ["soil craft"],
    options: [
      option("1.5CF Bag", "1.5CF Bag", 15.99, "per bag"),
      option("Pallet (30 x 1.5CF)", "Pallet (30 x 1.5CF)", 383.76, "per pallet", { listPrice: 479.7, unitsPerPallet: 30, discountPercent: 20 }),
      option("Tote", "Tote", 359.78, "per tote"),
      option("Bulk Pickup", "Bulk Pickup", 120, "per cu yd"),
      option("Truckload (~60 cu yd)", "Truckload (~60 cu yd)", 3600, "per truckload"),
    ],
  },
  111: {
    name: "PlantPal Plus",
    aliases: ["plantpal plus", "plantpal", "stage potting mix", "all-stage potting mix", "all stage potting mix"],
    options: [
      option("1.5CF Bag", "1.5CF Bag", 10.99, "per bag"),
      option("Pallet (30 x 1.5CF)", "Pallet (30 x 1.5CF)", 263.76, "per pallet", { listPrice: 329.7, unitsPerPallet: 30, discountPercent: 20 }),
      option("Tote", "Tote", 247.28, "per tote"),
      option("Bulk Pickup", "Bulk Pickup", 80, "per cu yd"),
      option("Truckload (~60 cu yd)", "Truckload (~60 cu yd)", 2160, "per truckload"),
    ],
  },
  134: {
    name: "Nature's Blanket",
    aliases: ["nature's blanket", "natures blanket"],
    options: [
      option("2CF Bag", "2CF Bag", 8.99, "per bag"),
      option("Pallet (25 x 2CF)", "Pallet (25 x 2CF)", 179.8, "per pallet", { listPrice: 224.75, unitsPerPallet: 25, discountPercent: 20 }),
      option("Tote", "Tote", 112.38, "per tote"),
      option("Truckload (22 pallets)", "Truckload (22 pallets)", 2224.72, "per truckload"),
    ],
  },
  3000: {
    name: "Nature's Blanket Premium",
    aliases: ["nature's blanket premium", "natures blanket premium", "nature's blanket premium mulch"],
    options: [
      option("2CF Bag", "2CF Bag", 10.99, "per bag"),
      option("Pallet (25 x 2CF)", "Pallet (25 x 2CF)", 219.8, "per pallet", { listPrice: 274.75, unitsPerPallet: 25, discountPercent: 20 }),
      option("Tote", "Tote", 137.5, "per tote"),
      option("Bulk Pickup", "Bulk Pickup", 44, "per cu yd"),
      option("Truckload (~60 cu yd)", "Truckload (~60 cu yd)", 1440, "per truckload"),
    ],
  },
  1000: {
    name: "Simon's Gold",
    aliases: ["simon's gold", "simons gold"],
    options: [
      option("9lb Bag", "9lb Bag", 12.46, "per bag"),
      option("Pallet (144 x 9lb)", "Pallet (144 x 9lb)", 1435.39, "per pallet", { listPrice: 1794.24, unitsPerPallet: 144, discountPercent: 20 }),
      option("1CF Bag", "1CF Bag", 24.9, "per bag"),
      option("Pallet (50 x 1CF)", "Pallet (50 x 1CF)", 996, "per pallet", { listPrice: 1245, unitsPerPallet: 50, discountPercent: 20 }),
      option("Tote", "Tote", 149, "per tote"),
      option("Bulk Pickup", "Bulk Pickup", 45, "per ton"),
      option("Truckload (~24 tons)", "Truckload (~24 tons)", 720, "per truckload"),
    ],
  },
  1034: {
    name: "Sabrina Kills Bugs",
    aliases: ["sabrina kills bugs"],
    options: [
      option("32 oz Bottle", "32 oz Bottle", 18.99, "per bottle", { msrp: "$18.99" }),
      option("1 Gallon", "1 Gallon", 89.99, "per gallon", { msrp: "$89.99" }),
    ],
  },
  1001: {
    name: "Mikey's Worm Poop",
    aliases: ["mikey's worm poop", "mikeys worm poop"],
    options: [
      option("9lb Bag", "9lb Bag", 18.1, "per bag"),
      option("Pallet (144 x 9lb)", "Pallet (144 x 9lb)", 2085.12, "per pallet", { listPrice: 2606.4, unitsPerPallet: 144, discountPercent: 20 }),
      option("1CF Bag", "1CF Bag", 34.9, "per bag"),
      option("Pallet (50 x 1CF)", "Pallet (50 x 1CF)", 1396, "per pallet", { listPrice: 1745, unitsPerPallet: 50, discountPercent: 20 }),
      option("Tote", "Tote", 399, "per tote"),
      option("Bulk Pickup", "Bulk Pickup", 300, "per ton"),
      option("Truckload (~24 tons)", "Truckload (~24 tons)", 4800, "per truckload"),
    ],
  },
});

const normalizedText = (value) => String(value || "").toLowerCase().replace(/[’]/g, "'").replace(/[^a-z0-9]+/g, " ").trim();

export function resolveV5ProductId(productId, productName) {
  const numericId = Number(productId);
  if (V5_PRODUCT_PRICING[numericId]) return numericId;
  const name = normalizedText(productName);
  for (const [id, product] of Object.entries(V5_PRODUCT_PRICING)) {
    if (product.aliases.some((alias) => normalizedText(alias) === name)) return Number(id);
  }
  return null;
}

function matchOption(productId, format) {
  const product = V5_PRODUCT_PRICING[productId];
  if (!product) return null;
  const value = normalizedText(format);
  const isPallet = value.includes("pallet");
  const isNinePound = /(?:^| )9 ?lb(?: |$)/.test(value);
  const isTwoCf = value.includes("2cf") || value.includes("2 cf") || value.includes("2 cu ft");
  const isOneAndHalfCf = value.includes("1 5cf") || value.includes("1 5 cf") || value.includes("1 5 cu ft");
  const isOneCf = value.includes("1cf") || value.includes("1 cf") || value.includes("1 cu ft");

  if (isPallet) {
    if (isNinePound) return product.options.find((entry) => entry.label.includes("144 x 9lb")) || null;
    if (isTwoCf) return product.options.find((entry) => entry.label.includes("25 x 2CF")) || null;
    if (isOneAndHalfCf || isOneCf) {
      return product.options.find((entry) => entry.label.includes(productId === 111 || productId === 137 ? "30 x 1.5CF" : "50 x 1CF")) || null;
    }
  }
  if (value.includes("truckload") || value.includes("walking floor")) {
    return product.options.find((entry) => entry.label.includes("Truckload")) || null;
  }
  if (value.includes("bulk pickup") || value.includes("pickup by") || value.includes("loose pickup")) {
    return product.options.find((entry) => entry.label === "Bulk Pickup") || null;
  }
  if (value.includes("tote") || value.includes("super sack") || value.includes("supersack")) {
    return product.options.find((entry) => entry.label === "Tote") || null;
  }
  if (value.includes("bottle")) {
    return product.options.find((entry) => entry.label.toLowerCase().includes("bottle")) || null;
  }
  if (value.includes("gallon")) {
    return product.options.find((entry) => entry.label.toLowerCase().includes("gallon")) || null;
  }
  if (isNinePound) return product.options.find((entry) => entry.label === "9lb Bag") || null;
  if (isTwoCf) return product.options.find((entry) => entry.label === "2CF Bag") || null;
  if (isOneAndHalfCf || isOneCf) {
    return product.options.find((entry) => entry.label === (productId === 111 || productId === 137 ? "1.5CF Bag" : "1CF Bag")) || null;
  }
  return null;
}

export function resolveV5CartPricing(item) {
  if (resolvePromoBundle(item)) return null;
  const productId = resolveV5ProductId(item?.productId ?? item?.product_id, item?.productName ?? item?.name);
  if (!productId) return null;
  const matched = matchOption(productId, item?.sizeOption ?? item?.format ?? item?.size);
  if (!matched) return null;
  const listUnitPrice = matched.listPrice ?? matched.price;
  return {
    productId,
    productName: V5_PRODUCT_PRICING[productId].name,
    format: matched.label,
    unitPrice: matched.price,
    listUnitPrice,
    savingsPerUnit: money(listUnitPrice - matched.price),
    discountPercent: matched.discountPercent ?? 0,
    unitsPerPallet: matched.unitsPerPallet ?? null,
    unit: matched.unit,
  };
}

export function normalizeV5CartItem(item) {
  if (resolvePromoBundle(item)) return applyPromoBundlePricing(item);
  const pricing = resolveV5CartPricing(item);
  if (!pricing) return item;
  return {
    ...item,
    productId: pricing.productId,
    productName: pricing.productName,
    name: pricing.productName,
    format: pricing.format,
    sizeOption: pricing.format,
    price: pricing.unitPrice,
    unitPrice: pricing.unitPrice,
    listUnitPrice: pricing.listUnitPrice,
    savingsPerUnit: pricing.savingsPerUnit,
    discountPercent: pricing.discountPercent,
    unitsPerPallet: pricing.unitsPerPallet,
    unit: pricing.unit,
  };
}

export function normalizeV5CheckoutItems(items) {
  return (items || []).map((item) => {
    if (resolvePromoBundle(item)) return applyPromoBundlePricing(item);
    const productId = resolveV5ProductId(item?.productId ?? item?.product_id, item?.productName ?? item?.name);
    if (!productId) return item;
    const pricing = resolveV5CartPricing(item);
    if (!pricing) throw new Error(`Unsupported V5 format for ${V5_PRODUCT_PRICING[productId].name}`);
    return normalizeV5CartItem(item);
  });
}

export function normalizeV5ProductRecord(product) {
  const productId = resolveV5ProductId(product?.id, product?.name);
  if (!productId) return product;
  const pricing = V5_PRODUCT_PRICING[productId];
  const savedOptions = product?.sizePriceOptions ?? product?.size_price_options;
  const sizeImages = new Map((Array.isArray(savedOptions) ? savedOptions : [])
    .filter((entry) => typeof entry?.image === 'string' && entry.image.trim())
    .map((entry) => [entry.key || entry.size || entry.label, entry.image.trim()]));
  const options = pricing.options.map((entry) => ({
    ...entry,
    ...(sizeImages.has(entry.key) ? { image: sizeImages.get(entry.key) } : {}),
    isActive: shouldHidePhoenixYardBulkSize(productId, entry.label) ? false : entry.isActive !== false,
  }));
  return {
    ...product,
    name: pricing.name,
    display_title: product?.display_title || pricing.name,
    displayTitle: product?.displayTitle || product?.display_title || pricing.name,
    size_price_options: options.map((entry) => ({ ...entry })),
    sizePriceOptions: options.map((entry) => ({ ...entry })),
  };
}

export function calculateV5OrderTotals({ items, deliveryCents = 0, taxRate = 0, orderDiscountCents = 0 }) {
  const normalizedItems = normalizeV5CheckoutItems(items);
  const productSubtotalCents = normalizedItems.reduce((sum, item) => {
    const unitPrice = item.unitPrice ?? item.price ?? 0;
    return sum + cents(unitPrice) * Math.max(0, Number(item.quantity) || 0);
  }, 0);
  const safeDeliveryCents = Math.max(0, Math.round(deliveryCents));
  const safeDiscountCents = Math.min(productSubtotalCents, Math.max(0, Math.round(orderDiscountCents)));
  const taxableCents = Math.max(0, productSubtotalCents - safeDiscountCents + safeDeliveryCents);
  const taxCents = Math.round(taxableCents * Math.max(0, Number(taxRate) || 0));
  return {
    items: normalizedItems,
    productSubtotalCents,
    orderDiscountCents: safeDiscountCents,
    deliveryCents: safeDeliveryCents,
    taxableCents,
    taxCents,
    totalCents: taxableCents + taxCents,
  };
}
