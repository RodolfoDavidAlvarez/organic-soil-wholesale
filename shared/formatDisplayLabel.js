/**
 * Customer-facing size names. Cart and checkout keep the V5 canonical
 * format (`1CF Bag`, `Tote`) on the item for pricing and inventory.
 */
export function formatDisplayLabel(productId, format) {
  const size = String(format || "");
  const id = Number(productId);
  if (!size || /pallet/i.test(size)) return size;
  if (/9\s*lb/i.test(size)) return "9 lb Bag";
  if (/1\.5\s*cf|1\.5cf/i.test(size)) return "1.5 cu ft Bag (~50 lb)";
  if (/2\s*cf|2cf/i.test(size)) return "2 cu ft Bag (~60 lb)";
  if (/1\s*cf|1cf/i.test(size)) {
    if (id === 137 || id === 111) return "1.5 cu ft Bag (~50 lb)";
    if (id === 1000) return "1 cu ft Bag (~50 lb)";
    return "40 lb Bag (1 cu ft)";
  }
  if (/tote|super\s*sack/i.test(size)) return "Super Sack";
  return size;
}
