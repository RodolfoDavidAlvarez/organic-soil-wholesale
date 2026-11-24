import { useQuery } from "@tanstack/react-query";
import { stockForLine, type StockEntry, type StockMap } from "@shared/inventoryStock.js";
import { cardStockBadge, cartStockNote } from "@shared/stockUrgency.js";

async function fetchStock(productIds: number[]): Promise<StockMap> {
  try {
    const res = await fetch(`/api/inventory/stock?productIds=${productIds.join(",")}`);
    if (!res.ok) return {};
    const body = await res.json().catch(() => ({}));
    return (body?.stock ?? {}) as StockMap;
  } catch {
    return {};
  }
}

/** Phoenix yard stock for the given products. Untracked variants are absent. */
export function useInventoryStock(productIds: Array<number | undefined | null>) {
  const ids = Array.from(new Set(productIds.filter((id): id is number => Number.isInteger(id)))).sort((a, b) => a - b);
  return useQuery({
    queryKey: ["inventoryStock", ids.join(",")],
    queryFn: () => fetchStock(ids),
    enabled: ids.length > 0,
    staleTime: 30 * 1000,
    refetchOnWindowFocus: true,
  });
}

/** Short card/cart label. Null when the variant is untracked. */
export function stockLabel(entry: StockEntry | null | undefined): { text: string; tone: "ok" | "fast" | "low" | "out" } | null {
  return cardStockBadge(entry);
}

export { cartStockNote };

export { stockForLine };
