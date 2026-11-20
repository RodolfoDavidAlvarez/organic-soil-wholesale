export const PROMO_BUNDLE_PRODUCT_IDS: readonly number[];

export type PromoBundleItem = {
  bagCount: number;
  name: string;
  amount: string;
  image: string;
  alt: string;
  href: string;
};

export type PromoBundle = {
  productId: number;
  slug: string;
  aliases: string[];
  eyebrow: string;
  title: string;
  shortTitle: string;
  listCaption: string;
  lpHeadline: string;
  lpLine: string;
  lpUse: string;
  description: string;
  heroImage: string;
  bannerImage: string;
  heroAlt: string;
  listPrice: number;
  salePrice: number;
  savings: number;
  badge: string;
  format: string;
  includedLabel: string;
  unit: string;
  volumeLabel: string;
  bagLabel: string;
  bedLabel: string;
  idealFor: string;
  result: string;
  pickupNote: string;
  phoenixYardPickup: boolean;
  items: PromoBundleItem[];
};

export const PROMO_BUNDLES: readonly PromoBundle[];
export function isPromoBundleProductId(productId?: number | string | null): boolean;
export function getPromoBundleBySlug(slug?: string | null): PromoBundle | null;
export function getPromoBundleByProductId(productId?: number | string | null): PromoBundle | null;
export function resolvePromoBundle(item?: Record<string, unknown> | null): PromoBundle | null;
export function promoBundleHref(productId?: number | string | null): string | null;
export function promoBundleCartItem(bundle: PromoBundle, quantity?: number): Record<string, unknown>;
export function applyPromoBundlePricing<T extends Record<string, unknown>>(item: T): T;
export function nonBundleProductSubtotal(items?: Array<Record<string, unknown>>): number;
