/**
 * OSW storefront stock (Phoenix yard).
 *
 * Stock lives in Supabase: inventory_stock (per physical SKU: bags / totes),
 * inventory_variant_map (product + canonical size -> SKU x units; pallets = N
 * bags, bundles = their component bags) and inventory_variant_availability
 * (sellable units per variant). Paid orders decrement automatically and
 * cancelled/refunded orders restock, via DB triggers on orders/order_items.
 *
 * Variants without a map row are untracked: no stock badge and no limit.
 */
import { resolvePromoBundle } from "./promoBundles.js";
import { resolveV5CartPricing } from "./oswPricing.js";

/** Canonical {productId, sizeOption} the inventory map uses for a cart line. */
export function inventoryKeyForLine(item) {
  if (!item) return null;
  const bundle = resolvePromoBundle(item);
  if (bundle) return { productId: bundle.productId, sizeOption: bundle.format };
  const pricing = resolveV5CartPricing(item);
  if (pricing) return { productId: pricing.productId, sizeOption: pricing.format };
  const productId = Number(item.productId ?? item.product_id);
  const sizeOption = item.sizeOption ?? item.size_option ?? item.format;
  return Number.isFinite(productId) && sizeOption ? { productId, sizeOption: String(sizeOption) } : null;
}

export const stockKey = (productId, sizeOption) => `${Number(productId)}|${sizeOption}`;

/** Look up availability for a line in a stock map from /api/inventory/stock. */
export function stockForLine(stockMap, item) {
  const key = inventoryKeyForLine(item);
  if (!key || !stockMap) return null;
  return stockMap[stockKey(key.productId, key.sizeOption)] ?? null;
}

/** Items payload for the inventory_check_cart RPC. */
export function inventoryCheckItems(items) {
  return (Array.isArray(items) ? items : [])
    .filter((item) => item && item.mode !== "quote")
    .map((item) => {
      const key = inventoryKeyForLine(item);
      const quantity = Math.max(0, Number(item.quantity) || 0);
      return key && quantity > 0 ? { product_id: key.productId, size_option: key.sizeOption, quantity } : null;
    })
    .filter(Boolean);
}

export function stockShortageMessage(shortages) {
  const list = (Array.isArray(shortages) ? shortages : []).map((s) => {
    const left = Math.max(0, Math.floor(Number(s.on_hand) || 0));
    return `${s.label}: ${left} left`;
  });
  return list.length
    ? `Not enough stock for this order right now (${list.join("; ")}). Lower the quantity or call us to order.`
    : null;
}
