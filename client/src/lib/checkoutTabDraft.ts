import { z } from "zod";

const storageKey = "osw-checkout-tab-draft-v1";
const lifetime = 2 * 60 * 60 * 1000;
const fields = z.object({
  fulfillment: z.enum(["pickup", "delivery"]),
  step: z.enum(["fulfillment", "timing", "customer", "review"]),
  pickupSiteId: z.enum(["phoenix", "congress"]),
  pickupMode: z.enum(["asap", "schedule"]).nullable(),
  scheduledAt: z.string().nullable(),
  deliveryAddress: z.object({ street: z.string(), city: z.string(), state: z.string(), zip: z.string() }),
  availabilityPreset: z.enum(["1-3", "this-week", "next-week", "custom"]),
  deliveryFrom: z.string(), deliveryTo: z.string(), deliveryWindow: z.string(),
  roughAccess: z.boolean(), semiAccess: z.boolean(),
  name: z.string(), company: z.string(), customerCategory: z.string(),
  email: z.string(), phone: z.string(), notes: z.string(),
});
const entry = z.object({ cart: z.string(), expires: z.number(), pendingOrder: z.string().nullable(), fields });
type Fields = z.infer<typeof fields>;

function read() {
  const raw = sessionStorage.getItem(storageKey);
  if (!raw) return null;
  const parsed = entry.safeParse(JSON.parse(raw));
  if (parsed.success && parsed.data.expires > Date.now()) return parsed.data;
  sessionStorage.removeItem(storageKey);
  return null;
}

export function readCheckoutDraft(cart: string) {
  try {
    const saved = read();
    // Adding or changing a line used to miss this lookup, because the key
    // includes quantity, and checkout booted back at step 1. Keep the saved
    // step, fulfillment, and customer fields for any cart in this tab.
    void cart;
    return saved?.fields ?? null;
  } catch { return null; }
}

export function saveCheckoutDraft(cart: string, fields: Fields) {
  try {
    const saved = read();
    if (saved?.cart === cart && JSON.stringify(saved.fields) === JSON.stringify(fields)) return;
    sessionStorage.setItem(storageKey, JSON.stringify({ cart, expires: Date.now() + lifetime, pendingOrder: null, fields }));
  } catch { /* storage may be unavailable */ }
}

export function markCheckoutDraftPending(cart: string, orderId: string | number) {
  try {
    const saved = read();
    if (saved?.cart === cart) sessionStorage.setItem(storageKey, JSON.stringify({ ...saved, pendingOrder: String(orderId) }));
  } catch { /* storage may be unavailable */ }
}

export function clearCheckoutDraft(confirmedOrderId?: string) {
  try {
    if (confirmedOrderId === undefined || read()?.pendingOrder === confirmedOrderId) sessionStorage.removeItem(storageKey);
  } catch { /* storage may be unavailable */ }
}
