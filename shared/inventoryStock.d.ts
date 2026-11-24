export type StockEntry = { available: number; provisional: boolean };
export type StockMap = Record<string, StockEntry>;
export function inventoryKeyForLine(item: Record<string, unknown> | null | undefined): { productId: number; sizeOption: string } | null;
export function stockKey(productId: number | string, sizeOption: string): string;
export function stockForLine(stockMap: StockMap | null | undefined, item: Record<string, unknown>): StockEntry | null;
export function inventoryCheckItems(items: Array<Record<string, unknown>>): Array<{ product_id: number; size_option: string; quantity: number }>;
export function stockShortageMessage(shortages: Array<{ label: string; on_hand: number }>): string | null;
