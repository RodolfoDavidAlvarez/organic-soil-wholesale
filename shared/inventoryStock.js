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

/**
 * A variant map row with no inventory_stock row is zero on hand.
 * Variants with no map row stay untracked and are not listed here.
 * Lookup errors should not call this with a failed query result; the caller
 * fails open when the tables cannot be read.
 */
export function missingTrackedStock(checkItems, mapRows, stockRows) {
  const present = new Set((stockRows || []).map((row) => row?.sku_code).filter(Boolean));
  const seen = new Set();
  const shortages = [];
  for (const item of checkItems || []) {
    const maps = (mapRows || []).filter((row) =>
      Number(row?.product_id) === Number(item?.product_id) && row?.size_option === item?.size_option
    );
    for (const map of maps) {
      if (!map?.sku_code || present.has(map.sku_code) || seen.has(map.sku_code)) continue;
      seen.add(map.sku_code);
      shortages.push({
        sku_code: map.sku_code,
        label: map.size_option || item.size_option,
        requested: item.quantity,
        on_hand: 0,
      });
    }
  }
  return shortages;
}

/** Read the variant map and stock rows. Returns [] when the lookup itself fails. */
export async function findMissingTrackedStock(db, checkItems) {
  if (!db || !checkItems?.length) return [];
  const { data: maps, error: mapError } = await db
    .from("inventory_variant_map")
    .select("product_id, size_option, sku_code")
    .eq("location_code", "phx");
  if (mapError) {
    console.error("[checkout] variant map lookup failed (allowing order):", mapError.message);
    return [];
  }
  const needed = missingTrackedStock(checkItems, maps, []);
  if (!needed.length) return [];
  const skus = needed.map((row) => row.sku_code);
  const { data: stock, error: stockError } = await db
    .from("inventory_stock")
    .select("sku_code")
    .eq("location_code", "phx")
    .in("sku_code", skus);
  if (stockError) {
    console.error("[checkout] stock row lookup failed (allowing order):", stockError.message);
    return [];
  }
  return missingTrackedStock(checkItems, maps, stock);
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
