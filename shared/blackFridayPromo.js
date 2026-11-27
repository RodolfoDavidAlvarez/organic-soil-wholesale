/**
 * Black Friday through Cyber Monday 2026: 30% off at Organic Soil Wholesale.
 *
 * Source: Nov 24, 2026 team meeting, then the owner's written instruction the
 * same day: start as soon as it is ready, run continuously through Cyber
 * Monday, online purchases and walk-in pickup, no stacking, never discount
 * delivery fees or gift cards.
 *
 * ASSUMPTIONS (judgment calls, change here if the owner decides otherwise):
 *   1. Window: STARTS_AT (Nov 24, 2026 00:00 Phoenix, so it is live from the
 *      moment it is deployed) until ENDS_AT (Dec 1, 2026 00:00 Phoenix,
 *      i.e. the end of Monday Nov 30). Sunday Nov 29 is included because the
 *      owner said "continuously". Arizona has no DST, so UTC-7 throughout.
 *   2. Eligible lines: bagged products and bagged pallets, the same scope the
 *      business already uses for its 30% school rate. Not eligible: bulk /
 *      loose yards, totes and super sacks, truckloads, bottles and gallons,
 *      garden bundles (they are already a package price), delivery/trucking,
 *      and anything that is a gift card.
 *   3. Sale price = 30% off the regular (list) unit price, rounded to the cent.
 *      A pallet that is normally 20% off is therefore 30% off list, not 20%+30%.
 *   4. No stacking. The order gets EITHER the sale prices OR the existing
 *      discounts (pallet price, bag volume tier, full-flatbed 10%), whichever
 *      makes the product total lower. Never both.
 *   5. School codes give the same 30% on the same lines, so during the sale a
 *      school code is set aside (not redeemed, not used up). The developer
 *      TEST code keeps its existing behavior.
 *   6. Kill switch: set `enabled: false` and redeploy. The server enforces the
 *      window on every checkout, so the sale stops on time with no deploy.
 */

import { isPalletVolumeLine, isRetailBagLine } from './baggedVolumeDiscount.js';
import { resolvePromoBundle } from './promoBundles.js';

export const BLACK_FRIDAY_PROMO = Object.freeze({
  id: 'black-friday-2026',
  percent: 30,
  timeZone: 'America/Phoenix',
  startsAt: '2026-11-24T00:00:00-07:00',
  /** Exclusive. The last second of the sale is Mon Nov 30 23:59:59 Phoenix. */
  endsAt: '2026-12-01T00:00:00-07:00',
  enabled: true,
  scopeLabel: 'bags & pallets',
});

const toMs = (value) => (value instanceof Date ? value.getTime() : new Date(value).getTime());

export function isBlackFridaySaleActive(now = new Date(), promo = BLACK_FRIDAY_PROMO) {
  if (!promo.enabled) return false;
  const t = toMs(now);
  if (!Number.isFinite(t)) return false;
  return t >= Date.parse(promo.startsAt) && t < Date.parse(promo.endsAt);
}

