import { useEffect, useState } from "react";
import { stockForLine, stockKey, type StockMap } from "@shared/inventoryStock.js";
import {
  cardStockBadge,
  primaryBagSizeOption,
  saleAppliesToSize,
  checkoutStockNote,
  saleCountdownLabel,
  stockLineCopy,
} from "@shared/stockUrgency.js";
import { cn } from "@/lib/utils";

const toneClass = {
  ok: "text-[#264027]",
  fast: "text-amber-700",
  low: "text-amber-800",
  out: "text-red-700",
} as const;

const badgeToneClass = {
  ok: "bg-white/95 text-[#264027] ring-stone-200",
  fast: "bg-amber-50 text-amber-800 ring-amber-200",
  low: "bg-amber-50 text-amber-900 ring-amber-300",
  out: "bg-red-50 text-red-700 ring-red-200",
} as const;

function useNow(active: boolean) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, [active]);
  return now;
}

/** Product-page stock sentence plus the sale countdown. Hidden when untracked. */
export function StockUrgencyLine({
  entry,
  sizeOption,
}: {
  entry: { available: number; provisional?: boolean; baseline?: number } | null | undefined;
  sizeOption: string | null | undefined;
}) {
  const now = useNow(Boolean(entry && sizeOption));
  if (!entry || !sizeOption) return null;
  const line = stockLineCopy(entry, sizeOption, now);
  if (!line) return null;
  const countdown = saleAppliesToSize(sizeOption, now) ? saleCountdownLabel(now) : null;
  return (
    <div data-testid="stock-line" className="mb-3 flex min-h-5 flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
      <p className={cn("text-sm font-semibold leading-snug", toneClass[line.tone])}>{line.text}</p>
      {countdown ? (
        <p data-testid="sale-countdown" className="text-xs font-medium leading-snug text-stone-500">
          {countdown}
        </p>
      ) : null}
    </div>
  );
}

/** Small overlay for a product card. Uses the primary bag. */
export function StockLeftBadge({
  productId,
  stockMap,
  className,
}: {
  productId: number;
  stockMap: StockMap | null | undefined;
  className?: string;
}) {
  const size = primaryBagSizeOption(productId);
  const entry = size && stockMap ? stockMap[stockKey(productId, size)] : null;
  const badge = cardStockBadge(entry);
  if (!badge) return null;
  return (
    <span
      data-testid="stock-card-badge"
      className={cn(
        "pointer-events-none absolute bottom-1.5 left-1.5 z-10 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold leading-none ring-1 sm:text-[11px]",
        badgeToneClass[badge.tone],
        className,
      )}
    >
      {badge.text}
    </span>
  );
}

export function lineStockNote(stockMap: StockMap | null | undefined, item: { productId?: number; format?: string; sizeOption?: string; productName?: string }) {
  const size = item?.format || item?.sizeOption;
  return checkoutStockNote(stockForLine(stockMap, item), size);
}
