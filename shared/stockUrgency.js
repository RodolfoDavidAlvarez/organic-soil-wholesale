/**
 * Urgency copy for Phoenix yard stock. Untracked lines and failed lookups
 * return null so the storefront hides the line and keeps selling.
 */
import { isBlackFridayEligibleLine, isBlackFridaySaleActive, BLACK_FRIDAY_PROMO } from "./blackFridayPromo.js";
import { stockKey } from "./inventoryStock.js";

/** Canonical size the shop treats as the default bag for a tracked product. */
export function primaryBagSizeOption(productId) {
  const id = Number(productId);
  if (id === 111 || id === 137) return "1.5CF Bag";
  if (id === 1001) return "9lb Bag";
  if (id === 1000) return "1CF Bag";
  if (id === 3000 || id === 134) return "2CF Bag";
  return null;
}

/** How a canonical size is spoken: bags of 1.5 cu ft, pallets, totes. */
export function stockUnitPhrase(sizeOption) {
  const size = String(sizeOption || "");
  if (/pallet/i.test(size)) return { singular: "pallet", plural: "pallets", sizePhrase: "" };
  if (/tote|super sack/i.test(size)) return { singular: "tote", plural: "totes", sizePhrase: "" };
  if (/9\s*lb/i.test(size)) return { singular: "bag", plural: "bags", sizePhrase: "9 lb" };
  if (/1\.5\s*cf|1\.5cf/i.test(size)) return { singular: "bag", plural: "bags", sizePhrase: "1.5 cu ft" };
  if (/2\s*cf|2cf/i.test(size)) return { singular: "bag", plural: "bags", sizePhrase: "2 cu ft" };
  if (/1\s*cf|1cf/i.test(size)) return { singular: "bag", plural: "bags", sizePhrase: "1 cu ft" };
  if (/bag/i.test(size)) return { singular: "bag", plural: "bags", sizePhrase: "" };
  return { singular: "unit", plural: "units", sizePhrase: "" };
}

export function saleAppliesToSize(sizeOption, now = new Date(), promo = BLACK_FRIDAY_PROMO) {
  if (!sizeOption || !isBlackFridaySaleActive(now, promo)) return false;
  return isBlackFridayEligibleLine({ format: sizeOption, sizeOption, mode: "pay" });
}

/**
 * out: none left. low: under 10. fast: under 25% of the confirmed starting
 * count (skipped while the count is still provisional or the baseline is unknown).
 */
export function scarcityTier(entry) {
  if (!entry || !Number.isFinite(Number(entry.available))) return null;
  const available = Math.max(0, Math.floor(Number(entry.available)));
  if (available <= 0) return "out";
  if (available < 10) return "low";
  const baseline = Number(entry.baseline);
  if (entry.provisional !== true && Number.isFinite(baseline) && baseline > 0 && available / baseline < 0.25) {
    return "fast";
  }
  return "ok";
}

function countPhrase(available, unit) {
  const noun = available === 1 ? unit.singular : unit.plural;
  const count = available.toLocaleString("en-US");
  return unit.sizePhrase ? `${count} ${noun} of ${unit.sizePhrase}` : `${count} ${noun}`;
}

/** Product-page sentence. Null when the variant is untracked. */
export function stockLineCopy(entry, sizeOption, now = new Date()) {
  const tier = scarcityTier(entry);
  if (!tier || !sizeOption) return null;
  const unit = stockUnitPhrase(sizeOption);
  const sale = saleAppliesToSize(sizeOption, now);
  const saleSuffix = sale ? " at 30% off" : "";
  if (tier === "out") return { text: "Sold out", tone: "out", tier };
  if (tier === "low") {
    const noun = entry.available === 1 ? unit.singular : unit.plural;
    return { text: `Only ${Math.floor(entry.available)} ${noun} left${saleSuffix}`, tone: "low", tier };
  }
  const counted = countPhrase(Math.floor(Number(entry.available)), unit);
  if (tier === "fast") {
    return { text: `Selling fast · ${counted} left${saleSuffix}`, tone: "fast", tier };
  }
  return { text: `${counted} left${saleSuffix}`, tone: "ok", tier };
}

/** Compact card badge for the primary bag. */
export function cardStockBadge(entry) {
  const tier = scarcityTier(entry);
  if (!tier) return null;
  const available = Math.floor(Number(entry.available));
  if (tier === "out") return { text: "Sold out", tone: "out" };
  if (tier === "low") return { text: `Only ${available} left`, tone: "low" };
  if (tier === "fast") return { text: "Selling fast", tone: "fast" };
  return { text: `${available.toLocaleString("en-US")} left`, tone: "ok" };
}

/** Checkout and cart use the same sentence as the product page, including size and sale. */
export function checkoutStockNote(entry, sizeOption, now = new Date()) {
  return stockLineCopy(entry, sizeOption, now)?.text ?? null;
}

/** One short note under a cart line. */
export function cartStockNote(entry) {
  const tier = scarcityTier(entry);
  if (!tier) return null;
  const available = Math.floor(Number(entry.available));
  if (tier === "out") return "Sold out";
  if (tier === "low") return `Only ${available} left`;
  return `${available.toLocaleString("en-US")} left`;
}

/** "Sale ends Mon 11/30 · Xd Yh left", or null once the window has closed. */
export function saleCountdownLabel(now = new Date(), promo = BLACK_FRIDAY_PROMO) {
  if (!isBlackFridaySaleActive(now, promo)) return null;
  const ms = Date.parse(promo.endsAt) - now.getTime();
  if (!Number.isFinite(ms) || ms <= 0) return null;
  const hoursTotal = Math.floor(ms / 3_600_000);
  const days = Math.floor(hoursTotal / 24);
  const hours = hoursTotal % 24;
  return `Sale ends Mon 11/30 · ${days}d ${hours}h left`;
}

/**
 * First physical count per SKU, expressed as sellable units per variant.
 * mapRows: inventory_variant_map. countRows: inventory_movements kind=count.
 */
export function variantBaselines(mapRows, countRows) {
  const startBySku = {};
  const sorted = [...(countRows || [])].sort((a, b) => String(a.created_at || "").localeCompare(String(b.created_at || "")));
  for (const row of sorted) {
    if (!row?.sku_code || startBySku[row.sku_code] != null || row.on_hand_after == null) continue;
    const start = Number(row.on_hand_after);
    if (Number.isFinite(start)) startBySku[row.sku_code] = start;
  }
  const groups = new Map();
  for (const row of mapRows || []) {
    if (!row) continue;
    const key = stockKey(row.product_id, row.size_option);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  const baselines = {};
  for (const [key, rows] of groups) {
    let min = Infinity;
    let ok = true;
    for (const row of rows) {
      const start = startBySku[row.sku_code];
      const units = Number(row.units_per_item);
      if (!Number.isFinite(start) || !Number.isFinite(units) || units <= 0) {
        ok = false;
        break;
      }
      min = Math.min(min, Math.floor(start / units));
    }
    if (ok && Number.isFinite(min)) baselines[key] = Math.max(0, min);
  }
  return baselines;
}
