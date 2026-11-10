import { resolveSswFrom } from './sswEmailFrom.js';

const VALID_SESSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const CHECKOUT_ALERT_TO = process.env.CHECKOUT_ALERT_TO || 'developer@bettersystems.ai';

// Failed payments and checkout errors receive an immediate alert. Keep them out
// of the abandonment digest so their failure status is preserved and the same
// incident is not reported twice.
export const CHECKOUT_ABANDONMENT_STATUSES = ['active', 'payment_pending', 'redirected'];

export function checkoutAlertFollowUpFromOrder(order) {
  if (!order) return {};
  return {
    customerName: order.customer_name || undefined,
    customerEmail: order.customer_email || order.email || undefined,
    customerPhone: order.phone || undefined,
    pickupScheduledAt: order.pickup_scheduled_at || undefined,
    pickupLocation: order.pickup_location || undefined,
  };
}

const KNOWN_SCANNER_INPUT_PATHS = new Set([
  '/api/graphql',
  '/api/mcp',
  '/api/mcp/mcp',
  '/api/mcp/v1',
  '/api/v1/mcp',
  // Guessed checkout/payment paths. Live checkout uses POST /api/checkout/create-session.
  '/api/create-checkout-session',
  '/api/stripe/create-checkout-session',
  '/api/checkout/session',
  '/api/checkout/create',
  '/api/orders/create',
  '/api/pay-and-pickup/checkout',
  '/api/pay-and-pickup/create-checkout-session',
  '/api/pay-and-pickup/check-in-by-phone',
  '/api/pickup/checkout',
  '/api/pickup-orders/check-in-by-phone',
  '/api/pickup-orders/checkin-by-phone',
  '/api/payments/create',
  '/api/stripe/payment-intent',
  '/api/create-payment-intent',
  '/api/scheduling/create',
  '/api/site-config',
  '/api/public/products',
]);

const GUESSED_CHECKOUT_PATH = /create-checkout-session|payment-intent|create-payment-intent/;

// Only page unmatched_input when the missing path looks like a live customer write.
// Admin/portal/voice-agent probe spellings stay quiet.
const CUSTOMER_WRITE_PREFIXES = [
  '/api/checkout/',
  '/api/leads/',
  '/api/quote/',
  '/api/contact/',
  '/api/newsletter/',
  '/api/survey/',
  '/api/giveaway/',
  '/api/account-form/',
  '/api/credit-application',
  '/api/pay-and-pickup/notify-arrival',
  '/api/special-request/',
  '/api/job-applications/',
  '/api/crm-leads',
  '/api/unsubscribe',
  '/api/auth/',
  '/api/grok/',
  '/api/voice-agent/signed-url',
  '/api/voice-agent/handoff/',
  '/api/scheduling/available-dates',
  '/api/scheduling/time-slots',
];

function isCustomerWritePath(path) {
  return CUSTOMER_WRITE_PREFIXES.some((prefix) => path === prefix || path.startsWith(prefix));
}

export function shouldAlertUnmatchedInput(path, method) {
  if (!['POST', 'PUT', 'PATCH'].includes(method)) return false;
  if (typeof path !== 'string' || !path.startsWith('/api/')) return false;
  if (KNOWN_SCANNER_INPUT_PATHS.has(path)) return false;
  if (path !== '/api/checkout/create-session' && GUESSED_CHECKOUT_PATH.test(path)) return false;
  return isCustomerWritePath(path);
}

export const CHECKOUT_EVENT_STATE = {
  checkout_entered: { status: 'active', stage: 'checkout_entered' },
  fulfillment: { status: 'active', stage: 'fulfillment' },
  timing: { status: 'active', stage: 'timing' },
  customer: { status: 'active', stage: 'customer' },
  review: { status: 'active', stage: 'review' },
  payment_requested: { status: 'payment_pending', stage: 'payment_requested' },
  stripe_redirect: { status: 'redirected', stage: 'stripe_redirect' },
  stripe_canceled: { status: 'canceled', stage: 'stripe_canceled' },
  checkout_error: { status: 'failed', stage: 'checkout_error' },
  payment_failed: { status: 'failed', stage: 'payment_failed' },
  payment_completed: { status: 'completed', stage: 'payment_completed' },
};

export function isCheckoutMonitorSessionId(value) {
  return typeof value === 'string' && VALID_SESSION_ID.test(value);
}

function cleanMessage(value, max = 300) {
  return typeof value === 'string' ? value.trim().slice(0, max) : null;
}

