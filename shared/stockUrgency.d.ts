export type StockTone = "ok" | "fast" | "low" | "out";
export type ScarcityTier = StockTone;
export type StockEntryLike = { available: number; provisional?: boolean; baseline?: number };
export function primaryBagSizeOption(productId: number | string): string | null;
export function stockUnitPhrase(sizeOption: string): { singular: string; plural: string; sizePhrase: string };
export function saleAppliesToSize(sizeOption: string, now?: Date): boolean;
export function scarcityTier(entry: StockEntryLike | null | undefined): ScarcityTier | null;
export function stockLineCopy(entry: StockEntryLike | null | undefined, sizeOption: string, now?: Date): { text: string; tone: StockTone; tier: ScarcityTier } | null;
export function cardStockBadge(entry: StockEntryLike | null | undefined): { text: string; tone: StockTone } | null;
export function cartStockNote(entry: StockEntryLike | null | undefined): string | null;
export function saleCountdownLabel(now?: Date): string | null;
export function variantBaselines(
  mapRows: Array<{ product_id: number; size_option: string; sku_code: string; units_per_item: number }>,
  countRows: Array<{ sku_code: string; on_hand_after: number; created_at?: string }>,
): Record<string, number>;
