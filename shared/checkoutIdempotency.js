import { createHash } from "node:crypto";

/** Stable Stripe Idempotency-Key for one cart. Max length stays under 255. */
export function checkoutIdempotencyKey(fingerprint) {
  const hash = createHash("sha256").update(JSON.stringify(fingerprint)).digest("hex").slice(0, 32);
  return `osw-checkout-${hash}`;
}

function minuteIso(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  date.setSeconds(0, 0);
  return date.toISOString();
}

/**
 * Same phone, same priced lines, same fulfillment. ASAP times are bucketed
 * to the minute so a double-tap does not look like a new order.
 */
export function checkoutCartFingerprint({
  phone,
  items,
  fulfillment,
  deliveryZip = null,
  deliveryStreet = null,
  roughAccess = false,
  semiAccess = true,
  discountCode = null,
  locationId = null,
  pickupTime = null,
  deliveryCents = 0,
  schoolDiscountCents = 0,
  volumeDiscountCents = 0,
} = {}) {
  const lines = (Array.isArray(items) ? items : []).map((item) => ({
    id: Number(item.productId),
    size: String(item.sizeOption || item.format || ""),
    qty: Number(item.quantity) || 0,
    cents: Math.round(Number(item.price) * 100),
  })).sort((a, b) => a.id - b.id || a.size.localeCompare(b.size) || a.qty - b.qty);
  return {
    phone: String(phone || "").replace(/\D/g, ""),
    lines,
    fulfillment: fulfillment === "delivery" ? "delivery" : "pickup",
    zip: deliveryZip || null,
    street: String(deliveryStreet || "").trim().toLowerCase(),
    roughAccess: !!roughAccess,
    semiAccess: semiAccess !== false,
    discountCode: String(discountCode || "").trim().toUpperCase() || null,
    locationId: locationId || null,
    pickupMinute: minuteIso(pickupTime),
    deliveryCents: Math.round(Number(deliveryCents) || 0),
    schoolDiscountCents: Math.round(Number(schoolDiscountCents) || 0),
    volumeDiscountCents: Math.round(Number(volumeDiscountCents) || 0),
  };
}

export function checkoutKeyMarker(idempotencyKey) {
  return `checkout_key:${idempotencyKey}`;
}

/**
 * Recent pending order for this cart. The caller retrieves the Stripe
 * session and reuses it when it is still open.
 */
export async function findPendingCheckoutOrder(db, { phone, idempotencyKey, withinMs = 2 * 60 * 60 * 1000 } = {}) {
  if (!db || !phone || !idempotencyKey) return null;
  const since = new Date(Date.now() - withinMs).toISOString();
  const marker = checkoutKeyMarker(idempotencyKey);
  const { data, error } = await db
    .from("orders")
    .select("id, confirmation_code, stripe_checkout_session_id, payment_status, status, notes, created_at")
    .eq("phone", phone)
    .eq("payment_status", "pending")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(8);
  if (error || !Array.isArray(data)) return null;
  return data.find((row) => String(row.notes || "").includes(marker)) || null;
}
