import { DELIVERY_PRICING_VERSION } from "@shared/deliveryPricing.js";
import type { TruckingQuote } from "@/components/DeliveryQuoteWidget";

const STORAGE_KEY = "osw-delivery-draft";

export type DeliveryDraft = {
  zip: string;
  roughAccess: boolean;
  semiAccess: boolean;
  quote: TruckingQuote | null;
  city?: string | null;
  state?: string | null;
  updatedAt: string;
};

export function saveDeliveryDraft(draft: Omit<DeliveryDraft, "updatedAt">): void {
  try {
    const payload: DeliveryDraft = {
      ...draft,
      updatedAt: new Date().toISOString(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* ignore quota / private mode */
  }
}

export function loadDeliveryDraft(): DeliveryDraft | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DeliveryDraft;
    if (!parsed || typeof parsed.zip !== "string") return null;
    // Keep the customer's ZIP and access preferences, but never reuse a
    // saved delivery price from an earlier pricing policy.
    if (parsed.quote?.pricingVersion !== DELIVERY_PRICING_VERSION) parsed.quote = null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearDeliveryDraft(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
