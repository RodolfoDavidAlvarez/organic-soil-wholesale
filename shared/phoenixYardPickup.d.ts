export const PHOENIX_YARD_PICKUP_PRODUCT_IDS: readonly number[];
export const PHOENIX_YARD_PICKUP_GRID_IDS: readonly number[];
export const PAY_ONLINE_PRODUCT_IDS: readonly number[];
export const CONGRESS_ONLY_BULK_PICKUP_PRODUCT_IDS: readonly number[];
export const PHOENIX_YARD_PICKUP_BLOCKED_MESSAGE: string;

export function isCongressOnlyBulkPickupProduct(productId?: number | string | null): boolean;

export function isPhoenixYardPickupProduct(productId?: number | string | null): boolean;
export function isPayOnlineProduct(productId?: number | string | null): boolean;
export function isPhoenixYardLooseBulkProduct(productId?: number | string | null): boolean;
export function isLooseYardBulkFormat(format?: string | null): boolean;
export function shouldHidePhoenixYardBulkSize(
  productId?: number | string | null,
  format?: string | null,
): boolean;
export function cartItemAllowsPhoenixYardPickup(item?: Record<string, unknown> | null): boolean;
export function cartAllowsPhoenixYardPickup(items?: Array<Record<string, unknown>> | null): boolean;
