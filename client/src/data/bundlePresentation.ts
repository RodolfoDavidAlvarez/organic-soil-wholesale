/** Individual bag totals for the confirmed local individual bag pricing. */
/** À la carte totals from current bag prices: Simon's $14.95, Mikey's $34.90, PlantPal $10.99, mulch $10.99. */
export const bundleComparison: Record<string, number> = {
  "garden-refresh": 169.6,
  "garden-refresh-plus": 247.57,
  "big-garden-setup": 527.17,
};
export const comparisonPrice = (amount: number) => `$${amount.toFixed(2)}`;
export const bundleGroupImages: Record<string, string> = {
  "garden-refresh": "/images/bundles/garden-refresh-original-illustration.webp",
  "garden-refresh-plus": "/images/bundles/garden-refresh-plus-group.webp",
  "big-garden-setup": "/images/bundles/big-garden-setup-approved.webp",
};
