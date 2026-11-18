/**
 * Server-only school-code redemption.
 * The browser must never import this module. The internal key stays here.
 *
 * The verification service checks INTERNAL_TRIGGER_SECRET, otherwise
 * LEAD_INGEST_SECRET. This app sends INTERNAL_TRIGGER_SECRET when it is set.
 * Otherwise it sends MOS_LEAD_INGEST_SECRET, which is this app's name for the
 * same LEAD_INGEST_SECRET value. A mismatch is a 401 and the card is not captured.
 *
 * Checkout authorizes the card (manual capture). This module claims the code
 * and only then captures. If the code was already used, the authorization is
 * cancelled. A charge that was already captured is refunded. Neither path
 * fulfills the order.
 */

import { readSchoolCheckoutNote, schoolOrderReference } from './checkoutDiscount.js';
import { schoolVerificationApiBase } from './schoolVerification.js';

export const SCHOOL_CODE_USED_MESSAGE = 'This school code was already used. Your card was not charged.';
export const SCHOOL_CODE_REFUNDED_MESSAGE = 'This school code was already used. The charge was refunded.';
export const SCHOOL_CODE_REFUSED_MESSAGE = 'This school code cannot be used on this order. Your card was not charged.';
export const SCHOOL_CODE_REFUSED_REFUND_MESSAGE = 'This school code cannot be used on this order. The charge was refunded.';

export function schoolInternalKey(env = process.env) {
  return String(env.INTERNAL_TRIGGER_SECRET || env.MOS_LEAD_INGEST_SECRET || env.LEAD_INGEST_SECRET || '').trim();
}

export function schoolPaymentIntentId(session, order) {
  const raw = session?.payment_intent || order?.stripe_payment_intent_id || null;
  if (!raw) return null;
  return typeof raw === 'string' ? raw : raw.id || null;
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

function retryable(message, status = 503) {
  const error = new Error(message || 'School code redemption failed.');
  error.status = status;
  return error;
}

function releaseMessage(released, status) {
  const used = status === 409;
  if (released === 'refunded') return used ? SCHOOL_CODE_REFUNDED_MESSAGE : SCHOOL_CODE_REFUSED_REFUND_MESSAGE;
  return used ? SCHOOL_CODE_USED_MESSAGE : SCHOOL_CODE_REFUSED_MESSAGE;
}

async function writeSchoolOrder(db, order, patch) {
  const { error } = await db.from('orders').update(patch).eq('id', order.id);
  if (error) throw retryable(error.message || 'Could not update the school order.');
}

/**
 * Cancel an authorization, or refund a charge that already captured.
 * Returns 'voided' or 'refunded'.
 */
export async function releaseUnusableSchoolCharge(stripe, intentId, orderId) {
  if (!stripe || !intentId) throw retryable('School payment could not be released.');
  const intent = await stripe.paymentIntents.retrieve(intentId);
  if (intent.status === 'requires_capture') {
    await stripe.paymentIntents.cancel(intentId, {}, { idempotencyKey: `school-void-${orderId}` });
    return 'voided';
  }
  if (intent.status === 'canceled') return 'voided';
  if (intent.status === 'succeeded') {
    try {
      await stripe.refunds.create(
        { payment_intent: intentId },
        { idempotencyKey: `school-refund-${orderId}` },
      );
    } catch (error) {
      const code = error?.code || error?.raw?.code || '';
      if (code !== 'charge_already_refunded') throw error;
    }
    return 'refunded';
  }
  throw retryable(`School payment is ${intent.status} and was not released.`);
}

export async function captureSchoolPayment(stripe, intentId, orderId) {
  if (!stripe || !intentId) throw retryable('School payment could not be captured.');
  const intent = await stripe.paymentIntents.retrieve(intentId);
  if (intent.status === 'succeeded') return;
  if (intent.status !== 'requires_capture') {
    throw retryable(`School payment is ${intent.status} and was not captured.`);
  }
  try {
    await stripe.paymentIntents.capture(intentId, {}, { idempotencyKey: `school-capture-${orderId}` });
  } catch (error) {
    const again = await stripe.paymentIntents.retrieve(intentId);
    if (again.status !== 'succeeded') throw error;
  }
}

/**
 * Claim the code, then capture. The same order reference is idempotent.
 * A 5xx or 401 is thrown so the payment webhook can retry without capturing.
 * A 400 or 409 releases the card and stops fulfillment.
 */
export async function settleSchoolCheckout(db, order, options = {}) {
  const parsed = readSchoolCheckoutNote(order?.notes);
  if (!parsed) return { skipped: true };
  if (parsed.redeemed) return { skipped: true, already: true };
  if (parsed.released) {
    return {
      stop: true,
      released: parsed.released,
      error: releaseMessage(parsed.released, parsed.status),
    };
  }
  const orderReference = schoolOrderReference(order.id);
  const intentId = schoolPaymentIntentId(options.session, order);
  const result = await redeemSchoolOrder({ ...parsed, orderReference }, options);
  if (!result.ok) {
    if (!result.status || result.status >= 500 || result.status === 401 || result.status === 403) {
      throw retryable(result.error || 'School code redemption failed.');
    }
    const released = await releaseUnusableSchoolCharge(options.stripe, intentId, order.id);
    const errorText = releaseMessage(released, result.status);
    await writeSchoolOrder(db, order, {
      notes: `${order.notes || ''}\nschool_order_reference=${orderReference}\nschool_checkout_released=${released}\nschool_redeem_status=${result.status}\nschool_redeem_error=${String(result.error || 'refused').replace(/[\r\n]/g, ' ').slice(0, 160)}`.trim(),
      status: 'cancelled',
      payment_status: released === 'refunded' ? 'refunded' : 'voided',
      stripe_payment_intent_id: intentId,
    });
    console.error('[school redeem] released unpaid school checkout', order.id, result.status, released);
    return { stop: true, released, error: errorText };
  }
  await captureSchoolPayment(options.stripe, intentId, order.id);
  await writeSchoolOrder(db, order, {
    notes: `${order.notes || ''}\nschool_order_reference=${orderReference}\nschool_redeemed=yes`.trim(),
    stripe_payment_intent_id: intentId,
  });
  return { ok: true, captured: true, idempotent: result.idempotent === true };
}
