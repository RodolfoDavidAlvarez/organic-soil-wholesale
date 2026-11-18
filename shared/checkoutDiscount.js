/**
 * Checkout discount rules for Organic Soil Wholesale.
 *
 * TEST is the existing checkout QA code: 100% off, including in production.
 * SCHOOL30 codes are not priced here. The server asks
 * myorganicsoil.com POST /api/school-verifications/quote and uses that
 * discount_cents. Line prices stay the catalog sale price, in integer cents,
 * with compare_at_cents (list) or discount_percent 20 on pallet lines.
 * Do not multiply the current pallet price by 0.70.
 */

import { cartFlatbedSpots, hasFullFlatbedDiscount } from './flatbedSpots.js';
import { resolvePromoBundle } from './promoBundles.js';
import { schoolVerificationApiBase } from './schoolVerification.js';

export const SCHOOL_DISCOUNT_PERCENT = 30;
/** Exactly four characters, matching the codes the verification service issues. */
export const SCHOOL_CODE_PATTERN = /^SCHOOL30-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}$/;
/** 2027-05-31 23:59:59 America/Phoenix. */
export const SCHOOL_OFFER_ENDS_AT = '2027-05-31T23:59:59-07:00';

const PROMO_BUNDLE_IDS = new Set([4100, 4101, 4102]);

export function toCents(amount) {
  return Math.round((Number(amount) + Number.EPSILON) * 100);
}

export function normalizeDiscountCode(code) {
  return String(code || '').trim().toUpperCase();
}

export function normalizeSchoolContactEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254 ? email : null;
}

export function isSchoolDiscountCode(code) {
  return SCHOOL_CODE_PATTERN.test(normalizeDiscountCode(code));
}

export function schoolOfferEnded(now = new Date()) {
  const time = now instanceof Date ? now.getTime() : new Date(now).getTime();
  return !(Number.isFinite(time) && time <= Date.parse(SCHOOL_OFFER_ENDS_AT));
}

export function schoolCodeMarker(code) {
  return `school_discount_code=${normalizeDiscountCode(code)}`;
}

export function schoolOrderReference(orderId) {
  return `osw-${orderId}`;
}

export function lineFormat(item) {
  return String(item?.format || item?.sizeOption || item?.size || '');
}

export function quoteQuantityType(item) {
  if (resolvePromoBundle(item) || PROMO_BUNDLE_IDS.has(Number(item?.productId ?? item?.product_id))) return 'bundle';
  const format = lineFormat(item).toLowerCase();
  const unit = String(item?.unit || '').toLowerCase();
  if (format.includes('truck') || unit.includes('truck')) return 'truckload';
  if (format.includes('tote') || unit.includes('tote') || format.includes('super sack') || format.includes('supersack')) return 'tote';
  if (unit.includes('ton') || format.includes('ton')) return 'ton';
  if (unit.includes('cu yd') || unit.includes('cubic') || format.includes('cu yd') || format.includes('cubic') || format.includes('loose')) return 'cubic_yard';
  if (format.includes('pallet') || unit.includes('pallet')) return 'pallet';
  if (format.includes('bag') || unit.includes('bag') || format.includes('cf') || format.includes('lb')) return 'bag';
  return 'each';
}

export function isBaggedProductLine(item) {
  if (!item || resolvePromoBundle(item) || PROMO_BUNDLE_IDS.has(Number(item?.productId ?? item?.product_id))) return false;
  const key = `${lineFormat(item)} ${item?.unit || ''}`.toLowerCase();
  if (!key.trim()) return false;
  if (/tote|bulk|truck|cubic|cu yd|super sack|supersack|loose|bottle|gallon/.test(key)) return false;
  return key.includes('bag') || key.includes('pallet') || key.includes('cf') || key.includes('lb');
}

/**
 * Quote payload for one catalog line. unit_price is the current sale price
 * in cents. A pallet that is already 20% off sends its list price as
 * compare_at_cents and discount_percent 20. It does not send 70% of the sale price.
 */
export function buildSchoolQuoteLine(item) {
  const quantity = Math.max(0, Number(item?.quantity) || 0);
  const unitCents = toCents(item?.price ?? item?.unitPrice ?? 0);
  const listRaw = Number(item?.listUnitPrice ?? item?.list_price);
  const listCents = Number.isFinite(listRaw) && listRaw > 0 ? toCents(listRaw) : 0;
  const quantityType = quoteQuantityType(item);
  const embedded = Number(item?.discountPercent ?? item?.discount_percent) || 0;
  const line = {
    product_id: Number(item?.productId ?? item?.product_id),
    quantity,
    unit_price: unitCents,
    size_category: quantityType === 'bundle' ? 'bundle' : lineFormat(item),
    quantity_type: quantityType,
  };
  if (listCents > unitCents) line.compare_at_cents = listCents;
  if (quantityType === 'pallet' && embedded === 20) line.discount_percent = 20;
  return line;
}

export function buildSchoolQuoteBody(code, contactEmail, items) {
  return {
    discount_code: normalizeDiscountCode(code),
    contact_email: normalizeSchoolContactEmail(contactEmail),
    line_items: (Array.isArray(items) ? items : []).map(buildSchoolQuoteLine),
  };
}

export function schoolLineCaption(item) {
  if (!isBaggedProductLine(item)) return null;
  const type = quoteQuantityType(item);
  const embedded = Number(item?.discountPercent ?? item?.discount_percent) || 0;
  const list = Number(item?.listUnitPrice ?? item?.list_price);
  const sale = Number(item?.price ?? item?.unitPrice);
  if (type === 'pallet' && (embedded === 20 || (Number.isFinite(list) && list > sale + 0.001))) {
    return 'School rate replaces the 20% pallet discount';
  }
  return 'School rate · 30% off this bagged item';
}

