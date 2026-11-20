/**
 * Bagged volume tiers for Organic Soil Wholesale checkout.
 *
 * Mixed cart under a pallet:
 *   $500 of bags = 10% off those bags
 *   $1,500 of bags = 20% off those bags
 *
 * Pallets already carry their own 20% volume price. That and these cart
 * tiers are one volume discount. A pallet line turns the cart tiers off.
 * Totes, loose bulk, truckloads, bottles, and garden bundles stay at their
 * set price. A group code never stacks with this. The larger dollar savings
 * wins. Nothing here exceeds 50% except the developer TEST code, which is
 * handled by checkout and skips this discount.
 *
 * Nonprofit, extension, veteran, landscaper, and reseller rates are listed
 * so the cap and proof requirement stay in one place. They are not payable
 * until the required document is collected and checked.
 */

import { resolvePromoBundle } from './promoBundles.js';

export const BAGGED_VOLUME_TIERS = Object.freeze([
  { subtotalCents: 50000, percent: 10 },
  { subtotalCents: 150000, percent: 20 },
]);

export const MAX_CUSTOMER_DISCOUNT_PERCENT = 50;

export const GROUP_CODE_RULES = Object.freeze([
  { id: 'school', percent: 30, payable: true, proof: 'Verified school ID' },
  { id: 'nonprofit', percent: 20, payable: false, proof: '501(c)(3) status matching the business name' },
  { id: 'extension', percent: 20, payable: false, proof: 'Program name and proof of membership' },
  { id: 'veteran', percent: 15, payable: false, proof: 'Veteran ID card' },
  { id: 'landscaper', percent: 10, payable: false, proof: 'Business name and details on file' },
  { id: 'reseller', percent: 50, payable: false, stacks: false, proof: 'Arizona resale license' },
]);

const PROMO_BUNDLE_IDS = new Set([4100, 4101, 4102]);

function lineText(item) {
  return `${item?.format || ''} ${item?.sizeOption || ''} ${item?.size || ''} ${item?.unit || ''}`.toLowerCase();
}

function isPromoLine(item) {
  return Boolean(resolvePromoBundle(item) || PROMO_BUNDLE_IDS.has(Number(item?.productId ?? item?.product_id)));
}

export function isPalletVolumeLine(item) {
  if (!item || isPromoLine(item)) return false;
  return lineText(item).includes('pallet');
}

/** Retail bags only. Pallets, totes, bulk, bottles, and bundles are not bags. */
export function isRetailBagLine(item) {
  if (!item || isPromoLine(item)) return false;
  const key = lineText(item);
  if (!key.trim()) return false;
  if (/pallet|tote|bulk|truck|cubic|cu yd|super sack|supersack|loose|bottle|gallon/.test(key)) return false;
  return /bag|\dcf|\blb\b/.test(key);
}

function lineCents(item) {
  const quantity = Math.max(0, Number(item?.quantity) || 0);
  const unit = Math.round((Number(item?.unitPrice ?? item?.price) + Number.EPSILON) * 100);
  if (!Number.isFinite(unit) || unit < 0 || quantity <= 0) return 0;
  return unit * quantity;
}

export function baggedVolumeQuote(items) {
  const pay = (Array.isArray(items) ? items : []).filter((item) => item?.mode !== 'quote');
  const hasPallet = pay.some(isPalletVolumeLine);
  const subtotalCents = pay.reduce((sum, item) => sum + (isRetailBagLine(item) ? lineCents(item) : 0), 0);
  const tier = hasPallet
    ? null
    : [...BAGGED_VOLUME_TIERS].reverse().find((entry) => subtotalCents >= entry.subtotalCents) || null;
  const percent = tier?.percent || 0;
  const amountCents = Math.round(subtotalCents * percent / 100);
  const next = hasPallet ? null : BAGGED_VOLUME_TIERS.find((entry) => subtotalCents < entry.subtotalCents) || null;
  return {
    hasPallet,
    subtotalCents,
    percent,
    amountCents,
    amount: amountCents / 100,
    next: next ? { percent: next.percent, remainingCents: next.subtotalCents - subtotalCents } : null,
  };
}

/**
 * One discount for the order. A tie keeps the group code the customer entered.
 * TEST and a reseller rate never stack with volume. TEST is the only path
 * allowed to zero the order.
 */
export function chooseSingleDiscount({ volumeCents = 0, groupCents = 0, groupKind = 'none' } = {}) {
  const volume = Math.max(0, Math.round(Number(volumeCents) || 0));
  const group = Math.max(0, Math.round(Number(groupCents) || 0));
  if (groupKind === 'test') return { winner: 'test', volumeCents: 0, groupCents: 0 };
  if (groupKind === 'reseller') return { winner: group > 0 ? 'group' : 'none', volumeCents: 0, groupCents: group };
  if (group > volume) return { winner: 'group', volumeCents: 0, groupCents: group };
  if (volume > group && volume > 0) return { winner: 'volume', volumeCents: volume, groupCents: 0 };
  if (group > 0) return { winner: 'group', volumeCents: 0, groupCents: group };
  return { winner: 'none', volumeCents: 0, groupCents: 0 };
}

export function chargeOrderDiscounts({ items, discountKind = 'none', schoolDiscountCents = 0 } = {}) {
  const volume = baggedVolumeQuote(items);
  const groupCents = discountKind === 'school' ? Math.max(0, Math.round(Number(schoolDiscountCents) || 0)) : 0;
  const choice = chooseSingleDiscount({
    volumeCents: volume.amountCents,
    groupCents,
    groupKind: discountKind === 'test' ? 'test' : discountKind === 'school' ? 'school' : 'none',
  });
  const notes = [];
  if (choice.winner === 'volume') {
    notes.push(`${volume.percent}% off bags (−$${(choice.volumeCents / 100).toFixed(2)}). Not combined with a group code.`);
    if (groupCents > 0)     notes.push('School code was not used because the bag discount saves more.');
  } else if (choice.winner === 'group' && volume.amountCents > 0) {
    notes.push('The bag discount was not combined. The group rate saves more.');
  }
  return { volume, choice, notes };
}

export function baggedVolumeSavingsLabel(percent) {
  const rate = Number(percent) || 0;
  return rate > 0 ? `${rate}% off bags` : null;
}

export function baggedVolumeHint(quote, formatMoney) {
  if (!quote?.next || quote.subtotalCents <= 0) return null;
  const dollars = quote.next.remainingCents / 100;
  return `Add ${formatMoney(dollars)} for ${quote.next.percent}% off bags.`;
}

export function volumeStripeCouponParams(amountCents) {
  const amount = Math.round(Number(amountCents) || 0);
  if (!Number.isFinite(amount) || amount <= 0) {
    const error = new Error('Bagged volume discount is not available for this order.');
    error.status = 400;
    throw error;
  }
  return {
    amount_off: amount,
    currency: 'usd',
    duration: 'once',
    max_redemptions: 1,
    name: 'Bagged volume',
    metadata: { purpose: 'bagged_volume' },
  };
}
