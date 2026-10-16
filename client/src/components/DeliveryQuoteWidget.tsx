import { useState, useCallback, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Loader2, Truck, AlertCircle, CheckCircle2, Clock } from "lucide-react";
import { trackEvent } from "@/lib/analytics";
import { deliveryQuoteKey } from "@shared/deliveryQuoteBinding.js";

/** Server response from POST /api/quote/trucking */
export interface TruckingQuote {
  truck: "walking_floor" | "flatbed_moffett" | "hot_shot";
  truckLabel: string;
  originYard: "phoenix" | "congress";
  originLabel: string;
  milesRoundTrip: number;
  hoursRoundTrip: number;
  accessModifier: number;
  costCents: number;
  costDollars: number;
  split?: string | null;
  breakdown: {
    milesOneWay: number;
    hoursOneWay: number;
    hourlyRate: number;
    minFee: number;
    capacityLabel: string;
    loadCount?: number;
    destinationCity?: string | null;
    destinationState?: string | null;
  };
}

interface DeliveryQuoteWidgetProps {
  /** Cart items used to pick the right truck. Pass [{sizeOption, quantity}] */
  items: Array<{ sizeOption: string; quantity: number; unit?: string; productName?: string }>;
  /** Initial ZIP — pre-fill from saved customer profile if available */
  initialZip?: string;
  /** Optional quote carried over from product-page estimate */
  initialQuote?: TruckingQuote | null;
  initialRoughAccess?: boolean;
  initialSemiAccess?: boolean;
  /** Shorter checkbox copy for tight product buy boxes */
  compact?: boolean;
  /**
   * Called every time we have a fresh quote OR the user clears it.
   * - `roughAccess`: hard-to-reach / off-pavement site flag (drives the +20% pricing modifier server-side)
   * - `semiAccess`: customer confirms they have enough space for a semi-truck.
   *   Defaults TRUE. If false, ops needs to call before dispatch.
   */
  onQuote: (
    quote: TruckingQuote | null,
    ctx: { zip: string; roughAccess: boolean; semiAccess: boolean },
  ) => void;
  /** Fires only when the customer taps Get price (not on checkbox re-price). */
  onGetPriceSuccess?: (quote: TruckingQuote, ctx: { zip: string; roughAccess: boolean; semiAccess: boolean }) => void;
  /** Optional className for outer wrapper */
  className?: string;
}

