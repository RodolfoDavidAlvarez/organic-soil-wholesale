import { useQuery } from "@tanstack/react-query";
import { stockForLine, type StockEntry, type StockMap } from "@shared/inventoryStock.js";

async function fetchStock(productIds: number[]): Promise<StockMap> {
  const res = await fetch(`/api/inventory/stock?productIds=${productIds.join(",")}`);
  if (!res.ok) return {};
  const body = await res.json().catch(() => ({}));
  return (body?.stock ?? {}) as StockMap;
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

export function stockLabel(entry: StockEntry | null | undefined): { text: string; tone: "ok" | "low" | "out" } | null {
  if (!entry) return null;
  if (entry.available <= 0) return { text: "Sold out", tone: "out" };
  if (entry.available <= 10) return { text: `Only ${entry.available} left`, tone: "low" };
  return { text: `${entry.available.toLocaleString()} in stock`, tone: "ok" };
}

export { stockForLine };
