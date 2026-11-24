import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { ChevronDown, ShoppingBag, X } from "lucide-react";
import {
  BLACK_FRIDAY_PROMO,
  isBlackFridaySaleActive,
  isFinalBlackFridayDay,
} from "@shared/blackFridayPromo.js";

const DISMISS_KEY = `osw-promo-dismissed:${BLACK_FRIDAY_PROMO.id}`;
/** The cart and checkout apply the sale price server-side, so the CTA can go straight to shopping. */
const SHOP_HREF = "/products";

/**
 * Local review only: `?bfpreview=1` forces the banner on in `vite dev`.
 * Production builds ignore the parameter, so it cannot leak a promo early.
 */
function devPreviewRequested(): boolean {
  if (!import.meta.env.DEV || typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("bfpreview") === "1";
}

type Props = { onLayoutChange?: () => void };

const BlackFridayBanner = ({ onLayoutChange }: Props) => {
  const preview = useMemo(devPreviewRequested, []);
  const [now, setNow] = useState(() => new Date());
  const [expanded, setExpanded] = useState(false);
  const [dismissed, setDismissed] = useState(() => {
    try {
      return !preview && window.sessionStorage.getItem(DISMISS_KEY) === "1";
    } catch {
      return false;
    }
  });

  // Re-check each minute so the bar appears/disappears at Phoenix midnight.
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const visible = !dismissed && (preview || isBlackFridaySaleActive(now));
  const lastDay = isFinalBlackFridayDay(now);

  useEffect(() => {
    onLayoutChange?.();
  }, [visible, expanded, onLayoutChange]);

  if (!visible) return null;

  const dismiss = () => {
    setDismissed(true);
    try {
      window.sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* private mode: dismiss for this page view only */
    }
  };

  const toggle = () => setExpanded((open) => !open);

  return (
    <section
      aria-label="Black Friday sale"
      data-promo={BLACK_FRIDAY_PROMO.id}
      className="relative overflow-hidden bg-[linear-gradient(110deg,#102a17_0%,#183a23_55%,#24502f_100%)] text-white"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-12 -top-20 h-56 w-56 rounded-full bg-[#d4a94f]/15 blur-2xl"
      />
      <div className="relative mx-auto flex max-w-7xl items-center gap-2 px-3 sm:gap-5 sm:px-4 lg:px-6">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={expanded}
          aria-controls="black-friday-banner-details"
          className="flex min-h-[84px] min-w-0 flex-1 items-center gap-3 py-3 text-left sm:min-h-[100px] sm:gap-6"
        >
          <span className="flex shrink-0 flex-col items-center justify-center rounded-2xl bg-[#d4a94f] px-3.5 py-2 text-[#102a17] shadow-[0_8px_22px_rgba(0,0,0,0.3)] sm:px-5 sm:py-2.5">
            <span className="font-heading text-[2rem] font-black leading-none tracking-tight sm:text-[2.75rem]">
              {BLACK_FRIDAY_PROMO.percent}%
            </span>
            <span className="text-[11px] font-extrabold uppercase tracking-[0.22em] sm:text-[13px]">off</span>
          </span>
          <span className="flex min-w-0 flex-col gap-1">
            <span className="whitespace-nowrap font-heading text-[1.35rem] font-extrabold uppercase leading-none tracking-[0.05em] text-[#f1d48a] sm:text-[2rem]">
              {lastDay ? "Last day" : "Black Friday"}
              <span className="hidden sm:inline">{lastDay ? " · Black Friday" : " sale"}</span>
            </span>
            <span className="text-[12.5px] font-semibold leading-snug text-white/90 sm:text-[17px]">
              <span className="hidden sm:inline">Bags &amp; pallets · now through Cyber Monday, Nov 30</span>
              <span className="whitespace-nowrap text-[14px] sm:hidden">Bags &amp; pallets · thru Mon 11/30</span>
            </span>
            <span className="text-[12px] font-medium leading-snug text-white/75 sm:text-[15px]">
              Online or at the yard. Taken off in your cart.
            </span>
          </span>
          <ChevronDown
            aria-hidden="true"
            className={`ml-auto h-6 w-6 shrink-0 text-[#f1d48a] transition-transform sm:hidden ${expanded ? "rotate-180" : ""}`}
          />
        </button>
        <Link href={SHOP_HREF}>
          <span className="hidden min-h-[52px] shrink-0 cursor-pointer items-center justify-center gap-2 rounded-full bg-[#d4a94f] px-7 text-base font-bold text-[#102a17] shadow-[0_8px_22px_rgba(0,0,0,0.3)] transition-colors hover:bg-[#e2bb66] sm:inline-flex">
            <ShoppingBag aria-hidden="true" className="h-4 w-4" />
            Shop the sale
          </span>
        </Link>
        <button
          type="button"
          onClick={toggle}
          aria-expanded={expanded}
          aria-controls="black-friday-banner-details"
          aria-label={expanded ? "Hide sale details" : "Show sale details"}
          className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-md text-[#f1d48a] hover:bg-white/10 sm:inline-flex"
        >
          <ChevronDown aria-hidden="true" className={`h-6 w-6 transition-transform ${expanded ? "rotate-180" : ""}`} />
        </button>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Hide Black Friday banner"
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-white/70 hover:bg-white/10 hover:text-white"
        >
          <X aria-hidden="true" className="h-5 w-5" />
        </button>
      </div>

      <div
        id="black-friday-banner-details"
        hidden={!expanded}
        className="relative border-t border-white/10 bg-black/20"
      >
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between lg:px-6">
          <div className="space-y-1 text-[15px] leading-snug text-white/90 sm:text-base">
            <p>
              {BLACK_FRIDAY_PROMO.percent}% off the regular price of bagged products and pallets on orders placed now
              through Monday Nov 30 (Phoenix time). Pay online and pick up at the time you choose at checkout. At the
              Phoenix yard during open hours? Scan the QR code at the gate to pay with the sale price.
            </p>
            <p className="text-[13px] text-white/65 sm:text-sm">
              Taken off automatically in your cart. Doesn&apos;t combine with other discounts; you get whichever saves more.
              Delivery fees aren&apos;t discounted. Bulk, totes, truckloads, bottles and garden bundles keep their usual prices.
            </p>
          </div>
          <Link href={SHOP_HREF}>
            <span className="inline-flex min-h-[48px] w-full cursor-pointer items-center justify-center gap-2 rounded-full bg-[#d4a94f] px-6 text-[15px] font-bold text-[#102a17] hover:bg-[#e2bb66] sm:hidden">
              <ShoppingBag aria-hidden="true" className="h-4 w-4" />
              Shop the sale
            </span>
          </Link>
        </div>
      </div>
    </section>
  );
};

export default BlackFridayBanner;
