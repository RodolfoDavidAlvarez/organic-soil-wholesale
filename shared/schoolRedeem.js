/**
 * Server-only school-code redemption.
 * The browser must never import this module. The internal key stays here.
 */

import { readSchoolCheckoutNote, schoolOrderReference } from './checkoutDiscount.js';
import { schoolVerificationApiBase } from './schoolVerification.js';

export function schoolInternalKey(env = process.env) {
  return String(env.INTERNAL_TRIGGER_SECRET || env.MOS_LEAD_INGEST_SECRET || env.LEAD_INGEST_SECRET || '').trim();
}

export async function redeemSchoolOrder(record, { env = process.env, fetchImpl = globalThis.fetch } = {}) {
  const key = schoolInternalKey(env);
  if (!key) {
    return { ok: false, status: 503, error: 'School code redemption is not configured.' };
  }
  let response;
  try {
    response = await fetchImpl(`${schoolVerificationApiBase(env)}/api/school-verifications/redeem`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'x-internal-key': key,
      },
      body: JSON.stringify({
        discount_code: record.code,
        contact_email: record.email,
        order_reference: record.orderReference,
        discount_cents: record.discountCents,
        line_items: record.lineItems,
      }),
    });
  } catch {
    return { ok: false, status: 503, error: 'Could not reach the school verification service.' };
  }
  const payload = await response.json().catch(() => ({}));
  if (response.ok && payload?.redeemed === true) {
    return { ok: true, status: response.status, idempotent: payload.idempotent === true };
  }
  const message = typeof payload?.error === 'string' && payload.error.length <= 180
    ? payload.error
    : 'Could not redeem the school code.';
  return { ok: false, status: response.status || 502, error: message };
}

/**
 * Claim the code after payment. The same order reference is idempotent.
 * A 5xx is thrown so the payment webhook can retry. A refusal is stored on
 * the order and is not retried.
 */
export async function redeemPaidSchoolOrder(db, order, options = {}) {
  const parsed = readSchoolCheckoutNote(order?.notes);
  if (!parsed) return { skipped: true };
  if (parsed.redeemed) return { skipped: true, already: true };
  const orderReference = schoolOrderReference(order.id);
  const result = await redeemSchoolOrder({ ...parsed, orderReference }, options);
  if (result.ok) {
    await db.from('orders').update({
      notes: `${order.notes}\nschool_order_reference=${orderReference}\nschool_redeemed=yes`,
    }).eq('id', order.id);
    return { ok: true, idempotent: result.idempotent === true };
  }
  if (!result.status || result.status >= 500) {
    const error = new Error(result.error || 'School code redemption failed.');
    error.status = result.status || 503;
    throw error;
  }
  const safe = String(result.error || 'refused').replace(/[\r\n]/g, ' ').slice(0, 160);
  await db.from('orders').update({
    notes: `${order.notes}\nschool_order_reference=${orderReference}\nschool_redeem_error=${safe}`,
  }).eq('id', order.id);
  console.error('[school redeem] refused after payment', order.id, result.status);
  return { ok: false, error: safe };
}