export async function recordCheckoutEvent(db, input) {
  if (!isCheckoutMonitorSessionId(input?.sessionId)) {
    throw new Error('Invalid checkout monitor session');
  }
  const state = CHECKOUT_EVENT_STATE[input.event];
  if (!state) throw new Error('Invalid checkout monitor event');

  const now = new Date().toISOString();
  const patch = {
    status: state.status,
    stage: state.stage,
    last_seen_at: now,
    updated_at: now,
  };
  if (input.event === 'checkout_entered') {
    patch.entered_at = now;
    patch.order_id = null;
    patch.stripe_checkout_session_id = null;
    patch.error_code = null;
    patch.error_message = null;
    patch.completed_at = null;
    patch.immediate_alerted_at = null;
    patch.abandoned_alerted_at = null;
  } else if (input.event === 'payment_requested') {
    patch.error_code = null;
    patch.error_message = null;
    patch.immediate_alerted_at = null;
    patch.abandoned_alerted_at = null;
  }
  if (input.fulfillment === 'pickup' || input.fulfillment === 'delivery') {
    patch.fulfillment_type = input.fulfillment;
  }
  if (Number.isFinite(Number(input.itemCount))) patch.item_count = Math.min(1000, Math.max(0, Math.round(Number(input.itemCount))));
  if (Number.isFinite(Number(input.cartValue))) patch.cart_value = Math.min(10000000, Math.max(0, Number(input.cartValue)));
  if (Number.isInteger(Number(input.orderId)) && Number(input.orderId) > 0) patch.order_id = Number(input.orderId);
  if (cleanMessage(input.stripeSessionId, 255)) patch.stripe_checkout_session_id = cleanMessage(input.stripeSessionId, 255);
  if (cleanMessage(input.errorCode, 80)) patch.error_code = cleanMessage(input.errorCode, 80);
  if (cleanMessage(input.errorMessage)) patch.error_message = cleanMessage(input.errorMessage);
  if (state.status === 'completed') patch.completed_at = now;

  const { data: updated, error: updateError } = await db
    .from('checkout_monitor_sessions')
    .update(patch)
    .eq('session_id', input.sessionId)
    .select('*')
    .maybeSingle();
  if (updateError) throw updateError;
  if (updated) return updated;

  const { data: inserted, error: insertError } = await db
    .from('checkout_monitor_sessions')
    .insert({ session_id: input.sessionId, ...patch, entered_at: now, created_at: now })
    .select('*')
    .single();
  if (insertError?.code === '23505') {
    return recordCheckoutEvent(db, input);
  }
  if (insertError) throw insertError;
  return inserted;
}

export async function sendCheckoutAlert(resendClient, {
  subject,
  heading,
  sessionId,
  stage,
  orderId,
  fulfillment,
  itemCount,
  cartValue,
  message,
  customerName,
  customerEmail,
  customerPhone,
  pickupScheduledAt,
  pickupLocation,
}) {
  const html = buildCheckoutAlertHtml({
    heading,
    sessionId,
    stage,
    orderId,
    fulfillment,
    itemCount,
    cartValue,
    message,
    customerName,
    customerEmail,
    customerPhone,
    pickupScheduledAt,
    pickupLocation,
  });
  const result = await resendClient.emails.send({
    from: resolveSswFrom(process.env.CHECKOUT_ALERT_FROM, 'OSW Alerts'),
    replyTo: 'developer@bettersystems.ai',
    to: [CHECKOUT_ALERT_TO],
    subject: `[OSW checkout] ${subject}`,
    html,
  });
  if (result?.error) throw new Error(result.error.message || 'Checkout alert email failed');
  return result?.data?.id || null;
}

export function buildCheckoutAlertHtml({
  heading,
  sessionId,
  stage,
  orderId,
  fulfillment,
  itemCount,
  cartValue,
  message,
  customerName,
  customerEmail,
  customerPhone,
  pickupScheduledAt,
  pickupLocation,
}) {
  const safe = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
  const clean = (value, max = 160) => typeof value === 'string' ? value.trim().slice(0, max) : '';
  const followUpRows = [
    ['Name', clean(customerName, 120)],
    ['Email', clean(customerEmail, 254)],
    ['Phone', clean(customerPhone, 40)],
    ['Pickup time', clean(pickupScheduledAt, 80)],
    ['Pickup location', clean(pickupLocation, 160)],
  ].filter(([, value]) => value);
  const followUp = followUpRows.length
    ? `<h3>Customer follow-up</h3><p>${followUpRows.map(([label, value]) => `<strong>${safe(label)}:</strong> ${safe(value)}`).join('<br>')}</p>`
    : '<p><strong>Customer follow-up:</strong> No contact details were captured.</p>';

  return `<h2>${safe(heading)}</h2>
      <p><strong>Stage:</strong> ${safe(stage || 'unknown')}<br>
      <strong>Order:</strong> ${safe(orderId || 'not created')}<br>
      <strong>Fulfillment:</strong> ${safe(fulfillment || 'not selected')}<br>
      <strong>Cart:</strong> ${safe(itemCount || 0)} item(s), $${safe(Number(cartValue || 0).toFixed(2))}<br>
      <strong>Monitor ID:</strong> ${safe(sessionId || 'unknown')}</p>
      ${message ? `<p><strong>Details:</strong> ${safe(message)}</p>` : ''}
      ${followUp}
      <p>No IP address, browser fingerprint, card data, Stripe secret, billing address, or delivery address is included in this alert. Customer follow-up details come only from the draft order when already captured.</p>`;
}
