/** Individual bag totals for the locally proposed pricing preview. */
export const bundleComparison: Record<string, number> = {
  "garden-refresh": 189.70,
  "garden-refresh-plus": 286.72,
  "big-garden-setup": 558.32,
};
export const comparisonPrice = (amount: number) => `$${amount.toFixed(2)}`;
export const bundleGroupImages: Record<string, string> = {
  "garden-refresh": "/images/bundles/garden-refresh-original-illustration.webp",
  "garden-refresh-plus": "/images/bundles/garden-refresh-plus-group.webp",
  "big-garden-setup": "/images/bundles/big-garden-setup-approved.webp",
};
