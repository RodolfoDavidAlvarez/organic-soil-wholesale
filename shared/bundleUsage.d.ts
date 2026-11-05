import type { PromoBundleItem } from "./promoBundles.js";
export interface BundleUsage {
  purpose: string;
  nextUse: string;
  bags: number;
  volume: number;
  perBag: string;
  coverage: string;
  application: string;
}
export function getBundleUsage(item?: PromoBundleItem): BundleUsage | null;