/** Calendar date (YYYY-MM-DD) for `now` in America/Phoenix (fixed UTC-7). */
export function phoenixDateKey(now = new Date()) {
  const t = toMs(now);
  if (!Number.isFinite(t)) return null;
  return new Date(t - 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** True on Monday Nov 30, for "last day" copy. */
export function isFinalBlackFridayDay(now = new Date(), promo = BLACK_FRIDAY_PROMO) {
  return isBlackFridaySaleActive(now, promo) && phoenixDateKey(now) === '2026-11-30';
}

function isGiftCardLine(item) {
  const text = `${item?.name || ''} ${item?.productName || ''} ${item?.format || ''} ${item?.sizeOption || ''} ${item?.unit || ''}`.toLowerCase();
  return /gift\s*card|giftcard|e-?gift/.test(text);
}

export function isBlackFridayEligibleLine(item) {
  if (!item || item.mode === 'quote') return false;
  if (resolvePromoBundle(item) || isGiftCardLine(item)) return false;
  return isRetailBagLine(item) || isPalletVolumeLine(item);
}

function cents(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round((n + Number.EPSILON) * 100) : NaN;
}

function currentUnitCents(item) {
  return cents(item?.unitPrice ?? item?.price);
}

/** Regular (list) price in cents. Falls back to the current price when no list price is known. */
function listUnitCents(item) {
  const current = currentUnitCents(item);
  const list = cents(item?.listUnitPrice ?? item?.list_price);
  return Number.isFinite(list) && list > current ? list : current;
}

export function blackFridayUnitCents(item, promo = BLACK_FRIDAY_PROMO) {
  const list = listUnitCents(item);
  if (!Number.isFinite(list) || list <= 0) return NaN;
  return Math.round(list * (100 - promo.percent) / 100);
}

/**
 * Price one PDP bag or pallet card. Catalog `unitPrice` stays the regular
 * charge (pallet cards pass the 20% price). When the sale is the larger
 * savings, the card shows 30% off list instead. The two discounts do not stack.
 */
export function retailOfferPrice({ productId, format, unitPrice, listUnitPrice, now = new Date(), promo = BLACK_FRIDAY_PROMO } = {}) {
  const current = Number(unitPrice);
  const list = Number(listUnitPrice ?? unitPrice);
  const item = {
    productId,
    format,
    sizeOption: format,
    unitPrice: current,
    price: current,
    listUnitPrice: Number.isFinite(list) && list > current ? list : current,
    quantity: 1,
    mode: "pay",
  };
  const active = isBlackFridaySaleActive(now, promo);
  if (!active || !Number.isFinite(current) || current < 0) {
    return { active, onSale: false, price: current, compareAt: null, badge: null };
  }
  if (!isBlackFridayEligibleLine(item)) {
    return { active, onSale: false, price: current, compareAt: null, badge: null, notOnSale: true };
  }
  const saleCents = blackFridayUnitCents(item, promo);
  const currentCents = Math.round((current + Number.EPSILON) * 100);
  if (!Number.isFinite(saleCents) || saleCents >= currentCents) {
    return { active, onSale: false, price: current, compareAt: null, badge: null };
  }
  const compareCents = Math.round(((Number.isFinite(list) && list > saleCents / 100 ? list : current) + Number.EPSILON) * 100);
  return {
    active,
    onSale: true,
    notOnSale: false,
    price: saleCents / 100,
    compareAt: compareCents / 100,
    badge: `${promo.percent}% off`,
  };
}

/**
 * Decide sale vs. existing discounts for one cart.
 *
 * `items` are the catalog-priced lines BEFORE any flatbed adjustment (the
 * client's pay items, or the server's normalizeV5CheckoutItems output).
 * `existingOffCents` is what the existing rules take off those lines
 * (flatbed 10% + bag volume tier). Embedded pallet prices are already in the
 * line prices on both sides.
 */
export function blackFridayQuote({ items, existingOffCents = 0, now = new Date(), promo = BLACK_FRIDAY_PROMO } = {}) {
  const lines = (Array.isArray(items) ? items : []).filter((item) => item && item.mode !== 'quote');
  const active = isBlackFridaySaleActive(now, promo);
  const currentCents = lines.reduce((sum, item) => sum + currentUnitCents(item) * (Number(item.quantity) || 0), 0);
  const existingCents = currentCents - Math.max(0, Math.round(Number(existingOffCents) || 0));
  let saleCents = 0;
  let eligibleLines = 0;
  let listOfEligibleCents = 0;
  const priced = lines.map((item) => {
    const quantity = Number(item.quantity) || 0;
    if (!active || !isBlackFridayEligibleLine(item)) {
      saleCents += currentUnitCents(item) * quantity;
      return { item, eligible: false, unitCents: currentUnitCents(item) };
    }
    const unitCents = blackFridayUnitCents(item, promo);
    if (!Number.isFinite(unitCents) || unitCents >= currentUnitCents(item)) {
      saleCents += currentUnitCents(item) * quantity;
      return { item, eligible: false, unitCents: currentUnitCents(item) };
    }
    eligibleLines += 1;
    listOfEligibleCents += listUnitCents(item) * quantity;
    saleCents += unitCents * quantity;
    return { item, eligible: true, unitCents, listCents: listUnitCents(item) };
  });
  const wins = active && eligibleLines > 0 && saleCents < existingCents;
  return {
    active,
    applies: wins,
    percent: promo.percent,
    eligibleLines,
    currentCents,
    existingCents,
    saleCents,
    /** Extra savings vs. what the existing rules would charge. */
    extraSavingsCents: wins ? existingCents - saleCents : 0,
    /** Savings vs. regular price on the sale lines (for "You save" copy). */
    saleSavingsCents: wins ? listOfEligibleCents - Math.round(listOfEligibleCents * (100 - promo.percent) / 100) : 0,
    priced,
  };
}

/**
 * Server helper: return checkout items carrying the sale unit price so the
 * order rows and the Stripe line items charge exactly that price.
 */
export function applyBlackFridayPrices(quote) {
  if (!quote?.applies) return null;
  return quote.priced.map(({ item, eligible, unitCents, listCents }) => {
    if (!eligible) return item;
    const price = unitCents / 100;
    const list = listCents / 100;
    return {
      ...item,
      price,
      unitPrice: price,
      listUnitPrice: list,
      savingsPerUnit: Math.round((list - price) * 100) / 100,
      discountPercent: BLACK_FRIDAY_PROMO.percent,
      promoId: BLACK_FRIDAY_PROMO.id,
    };
  });
}

export function blackFridayOrderNote(quote) {
  if (!quote?.applies) return null;
  return `Black Friday sale: ${BLACK_FRIDAY_PROMO.percent}% off list on ${quote.eligibleLines} bag/pallet line(s), saves $${(quote.saleSavingsCents / 100).toFixed(2)} vs regular. Replaces pallet, bag volume and flatbed discounts (no stacking). Delivery not discounted.`;
}
