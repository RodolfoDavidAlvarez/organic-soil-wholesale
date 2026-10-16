/** Identify the exact load and delivery options a displayed quote belongs to. */
export function deliveryQuoteKey({ items, zip, roughAccess, semiAccess }) {
  const lines = items.map((item) => [
    String(item.productId ?? item.productName ?? ""),
    String(item.sizeOption ?? item.format ?? ""),
    Number(item.quantity),
    String(item.unit ?? ""),
  ]).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return JSON.stringify([lines, String(zip ?? "").trim(), Boolean(roughAccess), semiAccess !== false]);
}

/** Unbound saved quotes and responses for an older load must never enable payment. */
export function currentDeliveryQuote(binding, requestKey) {
  return binding?.key === requestKey ? binding.quote : null;
}
