/**
 * Phoenix yard loadability — single source of truth.
 *
 * The Phoenix yard (1634 N 19th Ave) only loads loose material that is on the
 * ground right now. Bagged SKUs (PlantPal, Mikey's, compost, mulch) can check
 * out for Phoenix pickup. Loose cubic-yard / bulk pickup stays limited.
 *
 * Loose bulk the yard can load:
 *   - Simon's Gold (dairy compost) — 1000
 *   - Nature's Blanket Premium (mulch) — 3000
 *
 * Garden promo bundles (4100–4102) are Phoenix yard pickup when marked
 * phoenixYardPickup: true on the bundle record.
 *
 * Delivery, bags, pallets, totes, and Congress pickup stay available.
 *
 * Product pages may still advertise Congress-only for Simon's Gold bulk
 * (V7 local pricing) even though the Phoenix yard can load it in some flows.
 */
import { resolvePromoBundle } from "./promoBundles.js";

/** Products shown on /products + /qr pay-and-pickup grid (bagged lineup + Sabrina Kills Bugs bottle). */
export const PHOENIX_YARD_PICKUP_GRID_IDS = Object.freeze([111, 1001, 1000, 3000, 1034]);

/**
 * Products whose bagged / pallet / tote lines may use Phoenix yard pickup.
 * (Loose bulk is gated separately below.)
 */
export const PHOENIX_YARD_PICKUP_PRODUCT_IDS = Object.freeze([111, 1001, 1000, 134, 3000, 1034]);

/**
 * Products that can still be paid online (bags, pallets, totes, delivery, Congress).
 */
export const PAY_ONLINE_PRODUCT_IDS = Object.freeze([1000, 134, 3000, 1001, 111, 1034]);

/** Loose bulk the Phoenix yard can actually load (priced SKUs only). */
const PHOENIX_YARD_LOOSE_BULK_PRODUCT_IDS = Object.freeze([1000, 3000]);

/** Products whose bulk pickup UI should only advertise Congress Plant. */
export const CONGRESS_ONLY_BULK_PICKUP_PRODUCT_IDS = Object.freeze([1000]);

export function isCongressOnlyBulkPickupProduct(productId) {
  return CONGRESS_ONLY_BULK_PICKUP_PRODUCT_IDS.includes(Number(productId));
}

export const PHOENIX_YARD_PICKUP_BLOCKED_MESSAGE =
  "One or more items in this cart cannot pick up at the Phoenix yard. Choose Congress pickup or delivery, or remove the blocked items.";

export function isPhoenixYardPickupProduct(productId) {
  return PHOENIX_YARD_PICKUP_PRODUCT_IDS.includes(Number(productId));
}

export function isPayOnlineProduct(productId) {
  return PAY_ONLINE_PRODUCT_IDS.includes(Number(productId));
}

export function isPhoenixYardLooseBulkProduct(productId) {
  return PHOENIX_YARD_LOOSE_BULK_PRODUCT_IDS.includes(Number(productId));
}

/** Loose bulk / cy yard pickup — not walking-floor truckload delivery. */
export function isLooseYardBulkFormat(format) {
  const key = String(format || "").toLowerCase();
  if (!key) return false;
  if (key.includes("truckload") || key.includes("walking") || key.includes("dump")) return false;
  if (key.includes("pallet") || key.includes("tote") || key.includes("supersack") || key.includes("super sack")) {
    return false;
  }
  return key.includes("bulk");
}

export function shouldHidePhoenixYardBulkSize(productId, format) {
  if (!isLooseYardBulkFormat(format)) return false;
  return !isPhoenixYardLooseBulkProduct(productId);
}

function lineFormat(item) {
  return item?.format || item?.sizeOption || item?.size || "";
}

function lineProductId(item) {
  return Number(item?.productId ?? item?.product_id);
}

export function cartItemAllowsPhoenixYardPickup(item) {
  if (!item) return false;
  const bundle = resolvePromoBundle(item);
  if (bundle) return bundle.phoenixYardPickup === true;
  const productId = lineProductId(item);
  if (!Number.isInteger(productId) || productId <= 0) return false;
  if (shouldHidePhoenixYardBulkSize(productId, lineFormat(item))) return false;
  return isPhoenixYardPickupProduct(productId);
}

export function cartAllowsPhoenixYardPickup(items) {
  const list = Array.isArray(items) ? items : [];
  if (list.length === 0) return true;
  return list.every(cartItemAllowsPhoenixYardPickup);
}