export function schoolCartNotices(items) {
  const source = Array.isArray(items) ? items : [];
  const spots = cartFlatbedSpots(source);
  let bagged = 0;
  let pallet = false;
  let ineligible = false;
  let bundle = false;
  for (const item of source) {
    const quantity = Number(item?.quantity) || 0;
    if (quantity <= 0) continue;
    if (resolvePromoBundle(item) || quoteQuantityType(item) === 'bundle') {
      bundle = true;
      continue;
    }
    if (isBaggedProductLine(item)) {
      bagged += 1;
      if (quoteQuantityType(item) === 'pallet') pallet = true;
    } else {
      ineligible = true;
    }
  }
  const notices = [];
  if (pallet) notices.push('The 20% full-pallet discount is not combined. Those bagged pallets are 30% off the regular price instead.');
  if (hasFullFlatbedDiscount(spots)) notices.push('The full-flatbed discount is not combined with the school code.');
  if (bundle) notices.push('Garden bundles keep their bundle price. The school code does not combine with that offer.');
  if (ineligible) notices.push('Bulk, totes, loose yards, and truckloads stay at the regular price.');
  if (notices.length === 0 && bagged > 0) notices.push('30% off bagged products in this order.');
  return notices;
}

function publicQuoteError(payload, fallback) {
  const message = payload?.error || payload?.reason;
  if (typeof message !== 'string') return fallback;
  if (message.length > 180) return fallback;
  if (/https?:|token|stack|secret|key/i.test(message)) return fallback;
  return message;
}

export async function fetchSchoolQuote({ code, contactEmail, items }, { env = process.env, fetchImpl = globalThis.fetch } = {}) {
  const body = buildSchoolQuoteBody(code, contactEmail, items);
  if (!body.contact_email || !isSchoolDiscountCode(body.discount_code)) {
    return { ok: false, status: 400, error: 'Enter the school code and the email from the verification.' };
  }
  if (schoolOfferEnded()) {
    return { ok: false, status: 400, error: 'This school code expired on May 31, 2027.' };
  }
  let response;
  try {
    response = await fetchImpl(`${schoolVerificationApiBase(env)}/api/school-verifications/quote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false, status: 503, error: "We couldn't check that school code. Please call us." };
  }
  const payload = await response.json().catch(() => ({}));
  const discountCents = Math.round(Number(payload?.discount_cents) || 0);
  if (!response.ok || payload?.valid !== true || discountCents <= 0) {
    return {
      ok: false,
      status: response.ok ? 400 : response.status || 502,
      error: publicQuoteError(payload, "That code isn't valid"),
      lineItems: body.line_items,
    };
  }
  return {
    ok: true,
    status: 200,
    code: body.discount_code,
    email: body.contact_email,
    discountCents,
    expiresAt: payload.discount_expires_at || null,
    lineItems: body.line_items,
  };
}

export function resolveDiscountCode(raw, { now = new Date() } = {}) {
  const code = normalizeDiscountCode(raw);
  if (!code) return { ok: true, kind: 'none', code: null, percent: 0 };
  if (code === 'TEST') {
    return { ok: true, kind: 'test', code: 'TEST', percent: 100 };
  }
  if (isSchoolDiscountCode(code)) {
    if (schoolOfferEnded(now)) {
      return { ok: false, error: 'This school code expired on May 31, 2027.' };
    }
    return { ok: true, kind: 'school', code, percent: SCHOOL_DISCOUNT_PERCENT };
  }
  return { ok: false, error: "That code isn't valid" };
}

export function schoolCheckoutNoteLines({ code, email, discountCents, lineItems }) {
  return [
    schoolCodeMarker(code),
    `school_contact_email=${email}`,
    `school_discount_cents=${discountCents}`,
    `school_quote_lines=${JSON.stringify(lineItems)}`,
    `Discount applied: ${code} ($${(discountCents / 100).toFixed(2)} off bagged products only)`,
    'The school rate replaces the 20% pallet discount and is not combined with other discounts.',
  ];
}

export function checkoutDiscountNotes(decision, schoolQuote) {
  if (!decision?.ok || decision.kind === 'none') return [];
  if (decision.kind === 'test') return ['Discount applied: TEST (-100%)'];
  if (decision.kind === 'school' && schoolQuote?.ok) {
    return schoolCheckoutNoteLines(schoolQuote);
  }
  return [];
}

export function readSchoolCheckoutNote(notes) {
  const text = String(notes || '');
  if (text.includes('school_redeemed=yes')) {
    return { redeemed: true };
  }
  const code = text.match(/school_discount_code=(SCHOOL30-[A-Z0-9]+)/)?.[1];
  const email = normalizeSchoolContactEmail(text.match(/school_contact_email=([^\s]+)/)?.[1]);
  const cents = text.match(/school_discount_cents=(\d+)/)?.[1];
  const rawLines = text.match(/school_quote_lines=(\[.*\])/)?.[1];
  if (!isSchoolDiscountCode(code) || !email || cents == null || !rawLines) return null;
  try {
    const lineItems = JSON.parse(rawLines);
    if (!Array.isArray(lineItems)) return null;
    return { code, email, discountCents: Number(cents), lineItems, redeemed: false };
  } catch {
    return null;
  }
}

export function schoolStripeCouponParams(discountCents) {
  return {
    amount_off: Math.round(Number(discountCents) || 0),
    currency: 'usd',
    duration: 'once',
    max_redemptions: 1,
    name: 'School rate',
  };
}