const fmt$ = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export function DeliveryQuoteWidget({
  items,
  initialZip = "",
  initialQuote = null,
  initialRoughAccess = false,
  initialSemiAccess = true,
  compact = false,
  onQuote,
  onGetPriceSuccess,
  className,
}: DeliveryQuoteWidgetProps) {
  const [zip, setZip] = useState(initialZip);
  const [roughAccess, setRoughAccess] = useState(initialRoughAccess);
  // Pre-checked: assume customers have semi-truck access. If they uncheck it,
  // that's the operational red flag we need to know about before dispatching.
  const [semiAccess, setSemiAccess] = useState(initialSemiAccess);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quote, setQuote] = useState<TruckingQuote | null>(initialQuote);
  const requestVersion = useRef(0);
  const itemsKey = deliveryQuoteKey({ items });
  const latestItemsKey = useRef(itemsKey);
  latestItemsKey.current = itemsKey;
  useEffect(() => () => { requestVersion.current += 1; }, []);

  const invalidateQuote = (currentZip: string, currentRough: boolean, currentSemi: boolean) => {
    requestVersion.current += 1;
    setLoading(false);
    setQuote(null);
    setError(null);
    onQuote(null, { zip: currentZip, roughAccess: currentRough, semiAccess: currentSemi });
  };

  const fetchQuote = useCallback(
    async (
      currentZip: string,
      currentRough: boolean,
      currentSemi: boolean,
    ): Promise<TruckingQuote | null> => {
      const version = ++requestVersion.current;
      const isCurrent = () => version === requestVersion.current && itemsKey === latestItemsKey.current;
      const cleanZip = (currentZip || "").trim();
      if (!/^\d{5}$/.test(cleanZip)) {
        setError("Enter a 5-digit ZIP");
        setQuote(null);
        onQuote(null, { zip: cleanZip, roughAccess: currentRough, semiAccess: currentSemi });
        trackEvent("Delivery Quote Failed", {
          reason: "invalid_zip",
          item_count: items.length,
          rough_access: currentRough,
          semi_access: currentSemi,
        });
        return null;
      }
      if (items.length === 0) {
        setError("Add a product first");
        trackEvent("Delivery Quote Failed", {
          reason: "empty_cart",
          item_count: 0,
          rough_access: currentRough,
          semi_access: currentSemi,
        });
        return null;
      }
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/quote/trucking", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items, zip: cleanZip, roughAccess: currentRough }),
        });
        const data = await res.json();
        if (!isCurrent()) return null;
        if (!res.ok) throw new Error(data?.error || "Could not price delivery");
        setQuote(data);
        onQuote(data, { zip: cleanZip, roughAccess: currentRough, semiAccess: currentSemi });
        trackEvent("Delivery Quote Created", {
          truck: data.truck,
          origin_yard: data.originYard,
          miles_round_trip: data.milesRoundTrip,
          cost_dollars: data.costDollars,
          item_count: items.length,
          rough_access: currentRough,
          semi_access: currentSemi,
        });
        return data as TruckingQuote;
      } catch (err) {
        if (!isCurrent()) return null;
        const msg = err instanceof Error ? err.message : "Could not price delivery";
        setError(msg);
        setQuote(null);
        onQuote(null, { zip: cleanZip, roughAccess: currentRough, semiAccess: currentSemi });
        trackEvent("Delivery Quote Failed", {
          reason: msg.slice(0, 80),
          item_count: items.length,
          rough_access: currentRough,
          semi_access: currentSemi,
        });
        return null;
      } finally {
        if (isCurrent()) setLoading(false);
      }
    },
    [items, itemsKey, onQuote]
  );

  const handleGetPrice = async () => {
    const next = await fetchQuote(zip, roughAccess, semiAccess);
    if (next) {
      onGetPriceSuccess?.(next, { zip: zip.trim(), roughAccess, semiAccess });
    }
  };

  const handleRoughToggle = (checked: boolean) => {
    setRoughAccess(checked);
    invalidateQuote(zip, checked, semiAccess);
    // If we already have a quote for this ZIP, re-fetch with the new modifier
    if (quote) fetchQuote(zip, checked, semiAccess);
  };

  const handleSemiToggle = (checked: boolean) => {
    setSemiAccess(checked);
    invalidateQuote(zip, roughAccess, checked);
    if (quote) fetchQuote(zip, roughAccess, checked);
  };

  // Allow Enter in the ZIP field to fetch a quote without bubbling up to the
  // parent <form> (the widget is embedded inside Checkout's main form).
  const handleZipKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleGetPrice();
    }
  };

  return (
    <div className={className}>
      <div className="space-y-3">
        <div>
          <Label htmlFor="delivery-zip" className="text-xs font-semibold uppercase tracking-wider text-stone-500">
            Delivery ZIP <span className="text-red-500">*</span>
          </Label>
          <div className="mt-1 flex gap-2">
            <Input
              id="delivery-zip"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={5}
              value={zip}
              onChange={(e) => {
                const nextZip = e.target.value.replace(/\D/g, "").slice(0, 5);
                setZip(nextZip);
                invalidateQuote(nextZip, roughAccess, semiAccess);
              }}
              onKeyDown={handleZipKeyDown}
              placeholder="85308"
              className="flex-1 h-11 text-base"
              autoComplete="postal-code"
            />
            <Button
              type="button"
              onClick={handleGetPrice}
              disabled={loading || zip.length !== 5}
              className="h-11 px-4"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Get price"}
            </Button>
          </div>
        </div>

        {/* Pre-checked positive question: we assume semi access by default.
            Customer un-ticking it is the operational flag we need. */}
        <label className="flex items-start gap-2 cursor-pointer text-sm text-stone-700">
          <input
            type="checkbox"
            checked={semiAccess}
            onChange={(e) => handleSemiToggle(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-stone-300"
          />
          <span className="leading-snug">
            {compact
              ? "Site has room for a semi to unload"
              : "I have enough space at my site for a semi-truck to deliver and unload."}
            {!compact && (
              <span className="mt-0.5 block text-[11px] text-stone-500">
                Uncheck if you're not sure — we'll call you to confirm before we dispatch.
              </span>
            )}
          </span>
        </label>

        {!semiAccess && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
            {compact
              ? "We'll call to confirm access before dispatch."
              : "Got it. We'll call you before scheduling to confirm access and figure out the best way in."}
          </div>
        )}

        {/* Soft, no-price-anchor wording — customers were avoiding the box when
            it was labeled "(+20%)". The pricing modifier still applies server-side
            and shows up in the refreshed quote. */}
        <label className="flex items-start gap-2 cursor-pointer text-sm text-stone-700">
          <input
            type="checkbox"
            checked={roughAccess}
            onChange={(e) => handleRoughToggle(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-stone-300"
          />
          <span className="leading-snug">
            {compact ? "Hard to reach / off-pavement site" : "My site is hard to reach or off-pavement."}
            {!compact && (
              <span className="mt-0.5 block text-[11px] text-stone-500">
                Narrow driveway, dirt road, steep grade, or no truck turnaround.
              </span>
            )}
          </span>
        </label>
      </div>

      {error && (
        <div className="mt-3 flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2.5 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {quote && !error && (
        <div className="mt-3 rounded-xl border border-stone-200 bg-stone-50 p-3 sm:p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-2">
              <Truck className="mt-0.5 h-5 w-5 shrink-0 text-[#264027]" />
              <div className="min-w-0">
                <p className="text-sm font-bold text-stone-900">
                  Delivery cost{" "}
                  <span className="text-[#264027]">{fmt$(quote.costDollars)}</span>
                </p>
                <p className="mt-0.5 text-xs text-stone-600">
                  {quote.truckLabel} · Congress, AZ →{" "}
                  {quote.breakdown.destinationCity ?? `ZIP ${zip}`}
                  {quote.breakdown.destinationState ? `, ${quote.breakdown.destinationState}` : ""}
                </p>
                {!compact && (
                  <p className="text-xs text-stone-600">
                    ~{quote.milesRoundTrip} mi round-trip · ~{quote.hoursRoundTrip} hr
                  </p>
                )}
                {quote.breakdown.loadCount && quote.breakdown.loadCount > 1 ? (
                  <p className="text-xs font-semibold text-[#264027]">
                    {quote.breakdown.loadCount} delivery loads included
                  </p>
                ) : null}
              </div>
            </div>
          </div>
          <p className="mt-2.5 flex items-center gap-1.5 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-900">
            <Clock className="h-3.5 w-3.5 shrink-0 text-emerald-700" />
            Usually delivered within 1–3 business days
          </p>
          {quote.split === "mixed" && (
            <p className="mt-2 flex items-start gap-1.5 text-[11px] text-stone-600">
              <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-emerald-700" />
              Your order mixes bulk and pallets — we&apos;ll split it across two trips. We&apos;ll confirm before
              dispatch.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default DeliveryQuoteWidget;
