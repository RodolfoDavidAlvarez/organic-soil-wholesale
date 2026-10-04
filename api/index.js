import { normalizeGardenBedRequest } from '../shared/gardenBedOrders.js';
// Vercel Serverless Function with CRM Business Card Capture
import QRCode from 'qrcode';
import crypto from 'node:crypto';
import {
  WORM_CASTINGS_CAMPAIGN_KEY,
  WORM_CASTINGS_CAMPAIGN_ENDED_MESSAGE,
  WORM_CASTINGS_PUBLIC_SIGNUP_OPEN,
  buildWormCastingsCouponEmail,
  isWormCastingsCampaignSource,
  normalizeCampaignSource,
  normalizeCampaignEmail,
} from '../shared/wormCastingsCampaign.js';
import {
  persistWormCastingsRouting,
  routingRecordColumns,
  validateWormCastingsRouting,
} from '../shared/wormCastingsRouting.js';
import { assignSswNumberForPurchase, ensureSswNumber } from '../shared/sswNumber.js';
import { buildPurchaseThankYouEmail, PURCHASE_THANK_YOU_FROM } from '../shared/purchaseThankYou.js';
import { processDay3Reminders } from '../shared/wormCastingsDay3Reminders.js';
import { processPortalSurveyLetters } from '../shared/portalSurveyLetter.js';
import { processSurveySubmission } from '../shared/surveyStaffAlerts.js';
import { isSurveySubmitPostPath } from '../shared/surveySubmitPaths.js';
import {
  CHECKOUT_ABANDONMENT_STATUSES,
  CHECKOUT_ALERT_TO,
  checkoutAlertFollowUpFromOrder,
  isCheckoutMonitorSessionId,
  recordCheckoutEvent,
  sendCheckoutAlert,
  shouldAlertUnmatchedInput,
} from '../shared/checkoutMonitoring.js';
import {
  normalizeV5CheckoutItems,
  normalizeV5ProductRecord,
} from '../shared/oswPricing.js';
import { nonBundleProductSubtotal, resolvePromoBundle } from '../shared/promoBundles.js';
import {
  JOB_APPLICATION_BUCKET,
  JobApplicationError,
  cleanupUnsavedJobApplication,
  processJobApplication,
  validateJobApplicationUpload,
} from '../shared/jobApplications.js';

// Lazy initialize clients
let supabase = null;
let anthropic = null;
let openai = null;
let resend = null;

async function getSupabase() {
  if (!supabase) {
    const { createClient } = await import('@supabase/supabase-js');
    supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  }
  return supabase;
}

async function getAnthropic() {
  if (!anthropic) {
    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return anthropic;
}

async function getOpenAI() {
  if (!openai) {
    const OpenAI = (await import('openai')).default;
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return openai;
}

async function getResend() {
  if (!resend) {
    const { Resend } = await import('resend');
    resend = new Resend(process.env.RESEND_API_KEY);
  }
  return resend;
}

function requireJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is required for admin authentication');
  }
  return secret;
}

async function notifyCheckoutIssue(db, monitor, subject, heading, message, followUp = {}) {
  if (!monitor || monitor.immediate_alerted_at) return;
  try {
    await sendCheckoutAlert(await getResend(), {
      subject,
      heading,
      sessionId: monitor.session_id,
      stage: monitor.stage,
      orderId: monitor.order_id,
      fulfillment: monitor.fulfillment_type,
      itemCount: monitor.item_count,
      cartValue: monitor.cart_value,
      message,
      customerName: followUp.customerName,
      customerEmail: followUp.customerEmail,
      customerPhone: followUp.customerPhone,
      pickupScheduledAt: followUp.pickupScheduledAt,
      pickupLocation: followUp.pickupLocation,
    });
    await db.from('checkout_monitor_sessions').update({
      immediate_alerted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('session_id', monitor.session_id).is('immediate_alerted_at', null);
  } catch (error) {
    console.error(JSON.stringify({
      event: 'checkout_alert_failed',
      sessionId: monitor.session_id,
      message: error?.message || String(error),
    }));
  }
}

async function safeRecordCheckoutEvent(db, input) {
  try {
    return await recordCheckoutEvent(db, input);
  } catch (error) {
    console.error(JSON.stringify({
      event: 'checkout_monitor_write_failed',
      monitorEvent: input?.event,
      sessionId: input?.sessionId,
      message: error?.message || String(error),
    }));
    return null;
  }
}

async function fulfillStripeDeposit(db, orderId, session) {
  const numericOrderId = parseInt(String(orderId || ''), 10);
  if (!numericOrderId) return { ok: false, reason: 'invalid_order_id' };

  const { data: existing } = await db.from('orders').select('*').eq('id', numericOrderId).single();
  if (!existing) return { ok: false, reason: 'order_not_found' };
  if (existing.deposit_paid) return { ok: true, alreadyPaid: true };

  const { data: claimed, error } = await db.from('orders').update({
    deposit_paid: true,
    deposit_paid_at: new Date().toISOString(),
    stripe_payment_intent_id: session?.payment_intent || null,
    updated_at: new Date().toISOString(),
  }).eq('id', numericOrderId).or('deposit_paid.is.null,deposit_paid.eq.false').select('*').maybeSingle();
  if (error) throw error;
  if (!claimed) return { ok: true, alreadyPaid: true };

  await db.from('order_status_history').insert({
    order_id: numericOrderId,
    old_status: existing.status || 'pending',
    new_status: 'deposit_paid',
    notes: `Deposit paid via Stripe. Payment Intent: ${session?.payment_intent || 'N/A'}`,
  });

  try {
    const twilio = (await import('twilio')).default;
    const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    await twilioClient.messages.create({
      body: `Deposit paid! Order #${claimed.order_number?.slice(0, 8)} - $${claimed.deposit_amount} from ${claimed.customer_name}`,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: process.env.RODO_PHONE,
    });
  } catch (smsError) {
    console.error('[stripe deposit] SMS notification error:', smsError?.message || smsError);
  }

  const customerEmail = claimed.customer_email || claimed.email;
  if (customerEmail) {
    try {
      await (await getResend()).emails.send({
        from: 'Organic Soil Wholesale <info@soilseedandwater.com>',
        replyTo: 'ralvarez@soilseedandwater.com',
        to: customerEmail,
        subject: `Deposit confirmed - Order #${claimed.order_number?.slice(0, 8) || claimed.id}`,
        html: `<p>Hi ${escapeHtml(claimed.customer_name || 'there')},</p>
          <p>Your deposit of <strong>$${Number(claimed.deposit_amount || 0).toLocaleString()}</strong> has been received.</p>
          <p>We'll notify you when your order is ready for ${claimed.fulfillment_type === 'delivery' ? 'delivery' : 'pickup'}.</p>
          <p>Thanks,<br>Rodo Alvarez<br>Soil Seed &amp; Water</p>`,
      });
    } catch (emailError) {
      console.error('[stripe deposit] confirmation email error:', emailError?.message || emailError);
    }
  }
  return { ok: true };
}

async function sendWormCastingsCoupon({ db, redemption, customerNumber }) {
  let number = customerNumber || null;
  if (!number && redemption.customer_id) {
    const { data: owner, error: ownerError } = await db
      .from('sp_customers')
      .select('id, ssw_number, ssw_number_alias')
      .eq('id', redemption.customer_id)
      .maybeSingle();
    if (ownerError) throw ownerError;
    if (owner) number = await ensureSswNumber(db, owner);
  }
  const email = buildWormCastingsCouponEmail({
    fullName: redemption.full_name,
    token: redemption.redemption_token,
    customerNumber: number,
  });
  const { data: claimed, error: claimError } = await db
    .from('sp_worm_castings_redemptions')
    .update({
      distribution_status: 'sending',
      distribution_attempts: Number(redemption.distribution_attempts || 0) + 1,
      distribution_last_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', redemption.id)
    .in('distribution_status', ['pending', 'failed'])
    .select()
    .maybeSingle();

  if (claimError) throw claimError;
  if (!claimed) return { status: 'already_processing' };

  try {
    const result = await (await getResend()).emails.send({
      from: process.env.WORM_CASTINGS_EMAIL_FROM || 'Soil Seed & Water <info@soilseedandwater.com>',
      to: [claimed.email],
      subject: email.subject,
      html: email.html,
    });
    const providerId = result?.data?.id || null;
    if (result?.error || !providerId) throw new Error(result?.error?.message || 'coupon_delivery_not_accepted');

    await db.from('sp_worm_castings_redemptions').update({
      distribution_status: 'sent',
      distribution_provider_id: providerId,
      distribution_sent_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', claimed.id);
    await db.from('notification_log').insert({
      notification_type: 'email', template_name: 'worm_castings_qr_distribution', recipient: claimed.email,
      subject: email.subject, content: 'Unique worm castings redemption QR coupon', status: 'sent',
      provider: 'resend', provider_id: providerId, source_app: 'organic_soil_wholesale_campaign', sent_at: new Date().toISOString(),
    });
    return { status: 'sent', providerId };
  } catch (error) {
    const message = error?.message || 'coupon_delivery_failed';
    await db.from('sp_worm_castings_redemptions').update({
      distribution_status: 'failed', distribution_last_error: message, updated_at: new Date().toISOString(),
    }).eq('id', claimed.id);
    await db.from('notification_log').insert({
      notification_type: 'email', template_name: 'worm_castings_qr_distribution', recipient: claimed.email,
      subject: email.subject, content: 'Unique worm castings redemption QR coupon', status: 'failed',
      provider: 'resend', error_message: message, source_app: 'organic_soil_wholesale_campaign',
    });
    throw error;
  }
}

async function resendExistingWormCastingsCoupon({ db, redemption }) {
  const lastSentAt = redemption.distribution_sent_at
    ? new Date(redemption.distribution_sent_at).getTime()
    : 0;
  const resendCooldownMs = 5 * 60 * 1000;

  if (lastSentAt && Date.now() - lastSentAt < resendCooldownMs) {
    return { status: 'recently_sent' };
  }

  // Compare-and-set prevents simultaneous repeat submissions from sending the
  // same coupon more than once. The coupon record and private token never change.
  let queueQuery = db
    .from('sp_worm_castings_redemptions')
    .update({
      distribution_status: 'pending',
      distribution_last_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', redemption.id)
    .eq('distribution_status', 'sent');

  if (redemption.distribution_sent_at) {
    queueQuery = queueQuery.eq('distribution_sent_at', redemption.distribution_sent_at);
  } else {
    queueQuery = queueQuery.is('distribution_sent_at', null);
  }

  const { data: queued, error: queueError } = await queueQuery.select().maybeSingle();
  if (queueError) throw queueError;
  if (!queued) return { status: 'already_processing' };

  const delivery = await sendWormCastingsCoupon({ db, redemption: queued });
  return delivery.status === 'sent' ? { ...delivery, status: 'resent' } : delivery;
}

let pickupScheduleModule = null;
async function getPickupSchedule() {
  if (!pickupScheduleModule) {
    pickupScheduleModule = await import('../shared/pickupSchedule.js');
  }
  return pickupScheduleModule;
}

let developerModeModule = null;
async function getDeveloperMode() {
  if (!developerModeModule) {
    developerModeModule = await import('../shared/developerMode.js');
  }
  return developerModeModule;
}

let pickupNotificationsModule = null;
async function getPickupNotifications() {
  if (!pickupNotificationsModule) {
    pickupNotificationsModule = await import('../shared/pickupNotifications.js');
  }
  return pickupNotificationsModule;
}

/** SMS + admin email when a paid pickup order lands (checkout webhook / free test order). */
function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatPickupLineItems(order, orderItems) {
  const jsonItems = Array.isArray(order?.order_items) ? order.order_items : [];
  const rows = Array.isArray(orderItems) ? orderItems : [];
  return rows.map((item, index) => {
    const source = jsonItems[index] || {};
    const quantity = Number(item.quantity ?? source.quantity ?? 1) || 1;
    const productName = item.product_name || item.name || source.product_name || source.name || `Product #${item.product_id || source.product_id || ''}`.trim();
    const size = item.size_option || item.sizeOption || source.size_option || source.size || '';
    const total = Number(item.total_price ?? source.total ?? ((item.price ?? item.unit_price ?? source.price ?? 0) * quantity)) || 0;
    return { quantity, productName, size, total };
  });
}

function formatMoney(value) {
  return `$${(Number(value) || 0).toFixed(2)}`;
}

function formatPhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  const last10 = digits.length > 10 ? digits.slice(-10) : digits;
  if (last10.length !== 10) return value || '';
  return `(${last10.slice(0, 3)}) ${last10.slice(3, 6)}-${last10.slice(6)}`;
}

function pickupLocationDetails(order) {
  const raw = String(order?.pickup_location || '').toLowerCase();
  if (raw.includes('congress')) {
    return {
      name: 'Congress Processing Plant',
      address1: '18980 Stanton Rd',
      address2: 'Congress, AZ 85332',
    };
  }
  return {
    name: order?.pickup_location || 'Phoenix Yard',
    address1: '1634 N 19th Ave',
    address2: 'Phoenix, AZ 85009',
  };
}

function buildPickupOrderEmail({ order, orderItems, pickupLabel, testing = false }) {
  const orderRef = order?.order_number?.slice(0, 8) || String(order?.id || '');
  const totalDollars = Number(order?.total_amount ?? order?.total ?? 0);
  const customerName = order?.customer_name || order?.business_name || 'Customer';
  const customerEmail = order?.customer_email || order?.email || '';
  const customerPhone = formatPhone(order?.phone || order?.customer_phone || '');
  const location = pickupLocationDetails(order);
  const formattedItems = formatPickupLineItems(order, orderItems);
  const primaryItem = formattedItems[0];
  const itemCount = formattedItems.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
  const itemSummary = primaryItem
    ? `${itemCount || primaryItem.quantity} ${primaryItem.productName}`
    : 'pickup order';
  const readyLabel = pickupLabel || 'Confirm ready time';
  const statusLabel = String(order?.payment_status || order?.status || 'paid').replace(/_/g, ' ').toUpperCase();
  const isRlsBrand = String(order?.notes || '').includes('Source brand: Regenerative Landscaper Supply');

  const itemRows = formattedItems.length
    ? formattedItems.map((item) => `
      <div style="padding:16px 0;border-bottom:1px solid #e3ddcf;">
        <div style="font-size:13px;letter-spacing:.12em;text-transform:uppercase;color:#817867;font-weight:800;margin-bottom:6px;">Qty ${escapeHtml(item.quantity)}</div>
        <div style="font-size:22px;line-height:1.15;color:#172318;font-weight:900;">${escapeHtml(item.productName)}</div>
        ${item.size ? `<div style="font-size:17px;line-height:1.35;color:#5d5548;margin-top:4px;">${escapeHtml(item.size)}</div>` : ''}
        <div style="font-size:20px;color:#172318;font-weight:900;margin-top:8px;">${formatMoney(item.total)}</div>
      </div>
    `).join('')
    : `<div style="font-size:18px;color:#172318;">${escapeHtml(itemSummary)}</div>`;

  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f4f3ee;font-family:Arial,Helvetica,sans-serif;color:#172318;">
    <div style="display:none;max-height:0;overflow:hidden;">Paid pickup order received. Prepare ${escapeHtml(itemSummary)} for customer pickup.</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f3ee;margin:0;padding:0;">
      <tr>
        <td align="center" style="padding:18px 12px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:680px;background:#ffffff;border:1px solid #ded8ca;border-radius:22px;overflow:hidden;">
            <tr>
              <td style="background:#b8dabc;padding:28px 28px 24px;">
                <img src="https://organicsoilwholesale.com/email-assets/ssw-logo.png" alt="Soil Seed & Water" width="150" style="display:block;width:150px;max-width:150px;height:auto;margin:0 0 18px 0;">
                <div style="font-size:13px;letter-spacing:.18em;text-transform:uppercase;color:#394b38;font-weight:900;">${isRlsBrand ? 'Regenerative Landscaper Supply · Organic Soil Wholesale' : 'Organic Soil Wholesale'}</div>
                <div style="font-size:38px;line-height:1.05;color:#172318;font-weight:900;margin-top:12px;">New paid pickup order</div>
                <div style="font-size:20px;line-height:1.35;color:#394b38;margin-top:12px;">Order #${escapeHtml(orderRef)} · ${escapeHtml(location.name)} · Ready ${escapeHtml(readyLabel)}</div>
              </td>
            </tr>
            <tr>
              <td style="background:#20231f;padding:24px 28px;">
                ${testing ? '<div style="display:inline-block;margin:0 8px 10px 0;padding:9px 14px;border-radius:999px;background:#3a3105;border:1px solid #6b5a11;color:#f4d36a;font-size:14px;font-weight:900;letter-spacing:.08em;">TEST EMAIL</div>' : ''}
                <div style="display:inline-block;margin:0 8px 10px 0;padding:9px 14px;border-radius:999px;background:#18331d;border:1px solid #315f37;color:#caefcf;font-size:14px;font-weight:900;letter-spacing:.08em;">${escapeHtml(statusLabel)} · ${formatMoney(totalDollars)}</div>
                <div style="margin-top:16px;padding:20px;border-radius:18px;background:#fbfbf7;border:1px solid #ded8ca;">
                  <div style="font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:#817867;font-weight:900;">Do this now</div>
                  <div style="font-size:26px;line-height:1.2;color:#172318;font-weight:900;margin-top:8px;">Prepare ${escapeHtml(itemSummary)} for customer pickup.</div>
                  <div style="margin-top:14px;">
                    <span style="display:inline-block;margin:0 8px 8px 0;padding:9px 12px;border-radius:999px;background:#e7f6df;border:1px solid #c7dfbd;color:#214822;font-size:14px;font-weight:800;">Payment verified</span>
                    <span style="display:inline-block;margin:0 8px 8px 0;padding:9px 12px;border-radius:999px;background:#fff3d9;border:1px solid #ead293;color:#6b4b0a;font-size:14px;font-weight:800;">Print attached receipt</span>
                    <span style="display:inline-block;margin:0 8px 8px 0;padding:9px 12px;border-radius:999px;background:#e8f0fb;border:1px solid #c8d6e8;color:#253e5d;font-size:14px;font-weight:800;">Place with order</span>
                  </div>
                </div>
              </td>
            </tr>
            <tr>
              <td style="padding:28px;">
                <div style="padding:0 0 22px;border-bottom:1px solid #ded8ca;">
                  <div style="font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:#817867;font-weight:900;">Pickup</div>
                  <div style="font-size:34px;line-height:1.05;color:#172318;font-weight:900;margin-top:8px;">${escapeHtml(readyLabel)}</div>
                  <div style="font-size:20px;line-height:1.35;color:#50493e;margin-top:8px;">${escapeHtml(location.name)}<br>${escapeHtml(location.address1)}<br>${escapeHtml(location.address2)}</div>
                </div>

                <div style="padding:22px 0;border-bottom:1px solid #ded8ca;">
                  <div style="font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:#817867;font-weight:900;">Customer</div>
                  <div style="font-size:28px;line-height:1.15;color:#172318;font-weight:900;margin-top:8px;">${escapeHtml(customerName)}</div>
                  ${customerPhone ? `<div style="font-size:18px;color:#50493e;margin-top:8px;">Phone: <strong>${escapeHtml(customerPhone)}</strong></div>` : ''}
                  ${customerEmail ? `<div style="font-size:18px;color:#50493e;margin-top:6px;">Email: <a href="mailto:${escapeHtml(customerEmail)}" style="color:#1757a6;">${escapeHtml(customerEmail)}</a></div>` : ''}
                </div>

                <div style="padding:22px 0 0;">
                  <div style="font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:#817867;font-weight:900;">Order items</div>
                  ${itemRows}
                </div>

                <div style="padding:18px 0 0;">
                  <div style="font-size:13px;letter-spacing:.14em;text-transform:uppercase;color:#817867;font-weight:900;">Order total</div>
                  <div style="font-size:34px;color:#172318;font-weight:900;margin-top:6px;">${formatMoney(totalDollars)}</div>
                </div>
              </td>
            </tr>
            <tr>
              <td style="background:#f4f3ee;padding:22px 28px;color:#5d5548;font-size:14px;line-height:1.5;">
                Receipt PDF is attached for letter-size printing. Customer support: <strong>(623) 263-3386</strong>.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function wrapPdfText(text, maxChars) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    if ((line + ' ' + word).trim().length > maxChars && line) {
      lines.push(line);
      line = word;
    } else {
      line = `${line} ${word}`.trim();
    }
  }
  if (line) lines.push(line);
  return lines;
}

function pdfEscape(text) {
  return String(text ?? '').replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

async function getReceiptLogoImage() {
  try {
    const [{ existsSync, readFileSync }, { resolve }, sharpModule] = await Promise.all([
      import('fs'),
      import('path'),
      import('sharp'),
    ]);
    const logoPath = resolve(process.cwd(), 'client/public/email-assets/ssw-logo.png');
    if (!existsSync(logoPath)) return null;
    const sharp = sharpModule.default;
    const image = sharp(readFileSync(logoPath)).flatten({ background: '#ffffff' });
    const meta = await image.metadata();
    const buffer = await image.jpeg({ quality: 88, mozjpeg: true }).toBuffer();
    return { buffer, width: meta.width || 2083, height: meta.height || 729 };
  } catch (err) {
    console.warn('[pickup-receipt] logo embed skipped:', err?.message || err);
    return null;
  }
}

async function buildPickupReceiptPdfBuffer({ order, orderItems, pickupLabel }) {
  const formattedItems = formatPickupLineItems(order, orderItems);
  const location = pickupLocationDetails(order);
  const orderRef = order?.order_number?.slice(0, 8) || String(order?.id || '');
  const totalDollars = Number(order?.total_amount ?? order?.total ?? 0);
  const customerName = order?.customer_name || order?.business_name || 'Customer';
  const customerPhone = formatPhone(order?.phone || order?.customer_phone || '');
  const customerEmail = order?.customer_email || order?.email || '';
  const paidAt = order?.paid_at ? new Date(order.paid_at) : null;
  const paidLabel = paidAt && !Number.isNaN(paidAt.getTime())
    ? new Intl.DateTimeFormat('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZone: 'America/Phoenix',
      timeZoneName: 'short',
    }).format(paidAt)
    : 'Payment received';
  const logo = await getReceiptLogoImage();

  const commands = [];
  const setColor = (r, g, b) => commands.push(`${r} ${g} ${b} rg ${r} ${g} ${b} RG`);
  const rect = (x, y, w, h, fill = false) => commands.push(`${x} ${y} ${w} ${h} re ${fill ? 'f' : 'S'}`);
  const text = (value, x, y, size = 11, font = 'F1', align = 'left') => {
    const safe = pdfEscape(value);
    const approxWidth = String(value || '').length * size * 0.52;
    const tx = align === 'right' ? x - approxWidth : align === 'center' ? x - approxWidth / 2 : x;
    commands.push('BT');
    commands.push(`/${font} ${size} Tf`);
    commands.push(`1 0 0 1 ${tx.toFixed(2)} ${y.toFixed(2)} Tm (${safe}) Tj`);
    commands.push('ET');
  };

  setColor(1, 1, 1);
  rect(0, 0, 612, 792, true);
  if (logo) {
    const logoWidth = 190;
    const logoHeight = logoWidth * (logo.height / logo.width);
    commands.push(`q ${logoWidth} 0 0 ${logoHeight.toFixed(2)} ${(306 - logoWidth / 2).toFixed(2)} 704 cm /Im1 Do Q`);
  } else {
    setColor(0.1, 0.23, 0.13);
    text('SOIL SEED & WATER', 306, 718, 24, 'F2', 'center');
  }
  setColor(0.43, 0.38, 0.31);
  text('Organic Soil Wholesale Pickup Receipt', 306, 684, 12, 'F1', 'center');
  setColor(0.1, 0.23, 0.13);
  commands.push('54 666 m 558 666 l S');

  const details = [
    ['Receipt / Order', `#${orderRef}`],
    ['Customer', customerName],
    ['Phone', customerPhone || '-'],
    ['Email', customerEmail || '-'],
    ['Paid at', paidLabel],
    ['Pickup ready', pickupLabel || 'Confirm ready time'],
  ];
  let y = 620;
  details.forEach(([label, value], index) => {
    setColor(0.86, 0.84, 0.78);
    commands.push(`62 ${y - 10} m 550 ${y - 10} l S`);
    setColor(0.27, 0.25, 0.21);
    text(label, 72, y, 11, 'F1');
    setColor(0, 0, 0);
    text(value, 540, y, 11, index === 0 ? 'F2' : 'F1', 'right');
    y -= 28;
  });

  setColor(0.1, 0.23, 0.13);
  rect(62, 426, 488, 34, false);
  text('PAID - CARD PAYMENT RECEIVED', 306, 438, 16, 'F2', 'center');

  setColor(0.1, 0.23, 0.13);
  text('Pickup Location', 62, 398, 14, 'F2');
  setColor(0.25, 0.23, 0.19);
  text(`${location.name} - ${location.address1}, ${location.address2}`, 62, 378, 11, 'F1');

  setColor(0.1, 0.23, 0.13);
  text('Items', 62, 348, 14, 'F2');
  setColor(0.98, 0.98, 0.96);
  rect(62, 312, 488, 28, true);
  setColor(0.27, 0.25, 0.21);
  text('Qty', 76, 322, 10, 'F2');
  text('Product', 116, 322, 10, 'F2');
  text('Size', 252, 322, 10, 'F2');
  text('Unit', 446, 322, 10, 'F2', 'right');
  text('Total', 540, 322, 10, 'F2', 'right');
  setColor(0.86, 0.82, 0.74);
  rect(62, 312, 488, 28, false);

  let itemY = 286;
  formattedItems.forEach((item) => {
    const unit = (Number(item.total) || 0) / (Number(item.quantity) || 1);
    setColor(0.86, 0.82, 0.74);
    rect(62, itemY - 8, 488, 30, false);
    setColor(0, 0, 0);
    text(String(item.quantity), 86, itemY, 11, 'F1', 'center');
    text(item.productName, 116, itemY, 11, 'F1');
    text(item.size || '-', 252, itemY, 11, 'F1');
    text(formatMoney(unit), 446, itemY, 11, 'F1', 'right');
    text(formatMoney(item.total), 540, itemY, 11, 'F1', 'right');
    itemY -= 30;
  });

  const totalsY = Math.min(itemY - 20, 230);
  setColor(0, 0, 0);
  text('Subtotal', 72, totalsY, 12, 'F1');
  text(formatMoney(totalDollars), 540, totalsY, 12, 'F1', 'right');
  text('Tax', 72, totalsY - 28, 12, 'F1');
  text(formatMoney(0), 540, totalsY - 28, 12, 'F1', 'right');
  setColor(0.1, 0.23, 0.13);
  commands.push(`62 ${totalsY - 42} m 550 ${totalsY - 42} l S`);
  setColor(0, 0, 0);
  text('Total Paid', 72, totalsY - 62, 13, 'F2');
  text(formatMoney(totalDollars), 540, totalsY - 62, 13, 'F2', 'right');

  setColor(0.77, 0.71, 0.61);
  commands.push('54 92 m 558 92 l S');
  setColor(0.25, 0.23, 0.19);
  text('Questions? Call or text Soil Seed & Water at (623) 263-3386.', 62, 72, 11, 'F1');
  text('Thank you for choosing Organic Soil Wholesale.', 62, 56, 11, 'F1');

  const stream = commands.join('\n');
  const resources = logo
    ? '/Font << /F1 4 0 R /F2 5 0 R >> /XObject << /Im1 7 0 R >>'
    : '/Font << /F1 4 0 R /F2 5 0 R >>';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << ${resources} >> /Contents 6 0 R >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
  ];
  if (logo) {
    objects.push(`<< /Type /XObject /Subtype /Image /Width ${logo.width} /Height ${logo.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${logo.buffer.length} >>\nstream\n${logo.buffer.toString('binary')}\nendstream`);
  }
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((obj, index) => {
    offsets.push(Buffer.byteLength(pdf, 'binary'));
    pdf += `${index + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(pdf, 'binary');
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(pdf, 'binary');
}

async function sendNewPickupOrderAlerts({ order, orderItems, pickupLabel, locationId }) {
  const notify = await getPickupNotifications();
  const dev = await getDeveloperMode();
  const locId = locationId ?? order?.location_id ?? 1;
  const orderRef = order?.order_number?.slice(0, 8) || String(order?.id || '');
  const itemCount = Array.isArray(orderItems) ? orderItems.length : 0;
  const formattedItems = formatPickupLineItems(order, orderItems);
  const itemSummary = formattedItems.length
    ? formattedItems.map((item) => `${item.quantity}x ${item.productName}${item.size ? ` (${item.size})` : ''}`).join('; ')
    : `${itemCount} item${itemCount === 1 ? '' : 's'}`;
  const totalDollars = Number(order?.total_amount ?? order?.total ?? 0);
  const pickupLocation = order?.pickup_location || null;
  const smsBody = dev.devModeSmsBody(
    notify.formatNewPickupOrderSms({
      customerName: order?.customer_name || order?.business_name || 'Customer',
      customerPhone: order?.phone || '',
      orderRef,
      readyLabel: pickupLabel,
      pickupLocation,
      totalDollars,
      itemCount,
      testing: notify.isPickupNotifyTesting(),
    }),
  );

  const phones = notify.getPickupNotifySmsPhones(locId);
  if (
    phones.length &&
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    process.env.TWILIO_PHONE_NUMBER
  ) {
    const twilioAuth = Buffer.from(
      `${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`,
    ).toString('base64');
    const smsResults = await Promise.allSettled(
      phones.map(async (to) => {
        const resp = await fetch(
          `https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Messages.json`,
          {
            method: 'POST',
            headers: {
              Authorization: `Basic ${twilioAuth}`,
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
              To: to,
              From: process.env.TWILIO_PHONE_NUMBER,
              Body: smsBody,
            }).toString(),
          },
        );
        if (!resp.ok) {
          const t = await resp.text().catch(() => '');
          throw new Error(`Twilio ${resp.status}: ${t.slice(0, 120)}`);
        }
      }),
    );
    const smsSent = smsResults.filter((r) => r.status === 'fulfilled').length;
    smsResults.forEach((r) => {
      if (r.status === 'rejected') {
        console.error('[pickup-order-alert] SMS failed:', r.reason?.message || r.reason);
      }
    });
    console.log(`[pickup-order-alert] SMS sent to ${smsSent}/${phones.length} recipient(s)`);
  } else {
    console.warn('[pickup-order-alert] Twilio or notify phones not configured — skipping SMS');
  }

  try {
    const r = await getResend();
    const adminEmails = notify.getPickupNotifyEmails(locId);
    const customerName = order?.customer_name || order?.business_name || 'Customer';
    const location = pickupLocationDetails(order);
    const isRlsBrand = String(order?.notes || '').includes('Source brand: Regenerative Landscaper Supply');
    const subject = dev.devModeSubject(`${isRlsBrand ? '[RLS] ' : ''}New Pick Order | ${customerName} | ${location.name} pickup ${pickupLabel || ''}`.trim());
    const html = buildPickupOrderEmail({
      order,
      orderItems,
      pickupLabel,
      testing: notify.isPickupNotifyTesting(),
    });
    const receiptPdf = await buildPickupReceiptPdfBuffer({ order, orderItems, pickupLabel });
    const results = await Promise.allSettled(
      adminEmails.map(async (to) => {
        const result = await r.emails.send({
          from: 'Organic Soil Wholesale <info@soilseedandwater.com>',
          replyTo: 'ralvarez@soilseedandwater.com',
          to,
          subject,
          html,
          attachments: [{
            filename: `${isRlsBrand ? 'RLS' : 'OSW'}-Pickup-Receipt-${orderRef}.pdf`,
            content: receiptPdf.toString('base64'),
          }],
        });
        if (result?.error) {
          throw new Error(result.error.message || JSON.stringify(result.error));
        }
        return result;
      }),
    );
    results.forEach((result, i) => {
      if (result.status === 'rejected') {
        console.error(`[pickup-order-alert] email to ${adminEmails[i]} failed:`, result.reason?.message || result.reason);
      }
    });
    const sent = results.filter((r) => r.status === 'fulfilled').length;
    console.log(`[pickup-order-alert] admin email sent to ${sent}/${adminEmails.length}: ${adminEmails.join(', ')}`);
  } catch (emailErr) {
    console.error('[pickup-order-alert] admin email failed:', emailErr?.message || emailErr);
  }
}

export { buildPickupOrderEmail, buildPickupReceiptPdfBuffer, formatPickupLineItems };

async function formatPickupReadyLabel(pickupIso) {
  const schedule = await getPickupSchedule();
  return schedule.formatReadyLabel(pickupIso, { includeDate: true });
}

async function forwardOswPickupToMos(payload) {
  const dev = await getDeveloperMode();
  if (!dev.shouldForwardToMos()) {
    console.log('[dev-mode] MOS forward skipped for order', payload?.osw_order_id);
    return { skipped: true, reason: 'developer_mode' };
  }
  const secret = process.env.MOS_LEAD_INGEST_SECRET;
  const isDelivery = payload?.source === 'osw_pay_delivery' || payload?.fulfillment_type === 'delivery';
  const endpoint = isDelivery
    ? (process.env.MOS_DELIVERY_INGEST_URL || 'https://myorganicsoil.com/api/delivery-orders')
    : (process.env.MOS_PICKUP_INGEST_URL || 'https://myorganicsoil.com/api/pickup-orders');
  const tag = isDelivery ? 'mos-delivery-forward' : 'mos-pickup-forward';

  if (!secret) {
    console.warn(`[${tag}] MOS_LEAD_INGEST_SECRET not set — skipping`);
    return { skipped: true };
  }
  if (!payload?.customer_name || !payload?.customer_phone || !payload?.items?.length) {
    console.warn(`[${tag}] missing required fields — skipping`);
    return { skipped: true };
  }
  try {
    const r = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Lead-Source-Key': secret },
      body: JSON.stringify(payload),
    });
    if (!r.ok) {
      const text = await r.text().catch(() => '');
      const level = r.status === 404 && isDelivery ? 'warn' : 'error';
      console[level](`[${tag}] order ${payload.osw_order_id} → ${r.status}: ${text.slice(0, 200)}`);
      return { ok: false, status: r.status };
    }
    console.log(`[${tag}] order ${payload.osw_order_id} → OK`);
    return { ok: true };
  } catch (err) {
    console.error(`[${tag}] network error:`, err?.message || err);
    return { ok: false, error: String(err?.message || err) };
  }
}

/** Mark OSW checkout order paid, notify team, forward to MOS. Idempotent if already paid. */
async function fulfillOswCheckoutOrder(orderId, session = null) {
  const db = await getSupabase();
  const { data: existing } = await db.from('orders').select('payment_status').eq('id', orderId).single();
  const alreadyPaid = existing?.payment_status === 'paid';

  if (!alreadyPaid) {
    await db
      .from('orders')
      .update({
        status: 'paid',
        payment_status: 'paid',
        paid_at: new Date().toISOString(),
        stripe_payment_intent_id: session?.payment_intent || null,
      })
      .eq('id', orderId);
  }

  const { data: order } = await db.from('orders').select('*').eq('id', orderId).single();
  if (!order) return { ok: false, reason: 'order_not_found' };

  const { data: orderItems } = await db
    .from('order_items')
    .select('product_id, quantity, unit_price, total_price, size_option')
    .eq('order_id', orderId);

  const trackedValue = Number(order?.total_amount || 0)
    || Number(order?.total || 0)
    || (Array.isArray(orderItems)
      ? orderItems.reduce((sum, item) => sum + Number(item.total_price || 0), 0)
      : 0);
  const trackingPayload = {
    value: trackedValue,
    items: Array.isArray(orderItems) ? orderItems : [],
  };

  if (!alreadyPaid && Array.isArray(orderItems)) {
    const locationId = order.location_id || 1;
    for (const item of orderItems) {
      const { data: inv } = await db
        .from('inventory')
        .select('id, quantity_available, quantity_reserved')
        .eq('product_id', item.product_id)
        .eq('location_id', locationId)
        .eq('size_option', item.size_option)
        .single();
      if (inv) {
        await db.from('inventory').update({
          quantity_available: inv.quantity_available - item.quantity,
          quantity_reserved: (inv.quantity_reserved || 0) + item.quantity,
        }).eq('id', inv.id);
      }
      await db.from('order_items').update({
        status: 'reserved',
        reserved_at: new Date().toISOString(),
      }).eq('order_id', orderId).eq('product_id', item.product_id);
    }
  }

  if (alreadyPaid) {
    return { ok: true, alreadyPaid: true, order, ...trackingPayload };
  }

  const isDeliveryOrder = order?.fulfillment_type === 'delivery';
  let pickupLabel = null;
  try {
    const r = await getResend();
    const dev = await getDeveloperMode();
    const customerEmail = order?.customer_email || order?.email;
    pickupLabel = order?.pickup_scheduled_at
      ? await formatPickupReadyLabel(order.pickup_scheduled_at)
      : null;
    if (customerEmail) {
      let customerNumber = null;
      try {
        const assigned = await assignSswNumberForPurchase(db, {
          email: customerEmail,
          name: order?.customer_name || order?.business_name,
          phone: order?.phone,
        });
        customerNumber = assigned?.customerNumber || null;
      } catch (numberErr) {
        console.error('[checkout fulfill] customer number failed:', numberErr?.message || numberErr);
      }
      const thankYou = buildPurchaseThankYouEmail({
        fullName: order?.customer_name || order?.business_name,
        customerNumber,
        pickupLabel,
        location: order?.pickup_location,
        brandName: order?.brand_id === 'regenerative_landscaper_supply' ? 'Regenerative Landscaper Supply' : undefined,
      });
      const custResult = await r.emails.send({
        from: thankYou.from || PURCHASE_THANK_YOU_FROM,
        replyTo: 'ralvarez@soilseedandwater.com',
        to: dev.resolveCustomerEmail(customerEmail),
        subject: dev.devModeSubject(thankYou.subject),
        html: thankYou.html,
      });
      if (custResult?.error) {
        console.error('[checkout fulfill] customer email error:', custResult.error);
      }
    }
  } catch (emailErr) {
    console.error('[checkout fulfill] email send failed:', emailErr?.message || emailErr);
  }

  if (!isDeliveryOrder) {
    try {
      await sendNewPickupOrderAlerts({
        order,
        orderItems,
        pickupLabel,
        locationId: order?.location_id,
      });
    } catch (alertErr) {
      console.error('[checkout fulfill] pickup alerts failed:', alertErr?.message || alertErr);
    }
  }

  const mosPickupLabel = !isDeliveryOrder && order?.pickup_scheduled_at
    ? (pickupLabel || await formatPickupReadyLabel(order.pickup_scheduled_at))
    : undefined;
  await forwardOswPickupToMos({
    osw_order_id: orderId,
    osw_order_number: order?.order_number || undefined,
    customer_name: order?.customer_name || order?.business_name || 'Customer',
    customer_phone: order?.phone || '',
    customer_email: order?.customer_email || order?.email || undefined,
    items: (orderItems || []).map((item) => ({
      product_id: item.product_id,
      product_name: 'Product',
      size_option: item.size_option || '',
      quantity: item.quantity || 1,
      unit_price_cents: Math.round((item.unit_price || 0) * 100),
      total_price_cents: Math.round((item.total_price || 0) * 100),
    })),
    pickup_at: isDeliveryOrder ? null : (order?.pickup_scheduled_at || new Date().toISOString()),
    slot_label: mosPickupLabel,
    fulfillment_type: isDeliveryOrder ? 'delivery' : 'pickup',
    delivery_address: isDeliveryOrder ? order?.delivery_address || null : null,
    truck_type: isDeliveryOrder ? order?.delivery_truck_type || null : null,
    origin_yard: isDeliveryOrder ? order?.delivery_origin_yard || null : null,
    miles_round_trip: isDeliveryOrder ? order?.delivery_miles || null : null,
    hours_round_trip: isDeliveryOrder ? order?.delivery_hours || null : null,
    trucking_fee_cents: isDeliveryOrder ? order?.trucking_fee_cents || 0 : 0,
    total_cents: Math.round(((order?.total_amount) || (order?.total) || 0) * 100),
    payment_status: 'paid',
    source: isDeliveryOrder ? 'osw_pay_delivery' : 'osw_pay_pickup',
    brand_id: order?.brand_id || 'organic_soil_wholesale',
    brand_name: order?.brand_id === 'regenerative_landscaper_supply' ? 'Regenerative Landscaper Supply' : 'Organic Soil Wholesale',
  });

  if (isDeliveryOrder) {
    try {
      const { createDeliveryWorkOrderFromOswOrder } = await import('../shared/oswDeliveryIntake.js');
      await createDeliveryWorkOrderFromOswOrder(orderId);
    } catch (e) {
      console.error('[checkout fulfill] delivery intake failed:', e?.message || e);
    }
  }

  return { ok: true, order, ...trackingPayload };
}

// Admin-only failure monitor: logs every input failure to system_errors and
// emails Rodo (rate-limited to once per path per 30 min). Never throws.
const FAILURE_ALERT_TO = process.env.DEVELOPER_ALERT_TO || 'developer@bettersystems.ai';
async function reportFailure({ kind, path, method, status, message }) {
  try {
    const db = await getSupabase();
    const { data: row } = await db
      .from('system_errors')
      .insert({ kind, path, method, status, message: String(message || '').slice(0, 500) })
      .select('id')
      .single();
    // Rate-limit: skip the email if we already alerted for this path in the last 30 min.
    const since = new Date(Date.now() - 30 * 60000).toISOString();
    const { count } = await db
      .from('system_errors')
      .select('id', { count: 'exact', head: true })
      .eq('path', path)
      .eq('alerted', true)
      .gte('created_at', since);
    if ((count || 0) > 0) return;
    if (!process.env.RESEND_API_KEY) return;
    const resendClient = await getResend();
    await resendClient.emails.send({
      from: 'OSW Alerts <info@soilseedandwater.com>',
      to: FAILURE_ALERT_TO,
      subject: `⚠️ OSW input failure: ${method} ${path} (${status})`,
      text:
        `A submission failed on organicsoilwholesale.com.\n\n` +
        `Type: ${kind}\nEndpoint: ${method} ${path}\nStatus: ${status}\n` +
        `Error: ${message}\nTime: ${new Date().toISOString()}\n\n` +
        `Automated admin alert (you only). Further alerts for this endpoint are paused 30 min.`,
    });
    if (row?.id) await db.from('system_errors').update({ alerted: true }).eq('id', row.id);
  } catch (e) {
    console.error('[reportFailure] non-fatal:', e?.message || e);
  }
}

// Segment classification keywords
const SEGMENT_KEYWORDS = {
  operator: ['compost', 'processor', 'facility', 'operations', 'plant manager', 'composting', 'processing'],
  municipal: ['city', 'county', 'municipal', 'solid waste', 'public works', 'government', 'sustainability officer', 'director'],
  equipment: ['equipment', 'machinery', 'technology', 'systems', 'solutions', 'manufacturing', 'sales rep', 'vendor'],
  policy: ['policy', 'regulatory', 'epa', 'deq', 'environmental', 'advocacy', 'compliance', 'regulator'],
  esg: ['esg', 'sustainability', 'foundation', 'csr', 'corporate', 'impact', 'responsibility'],
  education: ['university', 'college', 'student', 'professor', 'research', 'education', 'academic'],
  farmer_vineyard: ['vineyard', 'winery', 'wine', 'grapes', 'viticulture'],
  farmer_orchard: ['orchard', 'pistachio', 'avocado', 'citrus', 'almond', 'apple', 'peach', 'tree fruit', 'nuts'],
  farmer_general: ['farm', 'agriculture', 'grower', 'ranch', 'crop', 'farmer', 'ag'],
  waste_hauler: ['hauler', 'waste management', 'logistics', 'trucking', 'disposal', 'collection', 'hauling'],
  landscaper: ['landscape', 'nursery', 'garden center', 'horticulture', 'lawn', 'landscaping'],
};

function classifySegment(title, company) {
  const searchText = `${title} ${company}`.toLowerCase();
  for (const [segment, keywords] of Object.entries(SEGMENT_KEYWORDS)) {
    for (const keyword of keywords) {
      if (searchText.includes(keyword.toLowerCase())) {
        return segment;
      }
    }
  }
  return 'other';
}

async function enrichCompany(company, website) {
  if (!website && !company) return null;

  try {
    let websiteContent = '';
    if (website) {
      let cleanWebsite = website.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '');
      const jinaUrl = `https://r.jina.ai/https://${cleanWebsite}`;

      try {
        const response = await fetch(jinaUrl, {
          headers: { 'Accept': 'text/plain' },
          signal: AbortSignal.timeout(15000),
        });

        if (response.ok) {
          const content = await response.text();
          websiteContent = content.substring(0, 4000);
        }
      } catch (e) {
        console.log('[WebEnrich] Jina failed, trying direct fetch');
        try {
          const directResponse = await fetch(`https://${cleanWebsite}`, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            signal: AbortSignal.timeout(5000),
          });
          if (directResponse.ok) {
            const html = await directResponse.text();
            const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
            const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i);
            const title = titleMatch?.[1]?.trim() || '';
            const description = descMatch?.[1]?.trim() || '';
            if (title || description) {
              websiteContent = `Company: ${company}\nTitle: ${title}\nDescription: ${description}`;
            }
          }
        } catch (e2) {}
      }
    }

    if (websiteContent.length > 100) {
      const ai = await getAnthropic();
      const response = await ai.messages.create({
        model: 'claude-3-haiku-20240307',
        max_tokens: 200,
        messages: [{
          role: 'user',
          content: `Summarize this company in 2-3 sentences. Focus on what they DO. If you can't determine, say "Unable to determine".\n\nCompany: ${company}\nWebsite: ${websiteContent}\n\nReturn ONLY the summary.`
        }]
      });
      const summary = response.content[0]?.text?.trim();
      if (summary && !summary.toLowerCase().includes('unable to determine')) {
        return summary;
      }
    }
    return null;
  } catch (error) {
    console.error('Error enriching company:', error);
    return null;
  }
}

async function generateFollowUpEmail(input) {
  const { contact, segment, event, contextNotes, companyResearch } = input;
  const ai = await getAnthropic();

  const prompt = `You are Rodo Alvarez from Soil Seed & Water, writing a brief follow-up email after meeting someone at a conference.

RULES:
1. Sound like a REAL PERSON - casual, friendly
2. Keep it to 3-5 sentences MAX
3. Use contractions (don't, won't, that's, I'm)
4. NO corporate speak, NO buzzwords
5. NO pitching products - just a friendly connection
6. Sign off as just "Rodo"

${companyResearch ? `WEBSITE RESEARCH - mention something specific from this:
${companyResearch}` : ''}

${contextNotes ? `CONVERSATION NOTES:\n${contextNotes}` : ''}

CONTACT:
- Name: ${contact.firstName} ${contact.lastName}
- Company: ${contact.company || 'Unknown'}
- Title: ${contact.title || 'Unknown'}
- Event: ${event}

${!contextNotes && !companyResearch ? 'NOTE: No specific context. Write a clean, friendly generic email.' : ''}

Write ONLY the email body. No subject line. No signature block.`;

  try {
    const response = await ai.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }]
    });

    const emailBody = response.content[0]?.text?.trim();
    if (!emailBody || emailBody.length < 50) throw new Error('Email too short');

    return {
      subject: `Great meeting you at ${event}, ${contact.firstName}`,
      body: emailBody,
      tokensUsed: (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0),
    };
  } catch (error) {
    return {
      subject: `Great meeting you at ${event}, ${contact.firstName}`,
      body: `Hey ${contact.firstName},\n\nGood meeting you at ${event}. Always cool to connect with people in this space.\n\nLet me know if you ever want to grab coffee and talk shop.\n\nRodo`,
      tokensUsed: 0,
    };
  }
}

function validateEmail(email) {
  const issues = [];
  if (!email.subject || email.subject.length < 10) issues.push('Subject too short');
  if (!email.body || email.body.length < 50) issues.push('Body too short');
  if (/\[.*?\]/.test(email.body) || /\{.*?\}/.test(email.body)) issues.push('Contains placeholders');
  return { valid: issues.length === 0, issues };
}

async function ensureRepresentativeForAdmin(db, adminId) {
  const { data: existingRep } = await db.from("representatives").select("id").eq("admin_id", adminId).single();
  if (existingRep) return existingRep.id;

  const { data: admin } = await db.from("admin_users").select("*").eq("id", adminId).single();
  if (!admin) return null;

  const { data: newRep, error } = await db.from("representatives").insert({
    admin_id: adminId,
    name: admin.full_name || "Admin",
    email: admin.email,
    phone: admin.phone,
    photo_url: admin.photo_url,
    slug: admin.slug,
    title: admin.title || "Team Member",
    bio: admin.bio,
    is_active: true,
  }).select("id").single();

  return newRep?.id || null;
}

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const url = new URL(req.url, `https://${req.headers.host}`);
  const path = url.pathname;
  const startedAt = Date.now();
  const vercelRequestId = Array.isArray(req.headers['x-vercel-id'])
    ? req.headers['x-vercel-id'][0]
    : req.headers['x-vercel-id'];
  const requestId = vercelRequestId || crypto.randomUUID();
  const isLeadSubmission = path === '/api/leads/submit' && req.method === 'POST';
  if (isLeadSubmission) res.setHeader('X-OSW-Request-ID', requestId);

  try {
    // Health check
    if (path === '/api/health') {
      return res.json({ status: 'ok', timestamp: new Date().toISOString() });
    }

    if (path === '/api/cron/giveaway-reminders' && req.method === 'GET') {
      if (!process.env.CRON_SECRET || req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      // This one-time campaign must not keep querying providers indefinitely.
      if (Date.now() > Date.parse('2026-10-04T11:00:00-07:00')) {
        return res.json({ skipped: 'campaign_finished' });
      }
      const { default: pg } = await import('pg');
      const { runGiveawayReminderQueue } = await import('../shared/giveawayReminderQueue.js');
      const client = new pg.Client({ connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 5000 });
      await client.connect();
      try { return res.json(await runGiveawayReminderQueue(client)); }
      finally { await client.end(); }
    }

    if (path === '/api/giveaway/reminders/sms-status' && req.method === 'POST') {
      const { validTwilioCallback, recordSmsStatus } = await import('../shared/giveawayReminderQueue.js');
      if (!validTwilioCallback(req.headers['x-twilio-signature'], req.body, process.env.GIVEAWAY_TWILIO_AUTH_TOKEN)) {
        return res.status(403).json({ error: 'Invalid signature' });
      }
      const { default: pg } = await import('pg');
      const client = new pg.Client({ connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 5000 });
      await client.connect();
      try { await recordSmsStatus(client, req.body); return res.status(204).end(); }
      finally { await client.end(); }
    }

    // Daily Day-3 worm-castings pickup reminders (Vercel Cron)
    if (path === '/api/cron/worm-castings-day3' && req.method === 'GET') {
      const cronSecret = process.env.CRON_SECRET;
      const authHeader = req.headers.authorization || '';
      if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      if (!WORM_CASTINGS_PUBLIC_SIGNUP_OPEN) {
        return res.json({ skipped: true, reason: 'august_campaign_ended', sent: 0 });
      }

      const { default: pg } = await import('pg');
      const { Resend } = await import('resend');
      const client = new pg.Client({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false },
      });
      const resendClient = new Resend(process.env.RESEND_API_KEY);
      const limit = Math.min(Number(url.searchParams.get('limit') || 50), 100);

      await client.connect();
      try {
        const summary = await processDay3Reminders(client, resendClient, {
          apply: true,
          limit,
          delayMs: 250,
          sourceApp: 'organic_soil_wholesale_day3_reminder_cron',
        });
        return res.json(summary);
      } finally {
        await client.end();
      }
    }

    // Daily privacy-light digest of checkout journeys that stopped before payment.
    if (path === '/api/cron/checkout-monitor' && req.method === 'GET') {
      const cronSecret = process.env.CRON_SECRET;
      if (!cronSecret || req.headers.authorization !== `Bearer ${cronSecret}`) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const db = await getSupabase();
      const cutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { data: stale, error } = await db
        .from('checkout_monitor_sessions')
        .select('*')
        .in('status', CHECKOUT_ABANDONMENT_STATUSES)
        .lt('last_seen_at', cutoff)
        .is('abandoned_alerted_at', null)
        .order('last_seen_at', { ascending: true })
        .limit(100);
      if (error) throw error;
      if (!stale?.length) return res.json({ ok: true, abandoned: 0, alerted: false });

      const rows = stale.map((entry) => `<tr>
        <td>${escapeHtml(entry.stage)}</td><td>${escapeHtml(entry.fulfillment_type || '—')}</td>
        <td>${escapeHtml(entry.item_count)}</td><td>$${Number(entry.cart_value || 0).toFixed(2)}</td>
        <td>${escapeHtml(entry.order_id || '—')}</td><td>${escapeHtml(entry.last_seen_at)}</td>
      </tr>`).join('');
      const emailResult = await (await getResend()).emails.send({
        from: process.env.CHECKOUT_ALERT_FROM || 'OSW Alerts <info@soilseedandwater.com>',
        replyTo: 'developer@bettersystems.ai',
        to: [CHECKOUT_ALERT_TO],
        subject: `[OSW checkout] ${stale.length} shopper${stale.length === 1 ? '' : 's'} did not complete purchase`,
        html: `<h2>${stale.length} shopper${stale.length === 1 ? '' : 's'} did not complete purchase</h2><p>This is normal customer behavior, not a website error. Each shopper left checkout before payment and had no completed order.</p>
          <table border="1" cellpadding="6" cellspacing="0"><thead><tr><th>Last checkout step</th><th>Type</th><th>Items</th><th>Cart value</th><th>Order</th><th>Last activity</th></tr></thead><tbody>${rows}</tbody></table>
          <p>This monitor does not collect IP addresses, browser fingerprints, emails, phones, or addresses.</p>`,
      });
      if (emailResult?.error) throw new Error(emailResult.error.message || 'Digest email failed');
      const now = new Date().toISOString();
      await db.from('checkout_monitor_sessions').update({
        status: 'abandoned', abandoned_alerted_at: now, updated_at: now,
      }).in('session_id', stale.map((entry) => entry.session_id));
      console.log(JSON.stringify({ event: 'checkout_abandonment_digest_sent', count: stale.length }));
      return res.json({ ok: true, abandoned: stale.length, alerted: true });
    }

    // Hourly 24h post-purchase survey letter for new SSW Sales Portal buyers.
    // Customer send is off unless SURVEY_LETTER_SEND_ACTIVE=true.
    if (path === '/api/cron/portal-survey-letter' && req.method === 'GET') {
      const cronSecret = process.env.CRON_SECRET;
      if (!cronSecret || req.headers.authorization !== `Bearer ${cronSecret}`) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { default: pg } = await import('pg');
      const { Resend } = await import('resend');
      const client = new pg.Client({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false },
      });
      const resendClient = new Resend(process.env.RESEND_API_KEY);
      const limit = Math.min(Number(url.searchParams.get('limit') || 50), 100);

      await client.connect();
      try {
        const summary = await processPortalSurveyLetters(client, resendClient, { limit });
        return res.json(summary);
      } finally {
        await client.end();
      }
    }

    // Public site flags (developer mode banner on checkout, etc.)
    if (path === '/api/site-config' && req.method === 'GET') {
      const dev = await getDeveloperMode();
      return res.json(dev.getDevSiteConfig());
    }

    const db = await getSupabase();

    if (path === '/api/job-applications/upload-url' && req.method === 'POST') {
      try {
        const document = validateJobApplicationUpload(req.body || {});
        const { data, error } = await db.storage.from(JOB_APPLICATION_BUCKET)
          .createSignedUploadUrl(document.path, { upsert: false });
        if (error || !data?.token) throw error || new Error('No upload token returned');
        return res.json({ path: document.path, token: data.token });
      } catch (error) {
        const known = error instanceof JobApplicationError;
        console.error(JSON.stringify({ event: 'job_application_upload_url_failed', requestId, code: error?.code, message: error?.message || String(error) }));
        return res.status(known ? error.status : 500).json({
          error: known ? error.message : 'We could not prepare the document upload. Please try again.',
          code: known ? error.code : 'upload_url_failed',
        });
      }
    }

    if (path === '/api/job-applications/cleanup' && req.method === 'POST') {
      try {
        const result = await cleanupUnsavedJobApplication({ db, applicationId: req.body?.applicationId });
        return res.json(result);
      } catch (error) {
        const known = error instanceof JobApplicationError;
        console.error(JSON.stringify({ event: 'job_application_cleanup_failed', requestId, code: error?.code, message: error?.message || String(error) }));
        return res.status(known ? error.status : 500).json({
          error: known ? error.message : 'Document cleanup failed.',
          code: known ? error.code : 'cleanup_failed',
        });
      }
    }

    if (path === '/api/job-applications' && req.method === 'POST') {
      try {
        const result = await processJobApplication({ db, resend: await getResend(), body: req.body || {} });
        console.log(JSON.stringify({ event: 'job_application_submitted', requestId, applicationId: result.applicationId }));
        return res.status(201).json(result);
      } catch (error) {
        const known = error instanceof JobApplicationError;
        console.error(JSON.stringify({ event: 'job_application_failed', requestId, code: error?.code, message: error?.message || String(error) }));
        let applicationWasSaved = false;
        try {
          await cleanupUnsavedJobApplication({ db, applicationId: req.body?.applicationId });
        } catch (cleanupError) {
          if (cleanupError?.code === 'application_saved') {
            applicationWasSaved = true;
          } else {
            console.error(JSON.stringify({ event: 'job_application_failure_cleanup_failed', requestId, message: cleanupError?.message || String(cleanupError) }));
          }
        }
        return res.status(applicationWasSaved ? 502 : known ? error.status : 500).json({
          error: applicationWasSaved
            ? 'Your application was saved, but a confirmation could not be delivered. Please try once more.'
            : known ? error.message : 'We could not submit your application. Please try again.',
          code: applicationWasSaved ? 'notification_failed' : known ? error.code : 'application_failed',
        });
      }
    }

    // Defense in depth: these public paths must be routed to api/stripe-webhook.js,
    // where the untouched request bytes are verified. Never process parsed bodies.
    if (req.method === 'POST' && (path === '/api/checkout/webhook' || path === '/api/webhooks/stripe')) {
      return res.status(503).json({ error: 'Raw Stripe webhook route is unavailable' });
    }

    // Browser journey updates. Payload intentionally excludes customer identity.
    if (path === '/api/checkout/monitor' && req.method === 'POST') {
      const startedAt = Date.now();
      try {
        const body = req.body || {};
        const monitor = await recordCheckoutEvent(db, {
          sessionId: body.sessionId,
          event: body.event,
          fulfillment: body.fulfillment,
          itemCount: body.itemCount,
          cartValue: body.cartValue,
          errorCode: body.event === 'checkout_error' ? 'browser_checkout_error' : undefined,
          errorMessage: body.event === 'checkout_error' ? body.errorMessage : undefined,
        });
        if (req.body?.event === 'stripe_canceled' && monitor.order_id && monitor.stripe_checkout_session_id) {
          await notifyCheckoutIssue(
            db,
            monitor,
            'Shopper did not complete purchase',
            'Shopper left Stripe before paying',
            'This is not a website error. The shopper reached Stripe Checkout and returned without completing payment.',
          );
        }
        console.log(JSON.stringify({
          event: 'checkout_monitor_event',
          monitorEvent: req.body?.event,
          sessionId: monitor.session_id,
          durationMs: Date.now() - startedAt,
        }));
        return res.json({ ok: true });
      } catch (error) {
        const badRequest = /Invalid checkout monitor/.test(error?.message || '');
        console.error(JSON.stringify({ event: 'checkout_monitor_rejected', message: error?.message || String(error) }));
        return res.status(badRequest ? 400 : 500).json({ error: badRequest ? error.message : 'Monitor update failed' });
      }
    }

    // Only the raw-body webhook function can call this processor. It signs the
    // exact JSON it forwards after Stripe signature verification succeeds.
    if (path === '/api/stripe/process-verified-event' && req.method === 'POST') {
      const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
      const supplied = String(req.headers['x-osw-internal-signature'] || '');
      const body = JSON.stringify(req.body || {});
      const expected = webhookSecret
        ? crypto.createHmac('sha256', webhookSecret).update(body).digest('hex')
        : '';
      const valid = supplied.length === expected.length && supplied.length > 0
        && crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
      if (!valid) return res.status(401).json({ error: 'Unauthorized' });

      const event = req.body;
      const session = event?.data?.object;
      if (!event?.id || !event?.type) return res.status(400).json({ error: 'Invalid event' });

      if (event.type === 'checkout.session.completed') {
        const orderId = parseInt(String(session?.metadata?.order_id || ''), 10);
        if (orderId && session?.metadata?.type === 'deposit') {
          await fulfillStripeDeposit(db, orderId, session);
        } else if (orderId) {
          await fulfillOswCheckoutOrder(orderId, session);
          const monitorId = session?.metadata?.checkout_monitor_id;
          if (isCheckoutMonitorSessionId(monitorId)) {
            await safeRecordCheckoutEvent(db, {
              sessionId: monitorId,
              event: 'payment_completed',
              orderId,
              stripeSessionId: session.id,
              fulfillment: session?.metadata?.fulfillment_type,
            });
          }
        }
      } else if (event.type === 'checkout.session.expired') {
        const monitorId = session?.metadata?.checkout_monitor_id;
        if (isCheckoutMonitorSessionId(monitorId)) {
          const monitor = await safeRecordCheckoutEvent(db, {
            sessionId: monitorId,
            event: 'stripe_canceled',
            orderId: Number(session?.metadata?.order_id) || undefined,
            stripeSessionId: session.id,
            errorCode: 'stripe_session_expired',
            errorMessage: 'Stripe Checkout session expired before payment.',
          });
          await notifyCheckoutIssue(
            db,
            monitor,
            'Shopper did not complete purchase',
            'Shopper did not complete payment before checkout expired',
            'This is not a website error. The Stripe Checkout session expired before the shopper completed payment.',
          );
        }
      } else if (event.type === 'payment_intent.payment_failed') {
        const orderId = parseInt(String(session?.metadata?.order_id || ''), 10);
        let orderContact = null;
        if (orderId) {
          const { data, error: orderUpdateError } = await db
            .from('orders')
            .update({ payment_status: 'failed', status: 'payment_failed' })
            .eq('id', orderId)
            .select('customer_name,customer_email,email,phone,pickup_scheduled_at,pickup_location')
            .maybeSingle();
          orderContact = data;
          if (orderUpdateError) {
            console.error(JSON.stringify({ event: 'payment_failed_order_update_failed', orderId }));
          }
        }
        const monitorId = session?.metadata?.checkout_monitor_id;
        if (isCheckoutMonitorSessionId(monitorId)) {
          const message = session?.last_payment_error?.message || 'Stripe reported a failed payment.';
          const monitor = await safeRecordCheckoutEvent(db, {
            sessionId: monitorId,
            event: 'payment_failed',
            orderId: orderId || undefined,
            errorCode: session?.last_payment_error?.code || 'payment_failed',
            errorMessage: message,
          });
          await notifyCheckoutIssue(
            db,
            monitor,
            'Customer payment declined — no charge, no fulfillment',
            'Customer payment declined — no charge, no fulfillment',
            `${message} The website and checkout remained available.`,
            checkoutAlertFollowUpFromOrder(orderContact),
          );
        }
      }
      return res.json({ processed: true, eventId: event.id });
    }

    // ============ CONTACT FORM ============
    // Public contact form. Records to contact_submissions and forwards to the MOS
    // sales portal as a lead so the rep team sees/claims it. (Was missing in prod —
    // the route only existed in the dev Express server, so submissions 404'd.)
    if (path === '/api/contact/submit' && req.method === 'POST') {
      const { name, email, phone, company, subject, message } = req.body || {};
      if (!name || !email || !message) {
        return res.status(400).json({ error: 'Name, email, and message are required' });
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ error: 'Invalid email format' });
      }
      const submittedAt = new Date().toISOString();
      const { data: sub, error: subErr } = await db
        .from('contact_submissions')
        .insert({ name, email, phone, company, subject, message, status: 'new', created_at: submittedAt })
        .select()
        .single();
      if (subErr) {
        console.error('[contact/submit] insert failed:', subErr);
        return res.status(500).json({ error: 'Failed to submit contact form' });
      }
      // Forward to the MOS sales portal as a lead (awaited — serverless kills
      // fire-and-forget after the response returns).
      try {
        const secret = process.env.MOS_LEAD_INGEST_SECRET;
        if (secret) {
          const r = await fetch(process.env.MOS_LEAD_INGEST_URL || 'https://myorganicsoil.com/api/leads', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Lead-Source-Key': secret },
            body: JSON.stringify({
              full_name: name,
              email,
              phone: phone || undefined,
              company: company || undefined,
              message: subject ? `${subject}\n\n${message}` : message,
              source: 'osw_contact_form',
              source_url: 'https://organicsoilwholesale.com/contact',
              source_data: { osw_contact_submission_id: sub.id, subject },
            }),
          });
          if (!r.ok) console.error('[contact/submit] MOS forward', r.status, (await r.text().catch(() => '')).slice(0, 200));
        } else {
          console.warn('[contact/submit] MOS_LEAD_INGEST_SECRET not set — lead not forwarded');
        }
      } catch (e) {
        console.error('[contact/submit] MOS forward error:', e?.message || e);
      }
      return res.json({
        success: true,
        message: "Thank you for contacting us. We'll get back to you soon!",
        submissionId: sub.id,
      });
    }

    // ============ CREDIT APPLICATION ============
    // Public B2B credit application (reps share the link). Records to
    // credit_applications, emails Rodo, and forwards to the sales portal as a lead.
    if (path === '/api/credit-application/submit' && req.method === 'POST') {
      const b = req.body || {};
      if (!b.business_name || !b.contact_name || !b.email) {
        return res.status(400).json({ error: 'Business name, contact name, and email are required' });
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.email)) {
        return res.status(400).json({ error: 'Invalid email format' });
      }
      const nowIso = new Date().toISOString();
      // 1) If this applicant already has a portal account, link to it and refresh
      //    their info. customer_profiles.id is a FK to auth.users, so a prospect
      //    WITHOUT a login cannot have a profile yet — they get customer_id=null.
      //    The application below is self-contained; the admin provisions an account
      //    at approval time. (This is why anonymous submissions used to 500.)
      const profileFields = {
        full_name: b.contact_name, phone: b.phone || null, company_name: b.business_name,
        tax_id: b.tax_id || null, account_type: b.business_type || null, application_status: 'submitted',
      };
      let customerId = null;
      const { data: existingProfile } = await db
        .from('customer_profiles').select('id').eq('email', b.email.toLowerCase()).maybeSingle();
      if (existingProfile) {
        customerId = existingProfile.id;
        await db.from('customer_profiles').update(profileFields).eq('id', customerId);
      }
      // 2) Create the application record the admin reviews.
      const credit_references = {
        trade_ref_1: { company: b.trade_ref1, phone: b.trade_ref1_phone },
        trade_ref_2: { company: b.trade_ref2, phone: b.trade_ref2_phone },
        bank: { name: b.bank_name, contact: b.bank_contact },
        requested_credit_limit: b.requested_credit_limit,
        estimated_monthly_volume: b.estimated_monthly_volume,
        signature_name: b.signature_name, signature_date: b.signature_date,
        business_address: { address: b.address, city: b.city, state: b.state, zip: b.zip },
        website: b.website,
      };
      const { data: app, error: appErr } = await db
        .from('customer_applications')
        .insert({
          customer_id: customerId,
          legal_entity_name: b.business_name,
          dba_name: b.dba || null,
          ein_tax_id: b.tax_id || null,
          business_type: b.business_type || null,
          years_in_business: b.years_in_business ? (parseInt(b.years_in_business, 10) || null) : null,
          ops_contact_name: b.contact_name, ops_contact_title: b.contact_title || null,
          ops_contact_email: b.email, ops_contact_phone: b.phone || null,
          preferred_payment_terms: b.requested_terms || null,
          credit_references,
          status: 'submitted', submitted_at: nowIso, created_at: nowIso,
        })
        .select().single();
      if (appErr) {
        console.error('[credit-application] application insert failed:', appErr);
        return res.status(500).json({ error: 'Failed to submit application' });
      }
      try {
        if (process.env.RESEND_API_KEY) {
          const resendClient = await getResend();
          await resendClient.emails.send({
            from: 'Organic Soil Wholesale <info@soilseedandwater.com>',
            to: 'rodolfo@bettersystems.ai',
            subject: `New Credit Application: ${b.business_name}`,
            text:
              `New wholesale credit application.\n\n` +
              `Business: ${b.business_name}${b.dba ? ` (DBA ${b.dba})` : ''}\n` +
              `Type: ${b.business_type || '-'}  |  Years: ${b.years_in_business || '-'}  |  Tax ID: ${b.tax_id || '-'}\n` +
              `Contact: ${b.contact_name}${b.contact_title ? ', ' + b.contact_title : ''}\n` +
              `Email: ${b.email}  |  Phone: ${b.phone || '-'}\n` +
              `Requested credit: ${b.requested_credit_limit || '-'}  |  Terms: ${b.requested_terms || '-'}  |  Est. monthly: ${b.estimated_monthly_volume || '-'}\n\n` +
              `Application ID: ${app.id}`,
          });
        }
      } catch (e) { console.error('[credit-application] email error:', e?.message); }
      try {
        const secret = process.env.MOS_LEAD_INGEST_SECRET;
        if (secret) {
          await fetch(process.env.MOS_LEAD_INGEST_URL || 'https://myorganicsoil.com/api/leads', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Lead-Source-Key': secret },
            body: JSON.stringify({
              full_name: b.contact_name, email: b.email, phone: b.phone || undefined, company: b.business_name,
              message: `Credit application — requested ${b.requested_credit_limit || 'n/a'}, terms ${b.requested_terms || 'n/a'}, est. monthly ${b.estimated_monthly_volume || 'n/a'}`,
              source: 'osw_credit_application',
              source_url: 'https://organicsoilwholesale.com/credit-application',
              source_data: { credit_application_id: app.id },
            }),
          });
        }
      } catch (e) { console.error('[credit-application] MOS forward error:', e?.message); }
      // 4) If this came from a "Send Credit App" link in the sales portal
      //    (?c=<sp_customers.id>), close the loop and mark that contact submitted.
      try {
        const refContactId = parseInt(b.ref_contact_id, 10);
        if (refContactId) {
          await db.from('sp_customers').update({
            credit_app_status: 'submitted',
            credit_app_submitted_at: nowIso,
            credit_app_application_id: app.id,
            updated_at: nowIso,
          }).eq('id', refContactId);
        }
      } catch (e) { console.error('[credit-application] contact linkback error:', e?.message); }
      return res.json({
        success: true,
        message: 'Your credit application has been submitted. We will review it and follow up shortly.',
        applicationId: app.id,
      });
    }

    // ============ CRM ENDPOINTS ============

    // Analyze business card with Claude Vision (accepts base64 image)
    const analyzeMatch = path.match(/^\/api\/representatives\/([^\/]+)\/analyze-business-card$/);
    if (analyzeMatch && req.method === 'POST') {
      const { imageBase64, mimeType } = req.body || {};

      if (!imageBase64) {
        return res.status(400).json({ error: 'No image provided. Send imageBase64 field.' });
      }

      // Extract base64 data, handling data URL format
      let base64Data = imageBase64;
      let detectedMimeType = mimeType || 'image/jpeg';

      // If it's a data URL, extract the base64 part and detect mime type
      if (imageBase64.includes(',')) {
        const parts = imageBase64.split(',');
        base64Data = parts[1];
        // Extract mime type from data URL if present
        const dataUrlMatch = parts[0].match(/data:([^;]+)/);
        if (dataUrlMatch) {
          detectedMimeType = dataUrlMatch[1];
        }
      }

      // Validate mime type - Claude supports these
      const validImageTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
      if (!validImageTypes.includes(detectedMimeType)) {
        // Default to jpeg if unknown
        detectedMimeType = 'image/jpeg';
      }

      const ai = await getAnthropic();
      const response = await ai.messages.create({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 500,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: detectedMimeType,
                data: base64Data,
              },
            },
            {
              type: 'text',
              text: `Extract contact information from this business card. Return ONLY valid JSON:
{
  "firstName": "first name only",
  "lastName": "last name only",
  "email": "email exactly as shown",
  "phone": "phone exactly as shown",
  "companyName": "company name",
  "title": "job title",
  "address": "full address if visible",
  "website": "website URL if shown"
}
Use "" for fields you cannot clearly read. NEVER guess.`
            },
          ],
        }],
      });

      const content = response.content[0]?.text || '';
      let extractedData;
      try {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        extractedData = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
      } catch (e) {
        extractedData = {};
      }

      const defaults = { firstName: '', lastName: '', email: '', phone: '', companyName: '', title: '', address: '', website: '' };
      extractedData = { ...defaults, ...extractedData };

      return res.json({ success: true, extractedData });
    }

    // Classify segment
    if (path === '/api/representatives/classify-segment' && req.method === 'POST') {
      const { title, company } = req.body || {};
      if (!title && !company) return res.status(400).json({ error: 'Title or company required' });
      return res.json({ segment: classifySegment(title || '', company || '') });
    }

    // Enrich company
    if (path === '/api/representatives/enrich-company' && req.method === 'POST') {
      const { company, website } = req.body || {};
      if (!company && !website) return res.status(400).json({ error: 'Company or website required' });
      const companyContext = await enrichCompany(company, website);
      return res.json({ success: true, companyContext, hasData: !!companyContext });
    }

    // Transcribe audio (accepts base64 audio)
    if (path === '/api/representatives/transcribe' && req.method === 'POST') {
      const { audioBase64, mimeType } = req.body || {};
      if (!audioBase64) return res.status(400).json({ error: 'No audio provided. Send audioBase64 field.' });
      if (!process.env.OPENAI_API_KEY) return res.status(500).json({ error: 'OPENAI_API_KEY not configured' });

      // Determine file extension from mime type
      const mimeToExt = {
        'audio/webm': 'webm',
        'audio/webm;codecs=opus': 'webm',
        'audio/mp4': 'mp4',
        'audio/mpeg': 'mp3',
        'audio/mp3': 'mp3',
        'audio/wav': 'wav',
        'audio/ogg': 'ogg',
        'audio/flac': 'flac',
        'audio/m4a': 'm4a',
      };
      const detectedMime = mimeType || 'audio/webm';
      const ext = mimeToExt[detectedMime] || mimeToExt[detectedMime.split(';')[0]] || 'webm';

      // Convert base64 to buffer - handle data URL format
      let base64Data = audioBase64;
      if (base64Data.includes(',')) {
        base64Data = base64Data.split(',')[1];
      }
      const audioBuffer = Buffer.from(base64Data, 'base64');

      // Write to temp file (Vercel allows /tmp writes)
      const fs = await import('fs');
      const path_module = await import('path');
      const tempPath = path_module.join('/tmp', `audio-${Date.now()}.${ext}`);
      await fs.promises.writeFile(tempPath, audioBuffer);

      const ai = await getOpenAI();

      // Create a readable stream from the temp file
      const fileStream = fs.createReadStream(tempPath);

      const transcription = await ai.audio.transcriptions.create({
        file: fileStream,
        model: 'whisper-1',
        language: 'en',
      });

      // Clean up temp file
      try {
        await fs.promises.unlink(tempPath);
      } catch (e) {
        // Ignore cleanup errors
      }

      return res.json({ success: true, text: transcription.text });
    }

    // Generate email
    if (path === '/api/representatives/generate-email' && req.method === 'POST') {
      const { firstName, lastName, email, company, title, website, segment, event, contextNotes, companyContext } = req.body || {};
      if (!firstName || !email) return res.status(400).json({ error: 'First name and email required' });

      const contact = { firstName, lastName: lastName || '', email, company: company || '', title: title || '', website };
      const input = { contact, segment: segment || 'other', event: event || 'the conference', contextNotes, companyResearch: companyContext };
      const generatedEmail = await generateFollowUpEmail(input);
      const validation = validateEmail(generatedEmail);

      return res.json({ success: true, email: generatedEmail, validation });
    }

    // Send email
    if (path === '/api/representatives/send-email' && req.method === 'POST') {
      const { contactId, to, subject, body, from } = req.body || {};
      if (!to || !subject || !body) return res.status(400).json({ error: 'To, subject, and body required' });

      const emailClient = await getResend();
      const { data: emailData, error: emailError } = await emailClient.emails.send({
        from: from || 'Rodo Alvarez <ralvarez@soilseedandwater.com>',
        to: [to],
        subject,
        text: body,
      });

      if (emailError) throw new Error(emailError.message);

      if (contactId) {
        await db.from('representative_contacts').update({
          first_email_sent_at: new Date().toISOString(),
          first_email_subject: subject,
          first_email_body: body,
          status: 'contacted',
          pipeline_stage: 'awareness',
        }).eq('id', contactId);
      }

      return res.json({ success: true, messageId: emailData?.id, sentAt: new Date().toISOString() });
    }

    // Submit business card enhanced
    const submitMatch = path.match(/^\/api\/representatives\/([^\/]+)\/submit-business-card-enhanced$/);
    if (submitMatch && req.method === 'POST') {
      const slug = submitMatch[1];
      const {
        firstName, lastName, email, phone, companyName, title, address, website,
        segment, leadSource, partnerOwner, contextNotes, companyContext,
        generateEmail: genEmail, sendEmail: sendIt, event
      } = req.body || {};

      if (!firstName || !lastName) return res.status(400).json({ error: 'First name and last name required' });

      // Find representative or admin
      let adminId = null, representativeId = null;
      const { data: representative } = await db.from('representatives').select('id, admin_id').eq('slug', slug).eq('is_active', true).single();

      if (representative) {
        representativeId = representative.id;
        adminId = representative.admin_id;
      } else {
        const { data: admin } = await db.from('admin_users').select('id').eq('slug', slug).eq('has_landing_page', true).eq('is_active', true).single();
        if (admin) {
          adminId = admin.id;
          representativeId = await ensureRepresentativeForAdmin(db, admin.id);
          if (!representativeId) return res.status(500).json({ error: 'Failed to process contact' });
        } else {
          return res.status(404).json({ error: 'Contact card not found' });
        }
      }

      const finalSegment = segment || classifySegment(title || '', companyName || '');

      const contactData = {
        representative_id: representativeId,
        admin_id: adminId,
        first_name: firstName,
        last_name: lastName,
        email: email || null,
        phone: phone || null,
        company_name: companyName || null,
        title: title || null,
        website: website || null,
        message: contextNotes || null,
        source: 'business_card_scan',
        status: 'new',
        segment: finalSegment,
        lead_source: leadSource || 'other',
        partner_owner: partnerOwner || 'ssw',
        context_notes: contextNotes || null,
        company_context: companyContext || null,
        pipeline_stage: 'awareness',
        metadata: { address: address || null, scanned_at: new Date().toISOString(), event: event || null },
      };

      const { data: contact, error: insertError } = await db.from('representative_contacts').insert(contactData).select().single();
      if (insertError) throw insertError;

      // Generate and send email if requested
      let emailResult = null;
      if (genEmail === 'true' || genEmail === true) {
        const contactInfo = { firstName, lastName: lastName || '', email: email || '', company: companyName || '', title: title || '', website };
        const emailInput = { contact: contactInfo, segment: finalSegment, event: event || 'the conference', contextNotes, companyResearch: companyContext };
        const generatedEmail = await generateFollowUpEmail(emailInput);
        const validation = validateEmail(generatedEmail);
        emailResult = { generated: true, email: generatedEmail, validation, sent: false };

        if ((sendIt === 'true' || sendIt === true) && email && validation.valid) {
          try {
            const emailClient = await getResend();
            const { data: sendData, error: sendError } = await emailClient.emails.send({
              from: 'Rodo Alvarez <ralvarez@soilseedandwater.com>',
              to: [email],
              subject: generatedEmail.subject,
              text: generatedEmail.body,
            });
            if (!sendError) {
              emailResult.sent = true;
              emailResult.messageId = sendData?.id;
              await db.from('representative_contacts').update({
                first_email_sent_at: new Date().toISOString(),
                first_email_subject: generatedEmail.subject,
                first_email_body: generatedEmail.body,
                status: 'contacted',
              }).eq('id', contact.id);
            }
          } catch (e) {
            emailResult.sendError = e.message;
          }
        }
      }

      return res.status(201).json({ success: true, contact, segment: finalSegment, email: emailResult });
    }

    // ============ PAY & PICKUP ENDPOINTS ============

    // Get pay & pickup products with inventory
    const inventoryProductsMatch = path.match(/^\/api\/inventory\/products\/(\d+)$/);
    if (inventoryProductsMatch && req.method === 'GET') {
      const locationId = parseInt(inventoryProductsMatch[1]);
      const payAndPickup = url.searchParams.get('payAndPickup') === 'true';
      const includeOutOfStock = url.searchParams.get('includeOutOfStock') === 'true';

      // Query inventory joined with products (exclude size_price_options to use inventory pricing)
      let query = db.from('inventory').select(`
        *,
        products!inner (
          id, name, description, category, image_url, texture_photo_url,
          display_title, marketing_title, ingredients, recommended_uses,
          target_audience, story, usage, certifications, features,
          additional_images, available_size_options, pay_and_pickup_badge,
          pay_and_pickup_description, pay_and_pickup_hero_image,
          pay_and_pickup_display_order, is_pay_and_pickup_enabled,
          product_video_url, product_video_title
        )
      `).eq('location_id', locationId);

      if (!includeOutOfStock && !payAndPickup) {
        query = query.gt('quantity_available', 0);
      }

      if (payAndPickup) {
        query = query.eq('products.is_pay_and_pickup_enabled', true);
      }

      const { data, error } = await query;
      if (error) throw error;

      // Retail bag sizes for pay & pickup (filter out wholesale pallet/truckload sizes)
      const retailSizes = new Set(['9lb bag', '25lb bag', '1 cf bag', '1.5 cf bag', '2 cf bag']);
      const sizeOrder = { '9lb bag': 1, '25lb bag': 2, '1 cf bag': 3, '1.5 cf bag': 4, '2 cf bag': 5, 'bulk (50lb)': 6, 'bulk pickup': 7, 'pallet of 9 lb bags': 8, 'pallet of 1cf bags': 9, '2.2 cubic yard tote': 10, '2.2 cy tote': 10, 'truckload': 11, 'bulk delivery': 12 };

      // Group by product, filtering to retail sizes for P&P
      const productMap = new Map();
      for (const item of (data || [])) {
        if (payAndPickup && !item.products?.is_pay_and_pickup_enabled) continue;

        // For pay & pickup, only include retail bag sizes (skip pallets, truckloads, etc.)
        const sizeNorm = item.size_option.toLowerCase();
        if (payAndPickup && !retailSizes.has(sizeNorm)) continue;

        // Skip $0 or missing prices
        if (!item.price || item.price <= 0) continue;

        const pid = item.product_id;
        const record = productMap.get(pid) || { ...item.products, inventory: [], sizePriceOptions: [] };

        record.inventory.push({
          size_option: item.size_option,
          quantity_available: item.quantity_available,
          quantity_reserved: item.quantity_reserved || 0,
          price: item.price,
          pricing: { base_price: item.price, final_price: item.price, discount_amount: 0, tier_applied: 'regular', savings: 0 }
        });

        const sizeKey = sizeNorm.replace(/\s+/g, '-').replace(/[()]/g, '');
        const displayOrder = sizeOrder[sizeNorm] || 99;
        if (!record.sizePriceOptions.some(o => o.key === sizeKey)) {
          record.sizePriceOptions.push({ key: sizeKey, label: item.size_option, price: item.price, priceCents: Math.round(item.price * 100), isActive: true, displayOrder });
        }

        productMap.set(pid, record);
      }

      // Sort size options and products
      for (const product of productMap.values()) {
        product.sizePriceOptions.sort((a, b) => a.displayOrder - b.displayOrder);
        // Override size_price_options with inventory-based pricing (prevents frontend from using wholesale DB prices)
        product.size_price_options = product.sizePriceOptions;
      }
      const products = Array.from(productMap.values()).sort((a, b) => (a.pay_and_pickup_display_order || 0) - (b.pay_and_pickup_display_order || 0));

      return res.json({ success: true, location_id: locationId, products });
    }

    // Create pay & pickup order
    if (path === '/api/pay-and-pickup/create-order' && req.method === 'POST') {
      const { customerInfo, items, pickupType, locationId = 1 } = req.body || {};
      if (!customerInfo || !items || !items.length) return res.status(400).json({ error: 'Customer info and items required' });

      // Calculate totals
      let subtotal = 0;
      const orderItems = items.map(item => {
        const itemTotal = item.price * item.quantity;
        subtotal += itemTotal;
        return { product_id: item.productId, product_name: item.productName, size_option: item.size, quantity: item.quantity, unit_price: item.price, total_price: itemTotal };
      });

      const taxRate = 0.086;
      const tax = Math.round(subtotal * taxRate * 100) / 100;
      const total = Math.round((subtotal + tax) * 100) / 100;

      // Create order
      const orderNumber = 'PP-' + Date.now().toString(36).toUpperCase();
      const { data: order, error: orderError } = await db.from('orders').insert({
        order_number: orderNumber,
        customer_name: customerInfo.name,
        customer_phone: customerInfo.phone,
        customer_email: customerInfo.email || null,
        business_name: customerInfo.company || customerInfo.name || 'Pay & Pickup Customer',
        phone: customerInfo.phone,
        email: customerInfo.email || null,
        delivery_type: pickupType || 'pickup',
        order_items: orderItems,
        pickup_type: pickupType || 'pickup',
        location_id: locationId,
        subtotal, tax, total,
        status: 'pending',
        items: orderItems,
        created_at: new Date().toISOString()
      }).select().single();

      if (orderError) throw orderError;

      return res.json({
        success: true,
        orderId: order.id,
        orderNumber,
        subtotal, tax, total,
        estimatedReadyTime: '10-15 minutes'
      });
    }

    // POST /api/pay-and-pickup/notify-arrival — customer tapped "Notify a representative"
    if (path === '/api/pay-and-pickup/notify-arrival' && req.method === 'POST') {
      const { customerInfo, vehicleInfo } = req.body || {};
      if (!customerInfo?.name || !customerInfo?.phone) {
        return res.status(400).json({ error: 'Customer name and phone are required' });
      }

      const { data, error } = await db.from('arrival_notifications').insert({
        customer_name: customerInfo.name,
        customer_phone: customerInfo.phone,
        vehicle_info: vehicleInfo || 'Walk-in / yard QR check-in',
        arrival_time: new Date().toISOString(),
        status: 'waiting',
      }).select().single();

      if (error) {
        console.error('[notify-arrival] insert error:', error);
        return res.status(500).json({ error: 'Failed to notify arrival' });
      }

      const arrivalDetails = {
        customerName: customerInfo.name,
        customerPhone: customerInfo.phone,
        vehicleInfo: vehicleInfo || 'Walk-in / yard QR check-in',
        arrivalTime: data.arrival_time,
        notificationId: data.id,
      };

      // SMS → yard admins (Rodo only when OSW_DEVELOPER_MODE is on)
      const dev = await getDeveloperMode();
      const yardPhones = dev.getYardAdminPhones();
      const smsBody = dev.devModeSmsBody([
        'CUSTOMER AT YARD — needs rep',
        arrivalDetails.customerName,
        arrivalDetails.customerPhone,
        arrivalDetails.vehicleInfo,
        '',
        '1634 N 19th Ave · go meet them at the gate',
      ].join('\n'));

      if (yardPhones.length && process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_PHONE_NUMBER) {
        // Direct REST call — the twilio npm package is not a dependency of this project.
        const twilioAuth = Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64');
        const smsResults = await Promise.allSettled(yardPhones.map(async (to) => {
          const resp = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Messages.json`, {
            method: 'POST',
            headers: {
              Authorization: `Basic ${twilioAuth}`,
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({ To: to, From: process.env.TWILIO_PHONE_NUMBER, Body: smsBody }).toString(),
          });
          if (!resp.ok) {
            const errText = await resp.text().catch(() => '');
            throw new Error(`twilio ${resp.status}: ${errText.slice(0, 200)}`);
          }
          return to;
        }));
        const smsSent = smsResults.filter((r) => r.status === 'fulfilled').length;
        smsResults.forEach((r) => { if (r.status === 'rejected') console.error('[notify-arrival] SMS failed:', r.reason?.message || r.reason); });
        console.log(`[notify-arrival] SMS sent to ${smsSent}/${yardPhones.length} yard admin(s)`);
      } else {
        console.warn('[notify-arrival] Twilio or YARD_ADMIN_PHONES not configured — skipping SMS');
      }

      // Expo push via MOS (myorganicsoil.com iOS app). Fire-and-AWAIT —
      // Vercel kills fire-and-forget fetches when the response is sent.
      const mosSecret = process.env.MOS_LEAD_INGEST_SECRET;
      if (mosSecret) {
        try {
          const phoneDigits = String(customerInfo.phone).replace(/\D/g, '').slice(-10);
          const mosResp = await fetch(process.env.MOS_LEAD_INTAKE_URL || 'https://myorganicsoil.com/api/leads', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Lead-Source-Key': mosSecret },
            body: JSON.stringify({
              full_name: customerInfo.name,
              email: `yard+${phoneDigits || 'walkin'}@organicsoilwholesale.com`,
              phone: customerInfo.phone,
              company: 'Yard walk-in',
              message: `Customer at the OSW yard gate — needs a representative. ${arrivalDetails.vehicleInfo}`,
              source: 'osw_yard_walkin',
              source_url: 'https://organicsoilwholesale.com/qr',
              source_data: { notification_id: data.id, vehicle_info: arrivalDetails.vehicleInfo },
            }),
          });
          if (!mosResp.ok) {
            const t = await mosResp.text().catch(() => '');
            console.error(`[notify-arrival] MOS push fan-out → ${mosResp.status}: ${t.slice(0, 200)}`);
          } else {
            console.log('[notify-arrival] MOS push fan-out → OK');
          }
        } catch (mosErr) {
          console.error('[notify-arrival] MOS push fan-out error:', mosErr?.message || mosErr);
        }
      }

      // Admin email
      try {
        const { data: admins } = await db.from('admin_notifications')
          .select('email').eq('active', true).eq('notify_arrivals', true);
        const adminEmails = admins?.length
          ? admins.map((a) => a.email)
          : ['ralvarez@soilseedandwater.com'];
        const r = await getResend();
        const vehicleLabel = arrivalDetails.vehicleInfo || 'Vehicle Info Not Provided';
        await Promise.allSettled(adminEmails.map((to) =>
          r.emails.send({
            from: 'Organic Soil Wholesale <info@soilseedandwater.com>',
            replyTo: 'ralvarez@soilseedandwater.com',
            to,
            subject: `[URGENT] Customer Arrival: ${arrivalDetails.customerName} - ${vehicleLabel}`,
            html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
              <div style="background:#dc2626;color:#fff;padding:24px;text-align:center">
                <h1 style="margin:0">Customer Has Arrived!</h1>
                <p style="margin:8px 0 0">Immediate action required</p>
              </div>
              <div style="padding:24px">
                <p><strong>Customer:</strong> ${arrivalDetails.customerName}</p>
                <p><strong>Phone:</strong> <a href="tel:${arrivalDetails.customerPhone}">${arrivalDetails.customerPhone}</a></p>
                <p><strong>Vehicle:</strong> ${vehicleLabel}</p>
                <p><strong>Arrival:</strong> ${new Date(arrivalDetails.arrivalTime).toLocaleString()}</p>
                <p><strong>Notification #:</strong> ${arrivalDetails.notificationId}</p>
              </div>
            </div>`,
          })
        ));
        console.log('[notify-arrival] admin email sent');
      } catch (emailErr) {
        console.error('[notify-arrival] email error:', emailErr);
      }

      return res.json({
        success: true,
        message: 'Staff has been notified of your arrival',
        notificationId: data.id,
      });
    }

    // Pay & pickup test endpoint
    if (path === '/api/pay-and-pickup/test' && req.method === 'GET') {
      const { data, error } = await db.from('products').select('id, name, is_pay_and_pickup_enabled').eq('is_pay_and_pickup_enabled', true);
      return res.json({ success: true, products: data || [], error: error?.message });
    }

    // ============ EXISTING ENDPOINTS ============

    // Normalize a single size_price_options entry. The DB rows store
    // {size, price, unit, msrp} but the client (PayPickupCard) expects
    // {key, label, price, priceCents, isActive, msrp, unit}. Without this,
    // size.key is undefined and PayPickupCard's .startsWith() throws.
    const normalizeSizeOption = (s) => {
      if (!s || typeof s !== 'object') return null;
      const rawKey =
        (typeof s.key === 'string' && s.key.trim()) ||
        (typeof s.size_key === 'string' && s.size_key.trim()) ||
        (typeof s.size === 'string' && s.size.trim()) ||
        (typeof s.label === 'string' && s.label.trim()) ||
        '';
      const rawLabel =
        (typeof s.label === 'string' && s.label.trim()) ||
        (typeof s.name === 'string' && s.name.trim()) ||
        (typeof s.size === 'string' && s.size.trim()) ||
        rawKey;
      if (!rawKey && !rawLabel) return null;
      const priceNum = typeof s.price === 'number'
        ? s.price
        : typeof s.priceCents === 'number'
          ? s.priceCents / 100
          : typeof s.price_cents === 'number'
            ? s.price_cents / 100
            : Number(String(s.price ?? '').replace(/[^0-9.]/g, '')) || 0;
      let isActive = true;
      if (typeof s.is_active === 'boolean') isActive = s.is_active;
      else if (typeof s.isActive === 'boolean') isActive = s.isActive;
      else if (typeof s.active === 'boolean') isActive = s.active;
      return {
        key: rawKey || rawLabel,
        label: rawLabel || rawKey,
        price: priceNum,
        priceCents: Math.round(priceNum * 100),
        unit: typeof s.unit === 'string' ? s.unit : undefined,
        msrp: typeof s.msrp === 'string' ? s.msrp : undefined,
        isActive,
      };
    };

    const blockedProductImages = {
      3000: new Set(['/uploads/products/3000/gallery-1/1764113182186-ohei8u.webp']),
    };

    const normalizeProductImagePath = (url) => {
      if (typeof url !== 'string') return '';
      const clean = url.trim().toLowerCase().replace(/\?.*$/, '').replace(/#.*$/, '');
      if (!clean) return '';
      try {
        return new URL(clean, 'https://organicsoilwholesale.com').pathname.toLowerCase();
      } catch {
        return clean.startsWith('/') ? clean : `/${clean}`;
      }
    };

    const filterBlockedProductImages = (productId, images) => {
      if (!Array.isArray(images)) return images;
      const blocked = blockedProductImages[Number(productId)];
      if (!blocked) return images;
      return images.filter((url) => !blocked.has(normalizeProductImagePath(url)));
    };

    const normalizeProductRow = (p) => {
      if (!p) return p;
      const rawSizes = Array.isArray(p.size_price_options) ? p.size_price_options : [];
      const normalizedSizes = rawSizes.map(normalizeSizeOption).filter(Boolean);
      const additionalImages = filterBlockedProductImages(p.id, p.additional_images ?? p.additionalImages);
      return normalizeV5ProductRecord({
        ...p,
        // Provide both camelCase and snake_case so existing clients keep working
        size_price_options: normalizedSizes,
        sizePriceOptions: normalizedSizes,
        imageUrl: p.image_url ?? p.imageUrl ?? null,
        texturePhotoUrl: p.texture_photo_url ?? p.texturePhotoUrl ?? null,
        additional_images: additionalImages,
        additionalImages,
        productType: p.product_type ?? p.productType ?? p.name,
        displayTitle: p.display_title ?? p.displayTitle ?? p.name,
      });
    };

    // Products list — heavy free-text fields stripped (only the grid needs
    // {id, name, sizes, images}; the detail page hits the single-product
    // endpoint for the full record). Cached at the edge for 5 minutes with
    // stale-while-revalidate to keep TTFB <50ms after the first hit.
    if (path === '/api/public/products' && req.method === 'GET') {
      const slimColumns = [
        'id', 'name', 'slug', 'description', 'category', 'price',
        'image_url', 'texture_photo_url', 'product_type', 'display_title',
        'marketing_title', 'size_price_options', 'is_catalog_enabled',
        'catalog_display_order', 'is_pay_and_pickup_enabled',
        'pay_and_pickup_display_order', 'pay_and_pickup_hero_image',
        'product_status', 'npk', 'certifications',
      ].join(', ');
      const idsParam = String(req.query?.ids || '').trim();
      const requestedIds = idsParam
        ? idsParam.split(',')
            .map((id) => Number(id.trim()))
            .filter((id) => Number.isInteger(id) && id > 0)
        : [];
      const payAndPickupOnly = String(req.query?.payAndPickup || '').toLowerCase() === 'true';

      let query = db
        .from('products')
        .select(slimColumns)
        .eq('is_catalog_enabled', true)
        .eq('product_status', 'active');

      if (requestedIds.length) {
        query = query.in('id', requestedIds);
      }
      if (payAndPickupOnly) {
        query = query.eq('is_pay_and_pickup_enabled', true);
      }

      const { data, error } = await query
        .order('catalog_display_order', { ascending: true, nullsFirst: false })
        .order('name', { ascending: true });
      if (error) throw error;
      const products = (data || []).map(normalizeProductRow).map((p) => {
        // Drop snake_case duplicate of sizePriceOptions to halve payload
        // (client reads sizePriceOptions ?? size_price_options, so removing
        // the snake form is safe).
        const { size_price_options, ...rest } = p;
        return rest;
      });
      res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=3600');
      return res.json({ products });
    }

    // Single product
    const productMatch = path.match(/^\/api\/public\/products\/(.+)$/);
    if (productMatch && req.method === 'GET') {
      const idOrSlug = productMatch[1];
      const numericId = Number(idOrSlug);
      let data = null, error = null;

      if (!Number.isNaN(numericId)) {
        const result = await db.from('products').select('*').eq('id', numericId).single();
        data = result.data;
        error = result.error;
      }
      if (!data || error?.code === 'PGRST116') {
        const result = await db.from('products').select('*').eq('slug', idOrSlug).single();
        data = result.data;
        error = result.error;
      }
      if (error) {
        if (error.code === 'PGRST116') return res.status(404).json({ error: 'Product not found' });
        throw error;
      }
      if (!data?.is_catalog_enabled || data?.product_status !== 'active') {
        return res.status(404).json({ error: 'Product not found' });
      }
      res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=3600');
      return res.json(normalizeProductRow(data));
    }

    // Representative by slug
    const repMatch = path.match(/^\/api\/representatives\/([^\/]+)$/);
    if (repMatch && req.method === 'GET') {
      const slug = repMatch[1];
      let { data, error } = await db.from('representatives').select('*').eq('slug', slug).eq('is_active', true).single();

      if (error && error.code === 'PGRST116') {
        const { data: adminData, error: adminError } = await db.from('admin_users').select('*').eq('slug', slug).eq('has_landing_page', true).eq('is_active', true).single();
        if (adminError) {
          if (adminError.code === 'PGRST116') return res.status(404).json({ error: 'Landing page not found' });
          throw adminError;
        }
        data = {
          id: adminData.id, slug: adminData.slug, name: adminData.full_name || adminData.email,
          email: adminData.email, phone: adminData.phone, website: adminData.website, bio: adminData.bio,
          photo_url: adminData.photo_url, banner_image_url: adminData.banner_image_url,
          gallery_images: adminData.gallery_images || [], video_urls: adminData.video_urls || [],
          company_name: adminData.company_name, title: adminData.title, address: adminData.address,
          city: adminData.city, state: adminData.state, zip_code: adminData.zip_code,
          social_links: adminData.social_links || {},
          contact_button_text: adminData.contact_button_text || 'Enter Your Contact Details',
          contact_card_button_text: adminData.contact_card_button_text || 'Download Contact Card',
          contact_form_title: adminData.contact_form_title || 'Get In Touch',
          contact_form_description: adminData.contact_form_description,
          is_active: adminData.is_active, source: 'admin',
        };
      } else if (error) {
        throw error;
      }
      return res.json(data);
    }

    // Contact submission
    const contactMatch = path.match(/^\/api\/representatives\/([^\/]+)\/contact$/);
    if (contactMatch && req.method === 'POST') {
      const slug = contactMatch[1];
      const { firstName, lastName, email, phone, companyName, message } = req.body || {};
      if (!firstName || !lastName || !email) return res.status(400).json({ error: 'First name, last name, and email required' });

      const { data: representative } = await db.from('representatives').select('id, admin_id').eq('slug', slug).eq('is_active', true).single();
      let contactData = { first_name: firstName, last_name: lastName, email, phone: phone || null, company_name: companyName || null, message: message || null, source: 'landing_page', status: 'new' };

      if (representative) {
        contactData.representative_id = representative.id;
        contactData.admin_id = representative.admin_id || null;
      } else {
        const { data: admin } = await db.from('admin_users').select('id').eq('slug', slug).eq('has_landing_page', true).eq('is_active', true).single();
        if (!admin) return res.status(404).json({ error: 'Landing page not found' });
        contactData.admin_id = admin.id;
        contactData.representative_id = null;
      }

      const { data, error } = await db.from('representative_contacts').insert(contactData).select().single();
      if (error) throw error;
      return res.status(201).json({ success: true, data });
    }

    // ============ ADMIN CRM ENDPOINTS ============

    // Admin auth helper
    const verifyAdminTokenValue = async (token) => {
      try {
        const jwt = (await import('jsonwebtoken')).default;
        const decoded = jwt.verify(token, requireJwtSecret());
        if (!decoded || typeof decoded !== 'object' || !decoded.id) return null;

        const { data: admin, error } = await db
          .from('admin_users')
          .select('id, email, role, permissions, is_active')
          .eq('id', decoded.id)
          .single();

        if (error || !admin || admin.is_active === false) return null;
        return admin;
      } catch (e) {
        return null;
      }
    };

    const verifyAdminToken = async (req) => {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
      return verifyAdminTokenValue(authHeader.substring(7));
    };

    // GET /api/admin/representative-contacts
    if (path === '/api/admin/representative-contacts' && req.method === 'GET') {
      const admin = await verifyAdminToken(req);
      if (!admin) return res.status(401).json({ error: 'Unauthorized' });

      const { status, search, representativeId, segment, partner_owner, lead_source } = url.searchParams ?
        Object.fromEntries(url.searchParams) : {};

      let query = db.from('representative_contacts').select('*').order('created_at', { ascending: false });

      // Role-based filtering
      if (admin.role !== 'super_admin') {
        const { data: linkedReps } = await db.from('representatives').select('id').eq('admin_id', admin.id);
        const repIds = (linkedReps || []).map(r => r.id);
        if (repIds.length > 0) {
          const repIdFilter = repIds.map(id => `representative_id.eq.${id}`).join(',');
          query = query.or(`${repIdFilter},admin_id.eq.${admin.id}`);
        } else {
          query = query.eq('admin_id', admin.id);
        }
      }

      if (status) query = query.eq('status', status);
      if (segment) query = query.eq('segment', segment);
      if (partner_owner) query = query.eq('partner_owner', partner_owner);
      if (lead_source) query = query.eq('lead_source', lead_source);
      if (representativeId) query = query.eq('representative_id', representativeId);
      if (search) {
        const term = `%${search}%`;
        query = query.or(`first_name.ilike.${term},last_name.ilike.${term},email.ilike.${term},phone.ilike.${term}`);
      }

      const { data: contacts, error } = await query;
      if (error) throw error;

      // Enrich with representative info
      const repIds = [...new Set((contacts || []).map(c => c.representative_id).filter(Boolean))];
      let repsMap = {};
      if (repIds.length > 0) {
        const { data: reps } = await db.from('representatives').select('id, name, slug, email, phone, photo_url').in('id', repIds);
        repsMap = (reps || []).reduce((acc, r) => { acc[r.id] = r; return acc; }, {});
      }

      const enriched = (contacts || []).map(c => ({
        ...c,
        representative: c.representative_id ? repsMap[c.representative_id] || null : null,
      }));

      return res.json(enriched);
    }

    // PATCH /api/admin/representative-contacts/:id
    const patchContactMatch = path.match(/^\/api\/admin\/representative-contacts\/(\d+)$/);
    if (patchContactMatch && req.method === 'PATCH') {
      const admin = await verifyAdminToken(req);
      if (!admin) return res.status(401).json({ error: 'Unauthorized' });

      const contactId = patchContactMatch[1];
      const { status, notes } = req.body || {};

      const updateData = {};
      if (status !== undefined) updateData.status = status;
      if (notes !== undefined) updateData.notes = notes;

      const { data, error } = await db.from('representative_contacts').update(updateData).eq('id', contactId).select().single();
      if (error) throw error;

      return res.json(data);
    }

    // POST /api/admin/representative-contacts/bulk-delete
    if (path === '/api/admin/representative-contacts/bulk-delete' && req.method === 'POST') {
      const admin = await verifyAdminToken(req);
      if (!admin) return res.status(401).json({ error: 'Unauthorized' });
      if (!admin.role || !['super_admin', 'admin'].includes(admin.role)) {
        return res.status(403).json({ error: 'Admin access required to bulk delete' });
      }

      const { ids } = req.body || {};
      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ error: 'No contact IDs provided' });
      }

      const { error } = await db.from('representative_contacts').delete().in('id', ids);
      if (error) throw error;

      return res.json({ success: true, deletedCount: ids.length });
    }

    // ============ ADMIN ANALYTICS ENDPOINTS ============

    // Helper functions for analytics
    const countBy = (items, field) => {
      if (!items) return {};
      return items.reduce((acc, item) => {
        const key = item[field] || 'unknown';
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, {});
    };

    const calculateEmailMetrics = (contacts) => {
      if (!contacts) return { sent: 0, delivered: 0, opened: 0, clicked: 0, bounced: 0, replied: 0 };
      const emailsSent = contacts.filter(c => c.first_email_sent_at);
      const metrics = {
        sent: emailsSent.length,
        delivered: 0,
        opened: 0,
        clicked: 0,
        bounced: 0,
        replied: 0,
        openRate: '0.0',
        clickRate: '0.0',
        replyRate: '0.0',
      };
      emailsSent.forEach(contact => {
        switch (contact.email_status) {
          case 'delivered': metrics.delivered++; break;
          case 'opened': metrics.opened++; metrics.delivered++; break;
          case 'clicked': metrics.clicked++; metrics.opened++; metrics.delivered++; break;
          case 'replied': metrics.replied++; metrics.opened++; metrics.delivered++; break;
          case 'bounced': metrics.bounced++; break;
        }
      });
      if (metrics.delivered > 0) {
        metrics.openRate = ((metrics.opened / metrics.delivered) * 100).toFixed(1);
        metrics.replyRate = ((metrics.replied / metrics.delivered) * 100).toFixed(1);
      }
      if (metrics.opened > 0) {
        metrics.clickRate = ((metrics.clicked / metrics.opened) * 100).toFixed(1);
      }
      return metrics;
    };

    const calculateCampaignPerformance = (contacts) => {
      if (!contacts) return [];
      const campaigns = {};
      contacts.forEach(contact => {
        const source = contact.lead_source || 'other';
        if (!campaigns[source]) {
          campaigns[source] = { name: source, total: 0, emailsSent: 0, opened: 0, replied: 0, converted: 0 };
        }
        campaigns[source].total++;
        if (contact.first_email_sent_at) campaigns[source].emailsSent++;
        if (['opened', 'clicked', 'replied'].includes(contact.email_status)) campaigns[source].opened++;
        if (contact.email_status === 'replied' || contact.status === 'replied') campaigns[source].replied++;
        if (contact.status === 'converted' || contact.pipeline_stage === 'conversion') campaigns[source].converted++;
      });
      return Object.values(campaigns)
        .map(campaign => ({
          ...campaign,
          openRate: campaign.emailsSent > 0 ? ((campaign.opened / campaign.emailsSent) * 100).toFixed(1) : '0.0',
          conversionRate: campaign.total > 0 ? ((campaign.converted / campaign.total) * 100).toFixed(1) : '0.0',
        }))
        .sort((a, b) => b.total - a.total);
    };

    const calculateDailyTrend = (contacts, startDate) => {
      if (!contacts) return [];
      const dailyCounts = {};
      const current = new Date(startDate);
      const end = new Date();
      while (current <= end) {
        const dateStr = current.toISOString().split('T')[0];
        dailyCounts[dateStr] = { date: dateStr, contacts: 0, emails: 0 };
        current.setDate(current.getDate() + 1);
      }
      contacts.forEach(contact => {
        const dateStr = new Date(contact.created_at).toISOString().split('T')[0];
        if (dailyCounts[dateStr]) {
          dailyCounts[dateStr].contacts++;
          if (contact.first_email_sent_at) dailyCounts[dateStr].emails++;
        }
      });
      return Object.values(dailyCounts).sort((a, b) => a.date.localeCompare(b.date));
    };

    const calculateConversionFunnel = (contacts) => {
      if (!contacts) return { awareness: 0, interest: 0, consideration: 0, conversion: 0 };
      const funnel = { awareness: 0, interest: 0, consideration: 0, conversion: 0 };
      contacts.forEach(contact => {
        const stage = contact.pipeline_stage || 'awareness';
        if (funnel[stage] !== undefined) funnel[stage]++;
      });
      return funnel;
    };

    const getTopItems = (counts, limit) => {
      return Object.entries(counts)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, limit);
    };

    // GET /api/admin/analytics - Comprehensive CRM analytics
    if (path === '/api/admin/analytics' && req.method === 'GET') {
      const admin = await verifyAdminToken(req);
      if (!admin) return res.status(401).json({ error: 'Unauthorized' });

      const range = url.searchParams.get('range') || '30d';
      const now = new Date();
      let startDate = new Date();
      switch (range) {
        case '7d': startDate.setDate(now.getDate() - 7); break;
        case '30d': startDate.setDate(now.getDate() - 30); break;
        case '90d': startDate.setDate(now.getDate() - 90); break;
        case '1y': startDate.setFullYear(now.getFullYear() - 1); break;
        default: startDate.setDate(now.getDate() - 30);
      }

      const { data: contacts, error: contactsError } = await db
        .from('representative_contacts')
        .select('*')
        .gte('created_at', startDate.toISOString())
        .order('created_at', { ascending: false });

      if (contactsError) throw contactsError;

      const { data: allContacts, error: allError } = await db
        .from('representative_contacts')
        .select('*');

      if (allError) throw allError;

      const analytics = {
        totalContacts: contacts?.length || 0,
        totalAllTime: allContacts?.length || 0,
        byStatus: countBy(contacts, 'status'),
        bySegment: countBy(contacts, 'segment'),
        byLeadSource: countBy(contacts, 'lead_source'),
        byPartnerOwner: countBy(contacts, 'partner_owner'),
        byPipelineStage: countBy(contacts, 'pipeline_stage'),
        emailMetrics: calculateEmailMetrics(contacts),
        campaignPerformance: calculateCampaignPerformance(contacts),
        dailyTrend: calculateDailyTrend(contacts, startDate),
        conversionFunnel: calculateConversionFunnel(contacts),
        topSegments: getTopItems(countBy(contacts, 'segment'), 5),
        topSources: getTopItems(countBy(contacts, 'lead_source'), 5),
      };

      return res.json(analytics);
    }

    // GET /api/admin/analytics/email-campaigns - Detailed email campaign analytics
    if (path === '/api/admin/analytics/email-campaigns' && req.method === 'GET') {
      const admin = await verifyAdminToken(req);
      if (!admin) return res.status(401).json({ error: 'Unauthorized' });

      const { data: contacts, error } = await db
        .from('representative_contacts')
        .select('*')
        .not('first_email_sent_at', 'is', null);

      if (error) throw error;

      const campaigns = {};
      (contacts || []).forEach(contact => {
        const campaign = contact.lead_source || 'other';
        if (!campaigns[campaign]) {
          campaigns[campaign] = {
            name: campaign,
            sent: 0,
            delivered: 0,
            opened: 0,
            clicked: 0,
            bounced: 0,
            replied: 0,
            contacts: [],
          };
        }
        campaigns[campaign].sent++;
        campaigns[campaign].contacts.push({
          id: contact.id,
          name: `${contact.first_name} ${contact.last_name}`,
          email: contact.email,
          company: contact.company_name,
          status: contact.email_status,
          sentAt: contact.first_email_sent_at,
        });

        switch (contact.email_status) {
          case 'delivered': campaigns[campaign].delivered++; break;
          case 'opened': campaigns[campaign].opened++; campaigns[campaign].delivered++; break;
          case 'clicked': campaigns[campaign].clicked++; campaigns[campaign].opened++; campaigns[campaign].delivered++; break;
          case 'replied': campaigns[campaign].replied++; campaigns[campaign].opened++; campaigns[campaign].delivered++; break;
          case 'bounced': campaigns[campaign].bounced++; break;
        }
      });

      const campaignList = Object.values(campaigns).map(campaign => ({
        ...campaign,
        deliveryRate: campaign.sent > 0 ? ((campaign.delivered / campaign.sent) * 100).toFixed(1) : '0.0',
        openRate: campaign.delivered > 0 ? ((campaign.opened / campaign.delivered) * 100).toFixed(1) : '0.0',
        clickRate: campaign.opened > 0 ? ((campaign.clicked / campaign.opened) * 100).toFixed(1) : '0.0',
        replyRate: campaign.delivered > 0 ? ((campaign.replied / campaign.delivered) * 100).toFixed(1) : '0.0',
        bounceRate: campaign.sent > 0 ? ((campaign.bounced / campaign.sent) * 100).toFixed(1) : '0.0',
      }));

      return res.json({
        campaigns: campaignList.sort((a, b) => b.sent - a.sent),
        totals: {
          totalSent: contacts?.length || 0,
          totalOpened: campaignList.reduce((sum, c) => sum + c.opened, 0),
          totalClicked: campaignList.reduce((sum, c) => sum + c.clicked, 0),
          totalReplied: campaignList.reduce((sum, c) => sum + c.replied, 0),
          totalBounced: campaignList.reduce((sum, c) => sum + c.bounced, 0),
        },
      });
    }

    // ============ ADMIN AUTH ENDPOINTS ============

    // Admin login
    if (path === '/api/admin/auth/login' && req.method === 'POST') {
      const { email, password } = req.body || {};

      if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required' });
      }


      // Authenticate only against managed admin records.
      const { data: admin, error: adminError } = await db
        .from('admin_users')
        .select('*')
        .eq('email', email)
        .single();

      if (adminError || !admin || !admin.password_hash || admin.is_active === false) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      const bcrypt = (await import('bcrypt')).default;
      const validPassword = await bcrypt.compare(password, admin.password_hash);

      if (!validPassword) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      const jwt = (await import('jsonwebtoken')).default;
      const token = jwt.sign(
        { id: admin.id, email: admin.email, role: admin.role },
        requireJwtSecret(),
        { expiresIn: '8h' }
      );

      return res.json({
        token,
        admin: { id: admin.id, email: admin.email, full_name: admin.full_name, role: admin.role }
      });
    }

    // Admin validate token
    if (path === '/api/admin/auth/validate' && req.method === 'GET') {
      const admin = await verifyAdminToken(req);
      if (!admin) return res.status(401).json({ error: 'Unauthorized' });


      // Confirm the account still exists and remains active.
      const { data: dbAdmin, error } = await db
        .from('admin_users')
        .select('id, email, full_name, role, permissions, is_active')
        .eq('id', admin.id)
        .single();

      if (error || !dbAdmin || dbAdmin.is_active === false) {
        return res.status(401).json({ error: 'Admin not found' });
      }

      return res.json({ admin: dbAdmin });
    }

    // ============ DASHBOARD STATS ENDPOINT ============

    if (path === '/api/admin/dashboard/stats' && req.method === 'GET') {
      const admin = await verifyAdminToken(req);
      if (!admin) return res.status(401).json({ error: 'Unauthorized' });

      try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        // Get today's revenue from orders (if table exists)
        let todayRevenue = 0;
        let orderStats = [];
        let recentOrders = [];
        let lowStockProducts = [];
        let popularProducts = [];

        try {
          const { data: todayOrders } = await db
            .from('orders')
            .select('total')
            .gte('created_at', today.toISOString())
            .lt('created_at', tomorrow.toISOString());
          todayRevenue = todayOrders?.reduce((sum, o) => sum + (o.total || 0), 0) || 0;
        } catch (e) { /* orders table may not exist */ }

        try {
          const { data } = await db
            .from('orders')
            .select('status')
            .order('status');
          if (data) {
            const counts = {};
            data.forEach(o => { counts[o.status] = (counts[o.status] || 0) + 1; });
            orderStats = Object.entries(counts).map(([status, count]) => ({ status, count }));
          }
        } catch (e) { /* orders table may not exist */ }

        try {
          const { data } = await db
            .from('orders')
            .select('id, created_at, total, status')
            .order('created_at', { ascending: false })
            .limit(10);
          recentOrders = data || [];
        } catch (e) { /* orders table may not exist */ }

        try {
          const { data } = await db
            .from('products')
            .select('id, name, stock_quantity, min_stock_level')
            .eq('active', true)
            .order('stock_quantity', { ascending: true })
            .limit(10);
          lowStockProducts = (data || [])
            .filter(p => p.min_stock_level && p.stock_quantity < p.min_stock_level)
            .map(p => ({ id: p.id, name: p.name, stock: p.stock_quantity, min_stock_level: p.min_stock_level }));
        } catch (e) { /* products table may not have these columns */ }

        return res.json({
          todayRevenue,
          orderStats,
          lowStockProducts,
          popularProducts,
          recentOrders,
        });
      } catch (error) {
        console.error('Dashboard stats error:', error);
        return res.status(500).json({ error: 'Failed to fetch dashboard stats' });
      }
    }

    // ============ OPERATIONS BOL ENDPOINTS ============

    // Get all BOLs
    if (path === '/api/admin/operations/bols' && req.method === 'GET') {
      const admin = await verifyAdminToken(req);
      if (!admin) return res.status(401).json({ error: 'Unauthorized' });

      let query = db.from('ops_bols').select('*');
      const clientTag = url.searchParams.get('client_tag');
      if (clientTag) query = query.eq('client_tag', clientTag);
      query = query.order('created_at', { ascending: false });

      const { data, error } = await query;
      if (error) throw error;
      return res.json(data || []);
    }

    // Get single BOL
    const bolDetailMatch = path.match(/^\/api\/admin\/operations\/bols\/(\d+)$/);
    if (bolDetailMatch && req.method === 'GET') {
      const admin = await verifyAdminToken(req);
      if (!admin) return res.status(401).json({ error: 'Unauthorized' });

      const bolId = bolDetailMatch[1];
      const { data, error } = await db
        .from('ops_bols')
        .select('*')
        .eq('id', bolId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') return res.status(404).json({ error: 'BOL not found' });
        throw error;
      }
      return res.json(data);
    }

    // PATCH BOL
    if (bolDetailMatch && req.method === 'PATCH') {
      const admin = await verifyAdminToken(req);
      if (!admin) return res.status(401).json({ error: 'Unauthorized' });

      const bolId = bolDetailMatch[1];
      const updates = req.body;
      const fieldMap = {
        date: "date", originLocation: "origin_location", originAddress: "origin_address",
        originCity: "origin_city", originState: "origin_state", originZip: "origin_zip",
        customerName: "customer_name", destinationAddress: "destination_address",
        destinationCity: "destination_city", destinationState: "destination_state",
        destinationZip: "destination_zip", onsiteContactName: "onsite_contact_name",
        onsiteContactPhone: "onsite_contact_phone", materialType: "material_type",
        materialDescription: "material_description", grossWeight: "gross_weight",
        tareWeight: "tare_weight", netWeight: "net_weight", netWeightTons: "net_weight_tons",
        carrierName: "carrier_name", driverName: "driver_name", truckNumber: "truck_number",
        licensePlate: "license_plate", trailerNumber: "trailer_number", notes: "notes",
        referenceNumber: "reference_number", timeIn: "time_in", timeOut: "time_out",
        scaleOperatorInitials: "scale_operator_initials", loadType: "load_type",
        clientTag: "client_tag", status: "status", orderId: "order_id",
        billingStatus: "billing_status", invoiceId: "invoice_id",
        invoiceNumber: "invoice_number", invoiceAmount: "invoice_amount",
        invoiceDate: "invoice_date", billingNotes: "billing_notes"
      };

      const snakeCaseUpdates = {};
      for (const [key, value] of Object.entries(updates)) {
        const snakeKey = fieldMap[key] || key;
        if (fieldMap[key] || key === 'status') {
          snakeCaseUpdates[snakeKey] = value;
        }
      }
      snakeCaseUpdates.updated_at = new Date().toISOString();

      const { data, error } = await db.from('ops_bols').update(snakeCaseUpdates).eq('id', bolId).select().single();
      if (error) throw error;
      return res.json(data);
    }

    // Get linked CODs for a BOL
    const bolCodsMatch = path.match(/^\/api\/admin\/operations\/bols\/(\d+)\/cods$/);
    if (bolCodsMatch && req.method === 'GET') {
      const admin = await verifyAdminToken(req);
      if (!admin) return res.status(401).json({ error: 'Unauthorized' });

      const bolId = bolCodsMatch[1];

      // Get CODs linked by bol_id
      const { data: directLinked } = await db.from('ops_cods')
        .select('id, cod_number, date_received, status, received_from, client_tag')
        .eq('bol_id', bolId).order('created_at', { ascending: false });

      // Get the BOL's client_tag for related CODs
      const { data: bol } = await db.from('ops_bols').select('client_tag, date').eq('id', bolId).single();

      let tagLinked = [];
      if (bol && bol.client_tag) {
        const { data } = await db.from('ops_cods')
          .select('id, cod_number, date_received, status, received_from, client_tag')
          .eq('client_tag', bol.client_tag).is('bol_id', null)
          .order('created_at', { ascending: false }).limit(10);
        tagLinked = data || [];
      }

      // Merge and deduplicate
      const allCods = [...(directLinked || []), ...tagLinked];
      const seen = new Set();
      const unique = allCods.filter(c => { if (seen.has(c.id)) return false; seen.add(c.id); return true; });

      return res.json(unique);
    }

    // Create BOL
    if (path === '/api/admin/operations/bols' && req.method === 'POST') {
      const admin = await verifyAdminToken(req);
      if (!admin) return res.status(401).json({ error: 'Unauthorized' });

      const bolData = req.body;

      // Generate BOL number
      const today = new Date();
      const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
      const { count } = await db.from('ops_bols').select('*', { count: 'exact', head: true })
        .gte('created_at', today.toISOString().slice(0, 10));
      const bolNumber = `BOL-${dateStr}-${String((count || 0) + 1).padStart(3, '0')}`;

      const insertData = {
        bol_number: bolNumber,
        date: bolData.date || today.toISOString().slice(0, 10),
        origin_location: bolData.originLocation,
        origin_address: bolData.originAddress,
        origin_city: bolData.originCity,
        origin_state: bolData.originState,
        origin_zip: bolData.originZip,
        customer_name: bolData.customerName,
        destination_address: bolData.destinationAddress,
        destination_city: bolData.destinationCity,
        destination_state: bolData.destinationState,
        destination_zip: bolData.destinationZip,
        onsite_contact_name: bolData.onsiteContactName || null,
        onsite_contact_phone: bolData.onsiteContactPhone || null,
        material_type: bolData.materialType,
        material_description: bolData.materialDescription || null,
        gross_weight: bolData.grossWeight || 0,
        tare_weight: bolData.tareWeight || 0,
        net_weight: bolData.netWeight || 0,
        net_weight_tons: bolData.netWeightTons || '0.00',
        carrier_name: bolData.carrierName,
        driver_name: bolData.driverName || null,
        truck_number: bolData.truckNumber || null,
        license_plate: bolData.licensePlate || null,
        trailer_number: bolData.trailerNumber || null,
        notes: bolData.notes || null,
        reference_number: bolData.referenceNumber || null,
        time_in: bolData.timeIn || null,
        time_out: bolData.timeOut || null,
        scale_operator_initials: bolData.scaleOperatorInitials || null,
        load_type: bolData.loadType || 'Outbound',
        client_tag: bolData.clientTag || null,
        status: 'completed',
        created_by: admin.id
      };

      const { data, error } = await db.from('ops_bols').insert(insertData).select().single();
      if (error) throw error;

      return res.status(201).json(data);
    }

    // Delete BOLs
    if (path === '/api/admin/operations/bols/delete' && req.method === 'POST') {
      const admin = await verifyAdminToken(req);
      if (!admin) return res.status(401).json({ error: 'Unauthorized' });

      const { ids } = req.body || {};
      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ message: 'No IDs provided' });
      }

      const { error } = await db.from('ops_bols').delete().in('id', ids);
      if (error) throw error;

      return res.json({ success: true, deleted: ids.length });
    }

    // Generate BOL PDF
    const bolPdfMatch = path.match(/^\/api\/admin\/operations\/bols\/(\d+)\/pdf$/);
    if (bolPdfMatch && req.method === 'GET') {
      // Check token from query param or header
      const tokenFromQuery = url.searchParams.get('token');
      const tokenFromHeader = req.headers.authorization?.replace('Bearer ', '');
      const token = tokenFromQuery || tokenFromHeader;

      if (!token) return res.status(401).json({ error: 'Unauthorized' });

      const admin = await verifyAdminTokenValue(token);
      if (!admin) {
        return res.status(401).json({ error: 'Invalid token' });
      }

      const bolId = bolPdfMatch[1];
      const { data: bol, error } = await db.from('ops_bols').select('*').eq('id', bolId).single();

      if (error || !bol) return res.status(404).json({ error: 'BOL not found' });

      const hasWeight = bol.gross_weight > 0 && bol.tare_weight > 0;

      // Check if auto-print is requested (default: true)
      const autoPrint = url.searchParams.get('print') !== 'false';
      const printScript = autoPrint ? `<script>window.onload = function() { setTimeout(function() { window.print(); }, 500); }</script>` : '';

      const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>BOL ${bol.bol_number}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:Arial,sans-serif;font-size:12px;line-height:1.4;padding:20px;max-width:800px;margin:0 auto;color:#000}
.header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #000;padding-bottom:12px;margin-bottom:12px}
.logo-section h1{font-size:20px;font-weight:bold;margin-bottom:2px}
.logo-section p{font-size:9px;color:#333}
.bol-info{text-align:right}
.bol-number{font-size:18px;font-weight:bold;font-family:monospace}
.ref-number{font-size:14px;font-weight:bold;margin-top:4px;border:2px solid #000;padding:3px 8px;display:inline-block}
.date{font-size:11px;color:#333;margin-top:3px}
.section{margin-bottom:10px;border:1px solid #999;overflow:hidden}
.section-header{padding:5px 10px;font-weight:bold;font-size:11px;text-transform:uppercase;border-bottom:1px solid #999}
.section-content{padding:8px 10px}
.two-col{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.field{margin-bottom:5px}
.field-label{font-size:9px;color:#333;text-transform:uppercase;margin-bottom:1px}
.field-value{font-size:12px;font-weight:bold}
.weight-table{width:100%;border-collapse:collapse;margin-top:8px}
.weight-table td{border:2px solid #000;padding:8px 12px;text-align:center}
.weight-table .wt-label{font-size:10px;font-weight:bold;text-transform:uppercase}
.weight-table .wt-value{font-size:22px;font-weight:bold;font-family:monospace}
.weight-table .wt-unit{font-size:11px;font-weight:bold}
.weight-table .wt-tons{font-size:16px;font-weight:bold;margin-top:2px}
.signature-section{display:grid;grid-template-columns:1fr 1fr 1fr;gap:15px;margin-top:20px;padding-top:12px;border-top:1px solid #999}
.signature-box{border-bottom:1px solid #000;padding-bottom:30px;margin-bottom:4px}
.signature-label{font-size:10px;font-weight:bold}
.footer{margin-top:15px;padding-top:8px;border-top:1px solid #999;font-size:8px;color:#333;text-align:center}
@media print{body{padding:0}}
</style>
${printScript}
</head><body>
<div class="header">
<div class="logo-section"><h1>Soil Seed and Water</h1><p>18980 Stanton Rd, Congress, AZ 85332 | (928) 632-7125 | info@soilseedandwater.com</p></div>
<div class="bol-info"><div class="bol-number">${bol.bol_number}</div><div class="date">${new Date(bol.date).toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'})}</div>${bol.reference_number?`<div class="ref-number">REF: ${bol.reference_number}</div>`:''}</div>
</div>
<div class="two-col">
<div class="section"><div class="section-header">Origin</div><div class="section-content">
<div class="field"><div class="field-label">Location</div><div class="field-value">${bol.origin_location || 'SSW BioSoils'}</div></div>
<div class="field"><div class="field-label">Address</div><div class="field-value">${bol.origin_address || ''}<br>${[bol.origin_city, bol.origin_state, bol.origin_zip].filter(Boolean).join(', ')}</div></div>
</div></div>
<div class="section"><div class="section-header">Destination</div><div class="section-content">
<div class="field"><div class="field-label">Customer</div><div class="field-value">${bol.customer_name}</div></div>
<div class="field"><div class="field-label">Address</div><div class="field-value">${bol.destination_address}<br>${[bol.destination_city, bol.destination_state, bol.destination_zip].filter(Boolean).join(', ')}</div></div>
${bol.onsite_contact_name?`<div class="field"><div class="field-label">Contact</div><div class="field-value">${bol.onsite_contact_name}${bol.onsite_contact_phone?' - '+bol.onsite_contact_phone:''}</div></div>`:''}
</div></div>
</div>
<div class="section"><div class="section-header">Material</div><div class="section-content">
<div class="field"><div class="field-label">Type</div><div class="field-value" style="font-size:14px">${bol.material_type}</div></div>
${bol.material_description?`<div class="field"><div class="field-label">Description</div><div class="field-value">${bol.material_description}</div></div>`:''}
${bol.load_type?`<div class="field"><div class="field-label">Load Type</div><div class="field-value">${bol.load_type}</div></div>`:''}
${hasWeight?`<table class="weight-table"><tr>
<td><div class="wt-label">Gross</div><div class="wt-value">${bol.gross_weight.toLocaleString()}</div><div class="wt-unit">lbs</div></td>
<td><div class="wt-label">Tare</div><div class="wt-value">${bol.tare_weight.toLocaleString()}</div><div class="wt-unit">lbs</div></td>
<td><div class="wt-label">Net Weight</div><div class="wt-value">${bol.net_weight.toLocaleString()}</div><div class="wt-unit">lbs</div><div class="wt-tons">${bol.net_weight_tons} TONS</div></td>
</tr></table>`:''}
</div></div>
<div class="section"><div class="section-header">Carrier & Transport</div><div class="section-content">
<div class="two-col">
<div><div class="field"><div class="field-label">Carrier</div><div class="field-value">${bol.carrier_name || '________________________'}</div></div>
${bol.driver_name?`<div class="field"><div class="field-label">Driver</div><div class="field-value">${bol.driver_name}</div></div>`:''}</div>
<div>${bol.truck_number?`<div class="field"><div class="field-label">Truck #</div><div class="field-value">${bol.truck_number}</div></div>`:''}
${bol.license_plate?`<div class="field"><div class="field-label">License Plate</div><div class="field-value">${bol.license_plate}</div></div>`:''}
${bol.trailer_number?`<div class="field"><div class="field-label">Trailer #</div><div class="field-value">${bol.trailer_number}</div></div>`:''}</div>
</div>
<div class="two-col" style="margin-top:6px">
<div class="field"><div class="field-label">Time In</div><div class="field-value">${bol.time_in || '________________________'}</div></div>
<div class="field"><div class="field-label">Time Out</div><div class="field-value">${bol.time_out || '________________________'}</div></div>
</div>
${bol.scale_operator_initials?`<div class="field" style="margin-top:4px"><div class="field-label">Scale Operator</div><div class="field-value">${bol.scale_operator_initials}</div></div>`:''}</div></div>
${bol.notes?`<div class="section"><div class="section-header">Notes</div><div class="section-content"><div class="field-value">${bol.notes}</div></div></div>`:''}
<div class="signature-section">
<div><div class="signature-box"></div><div class="signature-label">Shipper Signature / Date</div></div>
<div><div class="signature-box"></div><div class="signature-label">Driver Signature / Date</div></div>
<div><div class="signature-box"></div><div class="signature-label">Receiver Signature / Date</div></div>
</div>
<div class="footer">Bill of Lading${hasWeight?' / Weight Ticket':''} — Soil Seed and Water — ${bol.bol_number}</div>
</body></html>`;

      // Return HTML as PDF-ready content
      res.setHeader('Content-Type', 'text/html');
      return res.send(html);
    }

    // GET /api/admin/operations/recent-addresses
    if (path === '/api/admin/operations/recent-addresses' && req.method === 'GET') {
      const admin = await verifyAdminToken(req);
      if (!admin) return res.status(401).json({ error: 'Unauthorized' });

      try {
        const { data, error } = await db
          .from('ops_bols')
          .select('customer_name, destination_address, destination_city, destination_state, destination_zip, onsite_contact_name, onsite_contact_phone, carrier_name, driver_name, truck_number, license_plate, trailer_number, created_at')
          .order('created_at', { ascending: false })
          .limit(200);

        if (error) throw error;

        const destinationMap = new Map();
        const carrierMap = new Map();

        for (const bol of data || []) {
          const destKey = `${bol.customer_name}|${bol.destination_address}`.toLowerCase();
          if (bol.customer_name && bol.destination_address && !destinationMap.has(destKey)) {
            destinationMap.set(destKey, {
              customerName: bol.customer_name,
              destinationAddress: bol.destination_address,
              destinationCity: bol.destination_city,
              destinationState: bol.destination_state,
              destinationZip: bol.destination_zip,
              onsiteContactName: bol.onsite_contact_name,
              onsiteContactPhone: bol.onsite_contact_phone,
              lastUsed: bol.created_at
            });
          }

          if (bol.carrier_name) {
            const carrierKey = bol.carrier_name.toLowerCase();
            if (!carrierMap.has(carrierKey)) {
              carrierMap.set(carrierKey, {
                carrierName: bol.carrier_name,
                driverName: bol.driver_name,
                truckNumber: bol.truck_number,
                licensePlate: bol.license_plate,
                trailerNumber: bol.trailer_number,
                lastUsed: bol.created_at
              });
            }
          }
        }

        return res.json({
          destinations: Array.from(destinationMap.values()),
          carriers: Array.from(carrierMap.values())
        });
      } catch (error) {
        console.error('Recent addresses error:', error);
        return res.status(500).json({ error: 'Failed to fetch recent addresses' });
      }
    }

    // POST /api/admin/operations/bols/:id/email
    const bolEmailMatch = path.match(/^\/api\/admin\/operations\/bols\/(\d+)\/email$/);
    if (bolEmailMatch && req.method === 'POST') {
      const admin = await verifyAdminToken(req);
      if (!admin) return res.status(401).json({ error: 'Unauthorized' });

      const bolId = bolEmailMatch[1];
      const { recipientEmail, recipientName, customMessage } = req.body || {};

      if (!recipientEmail) {
        return res.status(400).json({ error: 'Recipient email is required' });
      }

      try {
        const { data: bol, error: fetchError } = await db.from('ops_bols').select('*').eq('id', bolId).single();
        if (fetchError || !bol) return res.status(404).json({ error: 'BOL not found' });

        // Generate PDF HTML
        const hasWeight = bol.gross_weight > 0 && bol.tare_weight > 0;
        const pdfHtml = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>BOL ${bol.bol_number}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:Arial,sans-serif;font-size:12px;line-height:1.4;padding:20px;max-width:800px;margin:0 auto;color:#000}
.header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #000;padding-bottom:12px;margin-bottom:12px}
.logo-section h1{font-size:20px;font-weight:bold;margin-bottom:2px}
.logo-section p{font-size:9px;color:#333}
.bol-info{text-align:right}
.bol-number{font-size:18px;font-weight:bold;font-family:monospace}
.ref-number{font-size:14px;font-weight:bold;margin-top:4px;border:2px solid #000;padding:3px 8px;display:inline-block}
.date{font-size:11px;color:#333;margin-top:3px}
.section{margin-bottom:10px;border:1px solid #999;overflow:hidden}
.section-header{padding:5px 10px;font-weight:bold;font-size:11px;text-transform:uppercase;border-bottom:1px solid #999}
.section-content{padding:8px 10px}
.two-col{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.field{margin-bottom:5px}
.field-label{font-size:9px;color:#333;text-transform:uppercase;margin-bottom:1px}
.field-value{font-size:12px;font-weight:bold}
.weight-table{width:100%;border-collapse:collapse;margin-top:8px}
.weight-table td{border:2px solid #000;padding:8px 12px;text-align:center}
.weight-table .wt-label{font-size:10px;font-weight:bold;text-transform:uppercase}
.weight-table .wt-value{font-size:22px;font-weight:bold;font-family:monospace}
.weight-table .wt-unit{font-size:11px;font-weight:bold}
.weight-table .wt-tons{font-size:16px;font-weight:bold;margin-top:2px}
.signature-section{display:grid;grid-template-columns:1fr 1fr 1fr;gap:15px;margin-top:20px;padding-top:12px;border-top:1px solid #999}
.signature-box{border-bottom:1px solid #000;padding-bottom:30px;margin-bottom:4px}
.signature-label{font-size:10px;font-weight:bold}
.footer{margin-top:15px;padding-top:8px;border-top:1px solid #999;font-size:8px;color:#333;text-align:center}
</style>
</head><body>
<div class="header">
<div class="logo-section"><h1>Soil Seed and Water</h1><p>18980 Stanton Rd, Congress, AZ 85332 | (928) 632-7125 | info@soilseedandwater.com</p></div>
<div class="bol-info"><div class="bol-number">${bol.bol_number}</div><div class="date">${new Date(bol.date).toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'})}</div>${bol.reference_number?`<div class="ref-number">REF: ${bol.reference_number}</div>`:''}</div>
</div>
<div class="two-col">
<div class="section"><div class="section-header">Origin</div><div class="section-content">
<div class="field"><div class="field-label">Location</div><div class="field-value">${bol.origin_location || 'SSW BioSoils'}</div></div>
<div class="field"><div class="field-label">Address</div><div class="field-value">${bol.origin_address || ''}<br>${[bol.origin_city, bol.origin_state, bol.origin_zip].filter(Boolean).join(', ')}</div></div>
</div></div>
<div class="section"><div class="section-header">Destination</div><div class="section-content">
<div class="field"><div class="field-label">Customer</div><div class="field-value">${bol.customer_name}</div></div>
<div class="field"><div class="field-label">Address</div><div class="field-value">${bol.destination_address}<br>${[bol.destination_city, bol.destination_state, bol.destination_zip].filter(Boolean).join(', ')}</div></div>
${bol.onsite_contact_name?`<div class="field"><div class="field-label">Contact</div><div class="field-value">${bol.onsite_contact_name}${bol.onsite_contact_phone?' - '+bol.onsite_contact_phone:''}</div></div>`:''}
</div></div>
</div>
<div class="section"><div class="section-header">Material</div><div class="section-content">
<div class="field"><div class="field-label">Type</div><div class="field-value" style="font-size:14px">${bol.material_type}</div></div>
${bol.material_description?`<div class="field"><div class="field-label">Description</div><div class="field-value">${bol.material_description}</div></div>`:''}
${bol.load_type?`<div class="field"><div class="field-label">Load Type</div><div class="field-value">${bol.load_type}</div></div>`:''}
${hasWeight?`<table class="weight-table"><tr>
<td><div class="wt-label">Gross</div><div class="wt-value">${bol.gross_weight.toLocaleString()}</div><div class="wt-unit">lbs</div></td>
<td><div class="wt-label">Tare</div><div class="wt-value">${bol.tare_weight.toLocaleString()}</div><div class="wt-unit">lbs</div></td>
<td><div class="wt-label">Net Weight</div><div class="wt-value">${bol.net_weight.toLocaleString()}</div><div class="wt-unit">lbs</div><div class="wt-tons">${bol.net_weight_tons} TONS</div></td>
</tr></table>`:''}
</div></div>
<div class="section"><div class="section-header">Carrier & Transport</div><div class="section-content">
<div class="two-col">
<div><div class="field"><div class="field-label">Carrier</div><div class="field-value">${bol.carrier_name || '________________________'}</div></div>
${bol.driver_name?`<div class="field"><div class="field-label">Driver</div><div class="field-value">${bol.driver_name}</div></div>`:''}</div>
<div>${bol.truck_number?`<div class="field"><div class="field-label">Truck #</div><div class="field-value">${bol.truck_number}</div></div>`:''}
${bol.license_plate?`<div class="field"><div class="field-label">License Plate</div><div class="field-value">${bol.license_plate}</div></div>`:''}
${bol.trailer_number?`<div class="field"><div class="field-label">Trailer #</div><div class="field-value">${bol.trailer_number}</div></div>`:''}</div>
</div>
<div class="two-col" style="margin-top:6px">
<div class="field"><div class="field-label">Time In</div><div class="field-value">${bol.time_in || '________________________'}</div></div>
<div class="field"><div class="field-label">Time Out</div><div class="field-value">${bol.time_out || '________________________'}</div></div>
</div>
${bol.scale_operator_initials?`<div class="field" style="margin-top:4px"><div class="field-label">Scale Operator</div><div class="field-value">${bol.scale_operator_initials}</div></div>`:''}</div></div>
${bol.notes?`<div class="section"><div class="section-header">Notes</div><div class="section-content"><div class="field-value">${bol.notes}</div></div></div>`:''}
<div class="signature-section">
<div><div class="signature-box"></div><div class="signature-label">Shipper Signature / Date</div></div>
<div><div class="signature-box"></div><div class="signature-label">Driver Signature / Date</div></div>
<div><div class="signature-box"></div><div class="signature-label">Receiver Signature / Date</div></div>
</div>
<div class="footer">Bill of Lading${hasWeight?' / Weight Ticket':''} — Soil Seed and Water — ${bol.bol_number}</div>
</body></html>`;

        // Use Puppeteer to generate PDF
        const puppeteer = (await import('puppeteer')).default;
        const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
        const page = await browser.newPage();
        await page.setContent(pdfHtml, { waitUntil: 'networkidle0' });
        const pdfBuffer = await page.pdf({ format: 'Letter', printBackground: true, margin: { top: '0.3in', right: '0.3in', bottom: '0.3in', left: '0.3in' } });
        await browser.close();

        // Build email
        const deliveryDate = new Date(bol.date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
        const destination = [bol.destination_address, bol.destination_city, bol.destination_state, bol.destination_zip].filter(Boolean).join(', ');
        const greeting = recipientName ? `Hi ${recipientName},` : 'Hello,';
        const customSection = customMessage ? `<p style="margin: 0 0 20px 0; font-size: 15px; line-height: 1.6; color: #333;">${customMessage.replace(/\n/g, '<br>')}</p>` : '';

        const emailHtml = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin: 0; padding: 0; background-color: #f4f4f4; font-family: 'Helvetica Neue', Arial, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f4; padding: 30px 0;">
    <tr><td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
          <tr><td style="background-color: #264027; padding: 28px 40px;">
              <h1 style="margin: 0; font-size: 22px; color: #ffffff; font-weight: 700;">Soil Seed &amp; Water</h1>
              <p style="margin: 4px 0 0 0; font-size: 13px; color: #a8c5a0;">Regenerative Soil Solutions</p>
          </td></tr>
          <tr><td style="padding: 36px 40px 24px 40px;">
              <p style="margin: 0 0 16px 0; font-size: 15px; line-height: 1.6; color: #333;">${greeting}</p>
              ${customSection || `<p style="margin: 0 0 20px 0; font-size: 15px; line-height: 1.6; color: #333;">Please find attached the Bill of Lading for your delivery. The PDF document is attached to this email for your records.</p>`}
          </td></tr>
          <tr><td style="padding: 0 40px 30px 40px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f8faf8; border: 1px solid #e0e8e0; border-radius: 8px; overflow: hidden;">
                <tr><td style="background-color: #264027; padding: 14px 20px;">
                    <span style="font-size: 16px; font-weight: 700; color: #ffffff;">${bol.bol_number}</span>
                    <span style="font-size: 12px; color: #a8c5a0; margin-left: 12px;">Bill of Lading</span>
                </td></tr>
                <tr><td style="padding: 20px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr><td style="padding: 6px 0; font-size: 13px; color: #666; width: 130px;">Delivery Date</td><td style="padding: 6px 0; font-size: 14px; color: #111; font-weight: 600;">${deliveryDate}</td></tr>
                      <tr><td style="padding: 6px 0; font-size: 13px; color: #666;">Customer</td><td style="padding: 6px 0; font-size: 14px; color: #111; font-weight: 600;">${bol.customer_name}</td></tr>
                      <tr><td style="padding: 6px 0; font-size: 13px; color: #666;">Destination</td><td style="padding: 6px 0; font-size: 14px; color: #111;">${destination}</td></tr>
                      <tr><td style="padding: 6px 0; font-size: 13px; color: #666;">Material</td><td style="padding: 6px 0; font-size: 14px; color: #111;">${bol.material_type}</td></tr>
                      ${hasWeight ? `<tr><td style="padding: 6px 0; font-size: 13px; color: #666;">Net Weight</td><td style="padding: 6px 0; font-size: 14px; color: #111; font-weight: 600;">${parseInt(bol.net_weight).toLocaleString()} lbs (${bol.net_weight_tons} tons)</td></tr>` : ''}
                      ${bol.carrier_name ? `<tr><td style="padding: 6px 0; font-size: 13px; color: #666;">Carrier</td><td style="padding: 6px 0; font-size: 14px; color: #111;">${bol.carrier_name}</td></tr>` : ''}
                    </table>
                </td></tr>
              </table>
          </td></tr>
          <tr><td style="padding: 0 40px 30px 40px;">
              <p style="margin: 0; font-size: 14px; line-height: 1.6; color: #555;">If you have any questions about this delivery, don't hesitate to reach out.</p>
          </td></tr>
          <tr><td style="padding: 0 40px 36px 40px; border-top: 1px solid #eee; padding-top: 24px;">
              <p style="margin: 0 0 2px 0; font-size: 14px; color: #333; font-weight: 600;">Rodolfo Alvarez</p>
              <p style="margin: 0 0 2px 0; font-size: 13px; color: #666;">Soil Seed &amp; Water</p>
              <p style="margin: 0 0 2px 0; font-size: 13px; color: #666;">(928) 632-7125</p>
              <p style="margin: 0; font-size: 13px; color: #264027;">operations@soilseedandwater.com</p>
          </td></tr>
          <tr><td style="background-color: #f8f8f8; padding: 16px 40px; text-align: center;">
              <p style="margin: 0; font-size: 11px; color: #999;">Soil Seed &amp; Water &bull; 1634 N 19th Ave, Phoenix, AZ 85009 &bull; soilseedandwater.com</p>
          </td></tr>
        </table>
    </td></tr>
  </table>
</body></html>`;

        const plainText = customMessage || `${greeting}\n\nPlease find attached the Bill of Lading (${bol.bol_number}) for your delivery.\n\nMaterial: ${bol.material_type}\nDelivery Date: ${deliveryDate}\nDestination: ${destination}${hasWeight ? `\nNet Weight: ${parseInt(bol.net_weight).toLocaleString()} lbs (${bol.net_weight_tons} tons)` : ''}\n\nIf you have any questions, please don't hesitate to contact us.\n\nRodolfo Alvarez\nSoil Seed & Water\n(928) 632-7125\noperations@soilseedandwater.com`;

        // Send via Resend
        const RESEND_API_KEY = process.env.RESEND_API_KEY;
        if (!RESEND_API_KEY) throw new Error('Resend API key not configured');

        const emailResponse = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: 'SSW Operations <operations@soilseedandwater.com>',
            to: [recipientEmail],
            subject: `Bill of Lading - ${bol.bol_number} | ${bol.customer_name}`,
            html: emailHtml,
            text: plainText,
            attachments: [{ filename: `${bol.bol_number}.pdf`, content: Buffer.from(pdfBuffer).toString('base64') }]
          })
        });

        if (!emailResponse.ok) {
          const errorData = await emailResponse.json();
          throw new Error(errorData.message || 'Failed to send email');
        }

        // Update BOL with sent info
        await db.from('ops_bols').update({ sent_to_email: recipientEmail, sent_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', bolId);

        return res.json({ success: true, message: `BOL sent successfully to ${recipientEmail}`, sentTo: recipientEmail });
      } catch (error) {
        console.error('Email BOL error:', error);
        return res.status(500).json({ error: error.message || 'Failed to send email' });
      }
    }

    // ============ COD ENDPOINTS ============

    // GET /api/admin/operations/cods
    if (path === '/api/admin/operations/cods' && req.method === 'GET') {
      const admin = await verifyAdminToken(req);
      if (!admin) return res.status(401).json({ error: 'Unauthorized' });

      try {
        let query = db.from('ops_cods').select('*');
        const clientTag = url.searchParams.get('client_tag');
        if (clientTag) query = query.eq('client_tag', clientTag);
        query = query.order('created_at', { ascending: false });
        const { data, error } = await query;
        if (error) throw error;
        return res.json(data);
      } catch (error) {
        console.error('CODs fetch error:', error);
        return res.status(500).json({ error: 'Failed to fetch CODs' });
      }
    }

    // POST /api/admin/operations/cods
    if (path === '/api/admin/operations/cods' && req.method === 'POST') {
      const admin = await verifyAdminToken(req);
      if (!admin) return res.status(401).json({ error: 'Unauthorized' });

      try {
        const { dateReceived, receivedFrom, salesOrder, freightOrder, vanguardWorkOrder, destructionLocation, materials, authorizedByName, authorizedByTitle, authorizedDate, notes, clientTag, bolId } = req.body || {};

        if (!receivedFrom || !destructionLocation || !materials || materials.length === 0) {
          return res.status(400).json({ error: 'Missing required fields' });
        }

        // Generate COD number
        const today = new Date();
        const dateStr = today.toISOString().split('T')[0].replace(/-/g, '');
        const { count } = await db.from('ops_cods').select('id', { count: 'exact', head: true })
          .gte('created_at', `${today.toISOString().split('T')[0]}T00:00:00`)
          .lte('created_at', `${today.toISOString().split('T')[0]}T23:59:59`);
        const codNumber = `COD-${dateStr}-${((count || 0) + 1).toString().padStart(3, '0')}`;

        const { data, error } = await db.from('ops_cods').insert({
          cod_number: codNumber,
          date_received: dateReceived || new Date().toISOString(),
          received_from: receivedFrom,
          sales_order: salesOrder,
          freight_order: freightOrder,
          vanguard_work_order: vanguardWorkOrder,
          destruction_location: destructionLocation,
          materials,
          authorized_by_name: authorizedByName,
          authorized_by_title: authorizedByTitle,
          authorized_date: authorizedDate,
          notes,
          client_tag: clientTag || null,
          bol_id: bolId ? parseInt(bolId) : null,
          status: 'completed',
          created_by: admin.email || 'admin'
        }).select().single();

        if (error) throw error;
        return res.status(201).json(data);
      } catch (error) {
        console.error('COD create error:', error);
        return res.status(500).json({ error: 'Failed to create COD' });
      }
    }

    // POST /api/admin/operations/cods/delete
    if (path === '/api/admin/operations/cods/delete' && req.method === 'POST') {
      const admin = await verifyAdminToken(req);
      if (!admin) return res.status(401).json({ error: 'Unauthorized' });

      const { ids } = req.body || {};
      if (!ids || !Array.isArray(ids)) return res.status(400).json({ error: 'No IDs provided' });

      const { error } = await db.from('ops_cods').delete().in('id', ids);
      if (error) return res.status(500).json({ error: error.message });
      return res.json({ success: true, deleted: ids.length });
    }

    // GET/PATCH /api/admin/operations/cods/:id
    const codDetailMatch = path.match(/^\/api\/admin\/operations\/cods\/(\d+)$/);
    if (codDetailMatch) {
      const admin = await verifyAdminToken(req);
      if (!admin) return res.status(401).json({ error: 'Unauthorized' });

      const codId = codDetailMatch[1];

      if (req.method === 'GET') {
        const { data, error } = await db.from('ops_cods').select('*').eq('id', codId).single();
        if (error || !data) return res.status(404).json({ error: 'COD not found' });
        return res.json(data);
      }

      if (req.method === 'PATCH') {
        const updates = req.body || {};
        const fieldMap = {
          dateReceived: 'date_received', receivedFrom: 'received_from', salesOrder: 'sales_order',
          freightOrder: 'freight_order', vanguardWorkOrder: 'vanguard_work_order',
          destructionLocation: 'destruction_location', materials: 'materials',
          authorizedByName: 'authorized_by_name', authorizedByTitle: 'authorized_by_title',
          authorizedDate: 'authorized_date', notes: 'notes', status: 'status',
          clientTag: 'client_tag', bolId: 'bol_id'
        };
        const dbUpdates = { updated_at: new Date().toISOString() };
        for (const [key, value] of Object.entries(updates)) {
          const snakeKey = fieldMap[key] || key;
          if (fieldMap[key] || key === 'status') dbUpdates[snakeKey] = value;
        }
        const { data, error } = await db.from('ops_cods').update(dbUpdates).eq('id', codId).select().single();
        if (error || !data) return res.status(404).json({ error: 'COD not found' });
        return res.json(data);
      }
    }

    // GET /api/admin/operations/cods/:id/pdf
    const codPdfMatch = path.match(/^\/api\/admin\/operations\/cods\/(\d+)\/pdf$/);
    if (codPdfMatch && req.method === 'GET') {
      const tokenFromQuery = url.searchParams.get('token');
      const tokenFromHeader = req.headers.authorization?.replace('Bearer ', '');
      const token = tokenFromQuery || tokenFromHeader;
      if (!token) return res.status(401).json({ error: 'Unauthorized' });

      const admin = await verifyAdminTokenValue(token);
      if (!admin) {
        return res.status(401).json({ error: 'Invalid token' });
      }

      const codId = codPdfMatch[1];
      const { data: cod, error } = await db.from('ops_cods').select('*').eq('id', codId).single();
      if (error || !cod) return res.status(404).json({ error: 'COD not found' });

      const formatDate = (d) => d ? new Date(d).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '';
      const materials = cod.materials || [];
      const materialRows = materials.map(m => `<tr><td style="padding:10px 12px;border-bottom:1px solid #e5e5e5;font-size:10pt">${m.material||''}</td><td style="padding:10px 12px;border-bottom:1px solid #e5e5e5;font-size:10pt;text-align:center">${m.quantity||''}</td><td style="padding:10px 12px;border-bottom:1px solid #e5e5e5;font-size:10pt;text-align:center">${m.uom||''}</td></tr>`).join('');
      const emptyRows = Array(Math.max(0, 5 - materials.length)).fill('<tr><td style="padding:10px 12px;border-bottom:1px solid #e5e5e5">&nbsp;</td><td style="padding:10px 12px;border-bottom:1px solid #e5e5e5">&nbsp;</td><td style="padding:10px 12px;border-bottom:1px solid #e5e5e5">&nbsp;</td></tr>').join('');

      const autoPrint = url.searchParams.get('print') !== 'false';
      const printScript = autoPrint ? `<script>window.onload=function(){setTimeout(function(){window.print()},500)}</script>` : '';

      const codHtml = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${cod.cod_number} - Certificate of Destruction</title>
<style>
@page{size:letter;margin:0.4in}*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Helvetica Neue',Arial,sans-serif;font-size:10pt;line-height:1.5;color:#000;padding:20px;max-width:800px;margin:0 auto;background:white}
.header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:25px;padding-bottom:15px;border-bottom:3px solid #264027}.logo-section{flex:1}.company-name{font-size:20pt;font-weight:bold;color:#264027;margin-bottom:4px}.tagline{font-size:9pt;color:#6f732f;margin-bottom:6px}.contact-info{font-size:8pt;color:#333}.doc-title{text-align:right;flex:1}.doc-title h1{font-size:18pt;color:#264027;margin-bottom:8px}.cod-number{font-size:11pt;font-weight:bold;color:#000}
.section{margin-bottom:20px}.section-title{font-size:10pt;font-weight:bold;color:#264027;background:#f5f5f5;padding:6px 10px;border-left:4px solid #264027;margin-bottom:10px}.info-grid{display:grid;grid-template-columns:1fr 1fr;gap:15px}.info-row{display:flex;margin-bottom:8px;font-size:10pt}.label{font-weight:bold;min-width:150px;color:#333}.value{flex:1;color:#000}
.materials-table{width:100%;border-collapse:collapse;margin-top:10px}.materials-table th{background:#264027;color:white;padding:10px 12px;text-align:left;font-size:10pt;font-weight:600}.materials-table th:nth-child(2),.materials-table th:nth-child(3){text-align:center;width:100px}
.signature-section{margin-top:30px;padding-top:20px;border-top:1px solid #ccc}.signature-row{display:grid;grid-template-columns:1fr 1fr;gap:30px;margin-bottom:20px}.signature-box{border-bottom:1px solid #000;padding-top:30px;padding-bottom:5px;min-height:50px}.signature-label{font-size:8pt;color:#666;margin-top:4px}
.disclaimer{margin-top:30px;padding:15px;background:#f9f9f9;border:1px solid #e0e0e0;border-radius:4px;font-size:9pt;color:#444;line-height:1.6}.footer{margin-top:25px;padding-top:15px;border-top:1px solid #ccc;font-size:8pt;color:#666;text-align:center}
@media screen{body{background:#f0f0f0;padding:20px}}
</style>${printScript}</head><body>
<div class="header"><div class="logo-section"><div class="company-name">Soil Seed and Water</div><div class="tagline">Regenerative Soil Solutions</div><div class="contact-info">18980 Stanton Rd, Congress, AZ 85332<br>Phone: (928) 632-7125<br>Email: info@soilseedandwater.com</div></div><div class="doc-title"><h1>Certificate of Destruction</h1><div class="cod-number">COD #: ${cod.cod_number}</div></div></div>
<div class="section"><div class="section-title">Receipt Information</div><div class="info-grid"><div><div class="info-row"><span class="label">Received From:</span><span class="value">${cod.received_from||''}</span></div><div class="info-row"><span class="label">Date Received:</span><span class="value">${formatDate(cod.date_received)}</span></div></div><div><div class="info-row"><span class="label">Destruction Location:</span><span class="value">${cod.destruction_location||''}</span></div></div></div></div>
<div class="section"><div class="section-title">Customer Reference Numbers</div><div class="info-grid"><div><div class="info-row"><span class="label">Sales Order:</span><span class="value">${cod.sales_order||'—'}</span></div><div class="info-row"><span class="label">Freight Order:</span><span class="value">${cod.freight_order||'—'}</span></div></div><div><div class="info-row"><span class="label">Vanguard Work Order #:</span><span class="value">${cod.vanguard_work_order||'—'}</span></div></div></div></div>
<div class="section"><div class="section-title">Materials Destroyed</div><table class="materials-table"><thead><tr><th>Material</th><th>Quantity</th><th>UOM</th></tr></thead><tbody>${materialRows}${emptyRows}</tbody></table></div>
<div class="signature-section"><div class="section-title">Authorization</div><div class="signature-row"><div><div class="info-row"><span class="label">Authorized By:</span><span class="value">${cod.authorized_by_name||''}</span></div><div class="info-row"><span class="label">Title:</span><span class="value">${cod.authorized_by_title||''}</span></div></div><div><div class="info-row"><span class="label">Date:</span><span class="value">${formatDate(cod.authorized_date)}</span></div></div></div><div class="signature-row"><div><div class="signature-box"></div><div class="signature-label">Authorized Signature</div></div><div><div class="signature-box"></div><div class="signature-label">SSW Representative Signature</div></div></div></div>
<div class="disclaimer"><strong>Certification:</strong> Vanguard warrants that all organic materials listed above were presented and have been destroyed for the purpose of the recycling of organic materials into soil amendments and compost products.</div>
${cod.notes?`<div class="section" style="margin-top:15px"><div class="section-title">Notes</div><div style="padding:8px 10px;background:#fafafa;border-radius:4px;font-size:9pt">${cod.notes}</div></div>`:''}
<div class="footer">Certificate of Destruction - ${cod.cod_number} | Generated by Soil Seed and Water Operations System</div>
</body></html>`;

      res.setHeader('Content-Type', 'text/html');
      return res.send(codHtml);
    }

    // ============ WORK ORDERS ENDPOINTS ============

    // Airtable configuration for SSW1 base (products)
    const SSW1_BASE_ID = "appDCKrxtJ7oG9O19";
    const PRODUCTS_TABLE_ID = "tbltXMzV96FnmrjFw";
    const SIZE_CATEGORIES_TABLE_ID = "tblkNN71Iiyh2GjEi";
    const INGREDIENTS_TABLE_ID = "tblujGuwLKvJzgOR4";
    const PALLET_CONFIG_TABLE_ID = "tblNqNFuOXsI6ZKeV";

    // Pallet configuration data (from Airtable Pallet Configuration table)
    const PALLET_CONFIGS = {
      '9lb': { unitsPerPallet: 144, weightPerPallet: 1296, config: 'Boxed pallet, 4 units per box, 36 boxes per pallet. Total of 144 units', weightPerUnit: 9 },
      '7.5qt': { unitsPerPallet: 144, weightPerPallet: 1000, config: 'Boxed pallet, 4 units per box, 36 boxes per pallet. Total of 144 units', weightPerUnit: 7 },
      '1cf': { unitsPerPallet: 50, weightPerPallet: 2000, config: 'Without boxes, bags stacked on pallet. 50 (1CF bags) per pallet', weightPerUnit: 40 },
      '1.5cf': { unitsPerPallet: 50, weightPerPallet: 2000, config: '50 per pallet', weightPerUnit: 40 },
      '2cf': { unitsPerPallet: 25, weightPerPallet: 2000, config: '25 per pallet', weightPerUnit: 80 },
      'tote': { unitsPerPallet: 1, weightPerPallet: 2000, config: '1 unit per pallet (2.2 cubic yards)', weightPerUnit: 2000 },
      'bulk': { unitsPerPallet: null, weightPerPallet: 2000, config: 'Bulk calculated by tonnage (2000 lbs each). Usually 22-24 tons per truck.', weightPerUnit: null },
    };

    // Helper: Fetch all ingredients for name lookup
    async function fetchIngredientsLookup() {
      const lookup = {};
      let offset;
      do {
        const urlStr = `https://api.airtable.com/v0/${SSW1_BASE_ID}/${INGREDIENTS_TABLE_ID}?fields%5B%5D=Name&pageSize=100${offset ? `&offset=${offset}` : ''}`;
        const response = await fetch(urlStr, {
          headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` },
        });
        if (!response.ok) break;
        const data = await response.json();
        for (const record of data.records || []) {
          if (record.fields && record.fields.Name) {
            lookup[record.id] = record.fields.Name;
          }
        }
        offset = data.offset;
      } while (offset);
      return lookup;
    }

    // Helper: Generate WO number
    async function generateWONumber() {
      const today = new Date();
      const dateStr = today.toISOString().split("T")[0].replace(/-/g, "");
      const { count } = await db
        .from("ops_work_orders")
        .select("id", { count: "exact", head: true })
        .gte("created_at", `${today.toISOString().split("T")[0]}T00:00:00`)
        .lte("created_at", `${today.toISOString().split("T")[0]}T23:59:59`);
      const sequence = ((count || 0) + 1).toString().padStart(3, "0");
      return `WO-${dateStr}-${sequence}`;
    }

    // Helper: Generate size category code from name
    function generateSizeCategoryCode(name) {
      const lower = name.toLowerCase();
      if (lower.includes("9 lb") || lower.includes("9lb")) return "9lb";
      if (lower.includes("7.5 qt") || lower.includes("7.5qt")) return "7.5qt";
      if (lower.includes("1.5 cf") || lower.includes("1.5cf")) return "1.5cf";
      if (lower.includes("2 cf") || lower.includes("2cf")) return "2cf";
      if (lower.includes("1 cf") || lower.includes("1cf")) return "1cf";
      if (lower.includes("tote") || lower.includes("super sack")) return "tote";
      if (lower.includes("bulk") || lower.includes("cubic yard")) return "bulk";
      return lower.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 20);
    }

    // Helper: Fetch products from Airtable with ingredient name resolution
    async function fetchProductsFromAirtable() {
      // First, get ingredients lookup
      const ingredientsLookup = await fetchIngredientsLookup();

      const products = [];
      let offset;
      do {
        const urlStr = `https://api.airtable.com/v0/${SSW1_BASE_ID}/${PRODUCTS_TABLE_ID}?pageSize=100${offset ? `&offset=${offset}` : ''}`;
        const response = await fetch(urlStr, {
          headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` },
        });
        if (!response.ok) throw new Error(`Airtable error: ${response.status}`);
        const data = await response.json();
        for (const record of data.records || []) {
          const fields = record.fields || {};

          // Resolve ingredient record IDs to actual names
          let ingredientsList = null;
          if (Array.isArray(fields["Ingredients"])) {
            const resolvedNames = fields["Ingredients"]
              .map(id => ingredientsLookup[id] || id)
              .filter(name => name && !name.startsWith('rec')); // Filter out unresolved IDs
            ingredientsList = resolvedNames.length > 0 ? resolvedNames.join(", ") : null;
          } else if (typeof fields["Ingredients"] === 'string') {
            ingredientsList = fields["Ingredients"];
          }

          products.push({
            airtableId: record.id,
            productName: fields["Product Name "] || fields["Product Name"] || fields["Name"] || "Unknown",
            productId: fields["Product ID"] || null,
            ingredientRatios: fields["Ingredient Ratios"] || null,
            ingredientsList: ingredientsList,
            sizeCategories: Array.isArray(fields["Size Categories"]) ? fields["Size Categories"] : [],
            certifications: Array.isArray(fields["Certifications"]) ? fields["Certifications"] : [],
          });
        }
        offset = data.offset;
      } while (offset);
      return products;
    }

    // Helper: Fetch size categories from Airtable
    async function fetchSizeCategoriesFromAirtable() {
      const categories = [];
      let offset;
      do {
        const urlStr = `https://api.airtable.com/v0/${SSW1_BASE_ID}/${SIZE_CATEGORIES_TABLE_ID}?pageSize=100${offset ? `&offset=${offset}` : ''}`;
        const response = await fetch(urlStr, {
          headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` },
        });
        if (!response.ok) throw new Error(`Airtable error: ${response.status}`);
        const data = await response.json();
        for (const record of data.records || []) {
          const fields = record.fields || {};
          const name = fields["Name"] || "Unknown";
          categories.push({
            airtableId: record.id,
            name: name,
            code: generateSizeCategoryCode(name),
            unitsPerPallet: fields["Units per pallet"] || null,
            estimatedPalletWeight: fields["Estimated pallet weight"] || null,
            illustrationUrl: Array.isArray(fields["Size category illustration"]) && fields["Size category illustration"][0]
              ? fields["Size category illustration"][0].url : null,
            palletConfiguration: fields["Pallet Configuration"] || null,
          });
        }
        offset = data.offset;
      } while (offset);
      return categories;
    }

    // GET /api/admin/operations/work-orders/products
    if (path === '/api/admin/operations/work-orders/products' && req.method === 'GET') {
      const admin = await verifyAdminToken(req);
      if (!admin) return res.status(401).json({ error: 'Unauthorized' });

      // Try cache first
      const { data: cached } = await db.from('ops_products_cache').select('*').order('product_name', { ascending: true });
      if (cached && cached.length > 0) {
        return res.json(cached);
      }

      // Fallback: fetch from Airtable and cache
      try {
        const products = await fetchProductsFromAirtable();
        for (const product of products) {
          await db.from('ops_products_cache').upsert({
            airtable_id: product.airtableId,
            product_name: product.productName,
            product_id: product.productId,
            ingredient_ratios: product.ingredientRatios,
            ingredients_list: product.ingredientsList,
            size_categories: product.sizeCategories,
            certifications: product.certifications,
            last_synced_at: new Date().toISOString(),
          }, { onConflict: 'airtable_id' });
        }
        const { data: freshData } = await db.from('ops_products_cache').select('*').order('product_name', { ascending: true });
        return res.json(freshData || []);
      } catch (err) {
        console.error('Airtable fetch error:', err);
        return res.json([]);
      }
    }

    // GET /api/admin/operations/work-orders/size-categories
    if (path === '/api/admin/operations/work-orders/size-categories' && req.method === 'GET') {
      const admin = await verifyAdminToken(req);
      if (!admin) return res.status(401).json({ error: 'Unauthorized' });

      // Try cache first
      const { data: cached } = await db.from('ops_size_categories_cache').select('*').order('name', { ascending: true });
      if (cached && cached.length > 0) {
        return res.json(cached);
      }

      // Fallback: fetch from Airtable and cache
      try {
        const categories = await fetchSizeCategoriesFromAirtable();
        for (const cat of categories) {
          await db.from('ops_size_categories_cache').upsert({
            airtable_id: cat.airtableId,
            name: cat.name,
            code: cat.code,
            units_per_pallet: cat.unitsPerPallet,
            estimated_pallet_weight: cat.estimatedPalletWeight,
            illustration_url: cat.illustrationUrl,
            pallet_configuration: cat.palletConfiguration,
            last_synced_at: new Date().toISOString(),
          }, { onConflict: 'airtable_id' });
        }
        const { data: freshData } = await db.from('ops_size_categories_cache').select('*').order('name', { ascending: true });
        return res.json(freshData || []);
      } catch (err) {
        console.error('Airtable fetch error:', err);
        return res.json([]);
      }
    }

    // POST /api/admin/operations/work-orders/sync-products
    if (path === '/api/admin/operations/work-orders/sync-products' && req.method === 'POST') {
      const admin = await verifyAdminToken(req);
      if (!admin) return res.status(401).json({ error: 'Unauthorized' });

      try {
        const products = await fetchProductsFromAirtable();
        let productsSynced = 0;
        for (const product of products) {
          const { error } = await db.from('ops_products_cache').upsert({
            airtable_id: product.airtableId,
            product_name: product.productName,
            product_id: product.productId,
            ingredient_ratios: product.ingredientRatios,
            ingredients_list: product.ingredientsList,
            size_categories: product.sizeCategories,
            certifications: product.certifications,
            last_synced_at: new Date().toISOString(),
          }, { onConflict: 'airtable_id' });
          if (!error) productsSynced++;
        }

        const categories = await fetchSizeCategoriesFromAirtable();
        let categoriesSynced = 0;
        for (const cat of categories) {
          const { error } = await db.from('ops_size_categories_cache').upsert({
            airtable_id: cat.airtableId,
            name: cat.name,
            code: cat.code,
            units_per_pallet: cat.unitsPerPallet,
            estimated_pallet_weight: cat.estimatedPalletWeight,
            illustration_url: cat.illustrationUrl,
            pallet_configuration: cat.palletConfiguration,
            last_synced_at: new Date().toISOString(),
          }, { onConflict: 'airtable_id' });
          if (!error) categoriesSynced++;
        }

        return res.json({
          success: true,
          products: { synced: productsSynced, errors: [] },
          sizeCategories: { synced: categoriesSynced, errors: [] },
        });
      } catch (err) {
        console.error('Sync error:', err);
        return res.status(500).json({ error: err.message });
      }
    }

    // POST /api/admin/operations/work-orders/calculate-mix
    if (path === '/api/admin/operations/work-orders/calculate-mix' && req.method === 'POST') {
      const admin = await verifyAdminToken(req);
      if (!admin) return res.status(401).json({ error: 'Unauthorized' });

      const { productName, ingredientRatios, sizeCategory, sizeCategoryName, unitsPerPallet, estimatedPalletWeight, quantity, quantityType } = req.body || {};

      // Get pallet config from our lookup table
      const palletConfig = PALLET_CONFIGS[sizeCategory] || {};
      const configUnitsPerPallet = unitsPerPallet || palletConfig.unitsPerPallet || 0;
      const configWeightPerPallet = palletConfig.weightPerPallet || 0;
      const configWeightPerUnit = palletConfig.weightPerUnit || 0;
      const configDescription = palletConfig.config || '';

      // Parse estimated weight if provided
      let palletWeightLbs = configWeightPerPallet;
      if (estimatedPalletWeight) {
        const parsed = parseFloat(estimatedPalletWeight.replace(/,/g, "").replace(/\s*lbs?/i, ""));
        if (parsed > 0) palletWeightLbs = parsed;
      }

      let totalWeight = 0;
      let calculationDetails = "";

      if (quantityType === "pallet" && palletWeightLbs > 0) {
        totalWeight = quantity * palletWeightLbs;
        calculationDetails = `${quantity} pallet${quantity > 1 ? "s" : ""} x ${palletWeightLbs.toLocaleString()} lbs = ${totalWeight.toLocaleString()} lbs`;
      } else if (quantityType === "unit" && configWeightPerUnit > 0) {
        totalWeight = quantity * configWeightPerUnit;
        calculationDetails = `${quantity} unit${quantity > 1 ? "s" : ""} @ ${configWeightPerUnit} lbs each = ${totalWeight.toLocaleString()} lbs`;
      } else if (quantity > 0 && palletWeightLbs > 0) {
        // Default to pallet calculation
        totalWeight = quantity * palletWeightLbs;
        calculationDetails = `${quantity} x ${palletWeightLbs.toLocaleString()} lbs = ${totalWeight.toLocaleString()} lbs`;
      }

      // Round up to minimum batch size (2 tons = 4000 lbs) if needed
      let roundUpNote = "";
      if (totalWeight > 0 && totalWeight < 4000) {
        roundUpNote = `\n\nNote: Minimum recommended batch size is 2 tons (4,000 lbs). Consider rounding up for efficiency.`;
      }

      // Parse and calculate ingredient breakdown
      let ingredientBreakdown = "";
      if (ingredientRatios && totalWeight > 0) {
        const ratioLines = [];
        // Match patterns like "50% dairy compost" or "100% Worm Castings"
        const ratioMatch = ingredientRatios.match(/(\d+)%\s*([^,]+)/g);
        if (ratioMatch) {
          let totalPercentage = 0;
          for (const match of ratioMatch) {
            const [, percent, ingredient] = match.match(/(\d+)%\s*(.+)/) || [];
            if (percent && ingredient) {
              const percentage = parseInt(percent);
              totalPercentage += percentage;
              const weight = Math.round((percentage / 100) * totalWeight);
              ratioLines.push(`${ingredient.trim()} = ${percentage}% → ${weight.toLocaleString()} lbs`);
            }
          }
          // Validate percentages add up
          const actualNote = totalPercentage !== 100 ? ` (Actual ${totalPercentage}%)` : '';
          ingredientBreakdown = ratioLines.join("\n");
        } else if (ingredientRatios.toLowerCase().includes('100%')) {
          // Single ingredient at 100%
          const ingredientName = ingredientRatios.replace(/100%\s*/i, '').trim();
          ingredientBreakdown = `${ingredientName || 'Primary ingredient'} = 100% → ${totalWeight.toLocaleString()} lbs`;
        } else {
          ingredientBreakdown = `${ingredientRatios}: 100% → ${totalWeight.toLocaleString()} lbs`;
        }
      }

      const guidelines = `Pallet configuration: ${sizeCategoryName || sizeCategory}
${configDescription ? `${configDescription}` : ''}
${configUnitsPerPallet ? `Units per pallet: ${configUnitsPerPallet}` : ''}

Total estimated final weight: ${calculationDetails}

Total ingredient for mix:
${ingredientBreakdown || 'No ingredient ratios specified'}

Total anticipated product weight: ${totalWeight.toLocaleString()} lbs${roundUpNote}`.trim();

      return res.json({ mixingGuidelines: guidelines, totalWeightLbs: Math.round(totalWeight) });
    }

    // POST /api/admin/operations/work-orders/delete
    if (path === '/api/admin/operations/work-orders/delete' && req.method === 'POST') {
      const admin = await verifyAdminToken(req);
      if (!admin) return res.status(401).json({ error: 'Unauthorized' });

      const { ids } = req.body || {};
      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ message: 'No IDs provided' });
      }

      const { error } = await db.from('ops_work_orders').delete().in('id', ids);
      if (error) throw error;

      return res.json({ success: true, deleted: ids.length });
    }

    // GET /api/admin/operations/work-orders - List all work orders
    if (path === '/api/admin/operations/work-orders' && req.method === 'GET') {
      const admin = await verifyAdminToken(req);
      if (!admin) return res.status(401).json({ error: 'Unauthorized' });

      const status = url.searchParams.get('status');
      const dateFilter = url.searchParams.get('dateFilter');
      const search = url.searchParams.get('search');

      let query = db.from('ops_work_orders').select('*').order('created_at', { ascending: false });

      if (status && status !== 'all') {
        query = query.eq('status', status);
      }

      if (dateFilter && dateFilter !== 'all') {
        const now = new Date();
        let startDate = new Date();
        switch (dateFilter) {
          case 'today': startDate.setHours(0, 0, 0, 0); break;
          case 'week': startDate.setDate(now.getDate() - 7); break;
          case 'month': startDate.setMonth(now.getMonth() - 1); break;
          case '3months': startDate.setMonth(now.getMonth() - 3); break;
        }
        query = query.gte('created_at', startDate.toISOString());
      }

      const { data, error } = await query;
      if (error) throw error;

      let filteredData = data || [];
      if (search && search.trim()) {
        const searchLower = search.toLowerCase().trim();
        filteredData = filteredData.filter(wo =>
          wo.wo_number?.toLowerCase().includes(searchLower) ||
          wo.product_name?.toLowerCase().includes(searchLower) ||
          wo.product_id?.toLowerCase().includes(searchLower)
        );
      }

      return res.json(filteredData);
    }

    // POST /api/admin/operations/work-orders - Create new work order
    if (path === '/api/admin/operations/work-orders' && req.method === 'POST') {
      const admin = await verifyAdminToken(req);
      if (!admin) return res.status(401).json({ error: 'Unauthorized' });

      const body = req.body || {};

      if (!body.sizeCategory) {
        return res.status(400).json({ message: 'Size category is required' });
      }
      if (!body.quantity || body.quantity < 1) {
        return res.status(400).json({ message: 'Quantity must be at least 1' });
      }

      const woNumber = await generateWONumber();

      const { data, error } = await db.from('ops_work_orders').insert({
        wo_number: woNumber,
        product_type: body.productType || 'standard',
        product_name: body.productName,
        product_id: body.productId,
        airtable_product_id: body.airtableProductId,
        size_category: body.sizeCategory,
        size_category_name: body.sizeCategoryName,
        units_per_pallet: body.unitsPerPallet,
        estimated_pallet_weight: body.estimatedPalletWeight,
        quantity: parseInt(body.quantity),
        quantity_type: body.quantityType || 'pallet',
        ingredient_ratios: body.ingredientRatios,
        ingredients_list: body.ingredientsList,
        mixing_guidelines: body.mixingGuidelines,
        total_weight_lbs: body.totalWeightLbs ? parseFloat(body.totalWeightLbs) : null,
        custom_notes: body.customNotes,
        needs_transportation: body.needsTransportation || false,
        destination_address: body.destinationAddress,
        destination_city: body.destinationCity,
        destination_state: body.destinationState,
        destination_zip: body.destinationZip,
        preferred_delivery_date: body.preferredDeliveryDate || null,
        preferred_delivery_time: body.preferredDeliveryTime,
        linked_bol_id: body.linkedBolId || null,
        work_order_notes: body.workOrderNotes || null,
        status: 'pending',
        priority: body.priority || 'normal',
        created_by: admin.email || 'admin@ssw.com',
      }).select().single();

      if (error) throw error;
      return res.status(201).json(data);
    }

    // GET /api/admin/operations/work-orders/:id/pdf - Generate PDF (HTML for browser print)
    // Query params: type=guide|label|both (default: both), print=true|false (default: true)
    const woPdfMatch = path.match(/^\/api\/admin\/operations\/work-orders\/(\d+)\/pdf$/);
    if (woPdfMatch && req.method === 'GET') {
      const tokenFromQuery = url.searchParams.get('token');
      const tokenFromHeader = req.headers.authorization?.replace('Bearer ', '');
      const token = tokenFromQuery || tokenFromHeader;
      const pdfType = url.searchParams.get('type') || 'guide'; // 'guide', 'label', or 'both' - default to guide only
      const printParam = url.searchParams.get('print');
      const autoPrint = printParam === 'true'; // Only auto-print if explicitly set to 'true'

      if (!token) return res.status(401).json({ error: 'Unauthorized' });

      const admin = await verifyAdminTokenValue(token);
      if (!admin) {
        return res.status(401).json({ error: 'Invalid token' });
      }

      const woId = woPdfMatch[1];
      const { data: wo, error } = await db.from('ops_work_orders').select('*').eq('id', woId).single();

      if (error || !wo) return res.status(404).json({ error: 'Work order not found' });

      // Fetch size category image from cache
      let sizeCategoryImageUrl = null;
      if (wo.size_category) {
        const { data: sizeCategory } = await db.from('ops_size_categories_cache')
          .select('illustration_url')
          .eq('code', wo.size_category)
          .single();
        sizeCategoryImageUrl = sizeCategory?.illustration_url || null;
      }

      // Fetch product illustration and convert to base64 for PDF embedding
      let productIllustrationBase64 = null;
      if (wo.product_id) {
        const { data: product } = await db.from('ops_products_cache')
          .select('illustration_url')
          .eq('product_id', wo.product_id)
          .single();

        if (product?.illustration_url) {
          try {
            // Always use production domain for images (avoid self-referencing issues with VERCEL_URL)
            const baseUrl = 'https://www.organicsoilwholesale.com';
            const imageUrl = `${baseUrl}${product.illustration_url}`;
            console.log('Fetching product illustration from:', imageUrl);

            const imageResponse = await fetch(imageUrl);
            if (imageResponse.ok) {
              const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
              const ext = product.illustration_url.split('.').pop() || 'webp';
              const mimeType = ext === 'webp' ? 'image/webp' : ext === 'png' ? 'image/png' : 'image/jpeg';
              productIllustrationBase64 = `data:${mimeType};base64,${imageBuffer.toString('base64')}`;
            } else {
              console.warn('Failed to fetch product illustration:', imageResponse.status);
            }
          } catch (imgError) {
            console.warn('Could not fetch product illustration:', imgError);
          }
        }
      }

      const formatDate = (dateStr) => new Date(dateStr).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
      const today = formatDate(new Date().toISOString());
      const createdDate = wo.created_at ? formatDate(wo.created_at) : today;

      // Auto-print script
      const printScript = autoPrint ? `<script>window.onload = function() { setTimeout(function() { window.print(); }, 500); }</script>` : '';

      // Production Guide Page
      const guidePage = `
<div class="page">
  <div class="header">
    <div><div class="company-name">Soil Seed & Water</div><div class="tagline">Regenerative Soil Solutions</div></div>
    <div style="text-align:right"><div class="wo-number">${wo.wo_number}</div><div class="doc-date">${createdDate}</div><div style="margin-top:8px"><span class="status-badge status-${wo.status}">${wo.status.replace("_", " ")}</span></div></div>
  </div>
  <div class="section"><div class="section-title">Product Information</div>
    <div class="product-header" style="display: flex; gap: 16px; align-items: flex-start;">
      ${productIllustrationBase64 ? `<div class="product-image" style="width: 100px; height: 100px; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden; flex-shrink: 0; display: flex; align-items: center; justify-content: center; background: #f9f9f9;"><img src="${productIllustrationBase64}" alt="${wo.product_name}" style="max-width: 100%; max-height: 100%; object-fit: contain;" /></div>` : ""}
      <div style="flex: 1;">
        <div class="product-name">${wo.product_name || "Custom Product"}</div>
        <div class="info-grid">
          ${wo.product_id ? `<span class="info-label">Product ID:</span><span class="info-value">${wo.product_id}</span>` : ""}
          <span class="info-label">Work Order:</span><span class="info-value">${wo.wo_number}</span>
          ${wo.order_type ? `<span class="info-label">Order Type:</span><span class="info-value" style="text-transform:capitalize">${wo.order_type}</span>` : ""}
          <span class="info-label">Created:</span><span class="info-value">${createdDate}</span>
          <span class="info-label">Priority:</span><span class="info-value" style="text-transform:capitalize">${wo.priority || "Normal"}</span>
          ${wo.created_by ? `<span class="info-label">Created By:</span><span class="info-value">${wo.created_by}</span>` : ""}
        </div>
      </div>
    </div>
  </div>
  <div class="section"><div class="section-title">Size & Quantity</div>
    <div class="size-quantity-container">
      ${sizeCategoryImageUrl ? `<div class="size-image-container"><img src="${sizeCategoryImageUrl}" alt="${wo.size_category_name || wo.size_category}" class="size-category-image" loading="lazy" /></div>` : ""}
      <div class="highlight-box" style="${sizeCategoryImageUrl ? 'flex:1' : ''}">
        <div class="highlight-row"><span class="highlight-label">Size Category</span><span class="highlight-value">${wo.size_category_name || wo.size_category}</span></div>
        <div class="highlight-row"><span class="highlight-label">Quantity</span><span class="highlight-value">${wo.quantity} ${wo.quantity_type === "pallet" ? "Pallet" : "Unit"}${wo.quantity > 1 ? "s" : ""}</span></div>
        ${wo.units_per_pallet ? `<div class="highlight-row"><span class="highlight-label">Units per Pallet</span><span class="highlight-value">${wo.units_per_pallet}</span></div>` : ""}
        ${wo.total_weight_lbs ? `<div class="highlight-row"><span class="highlight-label">Total Estimated Weight</span><span class="highlight-value">${wo.total_weight_lbs.toLocaleString()} lbs</span></div>` : ""}
      </div>
    </div>
  </div>
  ${wo.ingredient_ratios || wo.ingredients_list ? `<div class="section"><div class="section-title">Ingredients</div>
    <div class="info-grid" style="padding:0 8px">
      ${wo.ingredient_ratios ? `<span class="info-label">Ingredient Ratios:</span><span class="info-value">${wo.ingredient_ratios}</span>` : ""}
      ${wo.ingredients_list ? `<span class="info-label">Ingredients:</span><span class="info-value">${wo.ingredients_list}</span>` : ""}
    </div></div>` : ""}
  ${wo.mixing_guidelines ? `<div class="section"><div class="section-title">Mixing Guidelines</div><div class="mixing-box">${wo.mixing_guidelines}</div></div>` : ""}
  ${wo.custom_notes ? `<div class="section"><div class="section-title">Notes</div><div style="background:#fff9e6;border:1px solid #f0e0a0;border-radius:8px;padding:12px 16px">${wo.custom_notes}</div></div>` : ""}
  ${wo.needs_transportation ? `<div class="section"><div class="section-title">Delivery Information</div>
    <div class="info-grid" style="padding:0 8px">
      <span class="info-label">Destination:</span><span class="info-value">${wo.destination_address || ""}${wo.destination_city ? `, ${wo.destination_city}` : ""}${wo.destination_state ? `, ${wo.destination_state}` : ""} ${wo.destination_zip || ""}</span>
      ${wo.preferred_delivery_date ? `<span class="info-label">Preferred Date:</span><span class="info-value">${formatDate(wo.preferred_delivery_date)}</span>` : ""}
    </div></div>` : ""}
  <div class="footer">Soil Seed & Water | 18980 Stanton Rd, Congress, AZ 85332 | (928) 632-7125 | info@soilseedandwater.com</div>
</div>`;

      // Pallet Label Page
      const labelPage = `
<div class="page label-page">
  <div class="pallet-label">
    <div style="font-family:'Cormorant Garamond',serif;font-size:20pt;color:#264027">Soil Seed & Water</div>
    <div class="label-wo">${wo.wo_number}</div>
    <div class="label-product">${wo.product_name || "Custom Product"}</div>
    ${sizeCategoryImageUrl ? `<div class="label-image-container"><img src="${sizeCategoryImageUrl}" alt="${wo.size_category_name || wo.size_category}" class="label-size-image" loading="lazy" /></div>` : ""}
    <div class="label-info"><strong>${wo.size_category_name || wo.size_category}</strong></div>
    ${wo.units_per_pallet ? `<div class="label-info">${wo.units_per_pallet} units per pallet</div>` : ""}
    <div style="font-size:14pt;color:#666;margin-top:24px">Date Produced: _______________</div>
    <div class="label-pallet-number">Pallet ___ of ${wo.quantity}</div>
    <div style="margin-top:32px;padding-top:16px;border-top:2px solid #264027;font-size:10pt;color:#666">SSW BioSoils | Regenerative Soil Solutions | OMRI Listed</div>
  </div>
</div>`;

      // Determine which pages to include
      // Accept both 'guide' and 'workorder' for the production guide
      let pages = '';
      let title = wo.wo_number;
      if (pdfType === 'guide' || pdfType === 'workorder') {
        pages = guidePage;
        title = `${wo.wo_number} - Production Guide`;
      } else if (pdfType === 'label') {
        pages = labelPage;
        title = `${wo.wo_number} - Pallet Label`;
      } else if (pdfType === 'both') {
        pages = guidePage + labelPage;
        title = `${wo.wo_number} - Production Guide & Label`;
      } else {
        // Default to guide only
        pages = guidePage;
        title = `${wo.wo_number} - Production Guide`;
      }

      const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>${title}</title>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;600;700&family=Montserrat:wght@400;600;700&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<style>
@page { size: letter; margin: 0.5in; }
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: 'Inter', Arial, sans-serif; font-size: 11pt; line-height: 1.5; color: #1a1a1a; background: white; }
.page { width: 7.5in; min-height: 10in; padding: 0.5in; margin: 0 auto; background: white; page-break-after: always; position: relative; }
.page:last-child { page-break-after: auto; }
.header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 3px solid #264027; flex-wrap: nowrap; }
.company-name { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 22pt; font-weight: 600; color: #264027; white-space: nowrap; }
.tagline { font-family: 'Montserrat', Arial, sans-serif; font-size: 9pt; font-weight: 500; color: #6f732f; letter-spacing: 1px; text-transform: uppercase; }
.wo-number { font-family: 'Montserrat', Arial, sans-serif; font-size: 22pt; font-weight: 700; color: #264027; white-space: nowrap; }
.doc-date { font-size: 11pt; color: #666; margin-top: 4px; }
.section { margin-bottom: 20px; }
.section-title { font-family: 'Montserrat', Arial, sans-serif; font-size: 12pt; font-weight: 600; color: #264027; background: #f5f7f5; padding: 8px 12px; border-left: 4px solid #264027; margin-bottom: 12px; text-transform: uppercase; }
.product-name { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 22pt; font-weight: 600; margin-bottom: 12px; color: #1a1a1a; }
.info-grid { display: grid; grid-template-columns: 140px 1fr; gap: 6px 16px; }
.info-label { font-weight: 600; color: #555; font-size: 10pt; }
.info-value { color: #1a1a1a; font-size: 10pt; }
.size-quantity-container { display: flex; gap: 20px; align-items: flex-start; margin: 16px 0; }
.size-image-container { width: 160px; flex-shrink: 0; }
.size-category-image { width: 100%; height: auto; max-height: 160px; object-fit: contain; border-radius: 8px; border: 1px solid #ddd; background: #f9f9f9; }
.highlight-box { background: #e8f5e9; border: 2px solid #264027; border-radius: 8px; padding: 16px 20px; }
.highlight-row { display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid rgba(38,64,39,0.2); }
.highlight-row:last-child { border-bottom: none; }
.highlight-label { font-family: 'Montserrat', Arial, sans-serif; font-weight: 600; color: #264027; }
.highlight-value { font-family: 'Montserrat', Arial, sans-serif; font-weight: 700; font-size: 14pt; color: #264027; }
.mixing-box { background: #fafafa; border: 1px solid #ddd; border-radius: 8px; padding: 16px; white-space: pre-wrap; font-size: 11pt; line-height: 1.6; }
.status-badge { display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 10pt; font-weight: 600; text-transform: uppercase; }
.status-pending { background: #fff3cd; color: #856404; }
.status-scheduled { background: #cce5ff; color: #004085; }
.status-in_progress { background: #d4edda; color: #155724; }
.status-completed { background: #264027; color: white; }
.footer { position: absolute; bottom: 0.25in; left: 0.5in; right: 0.5in; padding-top: 12px; border-top: 1px solid #ddd; font-size: 8pt; color: #999; text-align: center; }
.label-page { display: flex; flex-direction: column; justify-content: center; align-items: center; padding: 0.5in; }
.pallet-label { width: 100%; border: 4px solid #264027; border-radius: 12px; padding: 40px; text-align: center; background: white; }
.label-wo { font-family: 'Montserrat', Arial, sans-serif; font-size: 48pt; font-weight: 700; color: #264027; margin: 16px 0; }
.label-product { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 28pt; font-weight: 600; margin: 24px 0; color: #1a1a1a; }
.label-info { font-size: 16pt; margin: 12px 0; color: #1a1a1a; }
.label-pallet-number { font-family: 'Montserrat', Arial, sans-serif; font-size: 24pt; font-weight: 600; color: #264027; margin-top: 20px; }
.label-image-container { margin: 16px 0; }
.label-size-image { max-width: 200px; max-height: 150px; object-fit: contain; border-radius: 8px; }
@media print { body { background: white; } .page { margin: 0; width: 100%; } }
@media screen {
  body { background: #f5f5f5; padding: 10px; margin: 0; }
  .page {
    width: 7.5in;
    max-width: 7.5in;
    min-height: auto;
    padding: 0.4in;
    margin: 0 auto 16px auto;
    box-shadow: 0 1px 4px rgba(0,0,0,0.1);
    box-sizing: border-box;
    transform-origin: top left;
    transform: scale(0.85);
  }
}
</style>
${printScript}
</head><body>
${pages}
</body></html>`;

      res.setHeader('Content-Type', 'text/html');
      return res.send(html);
    }

    // GET /api/admin/operations/work-orders/:id - Get single work order
    const woDetailMatch = path.match(/^\/api\/admin\/operations\/work-orders\/(\d+)$/);
    if (woDetailMatch && req.method === 'GET') {
      const admin = await verifyAdminToken(req);
      if (!admin) return res.status(401).json({ error: 'Unauthorized' });

      const woId = woDetailMatch[1];
      const { data, error } = await db.from('ops_work_orders').select('*').eq('id', woId).single();

      if (error) {
        if (error.code === 'PGRST116') return res.status(404).json({ error: 'Work order not found' });
        throw error;
      }
      return res.json(data);
    }

    // PATCH /api/admin/operations/work-orders/:id - Update work order
    if (woDetailMatch && req.method === 'PATCH') {
      const admin = await verifyAdminToken(req);
      if (!admin) return res.status(401).json({ error: 'Unauthorized' });

      const woId = woDetailMatch[1];
      const updates = req.body || {};

      const fieldMap = {
        productType: 'product_type', productName: 'product_name', productId: 'product_id',
        airtableProductId: 'airtable_product_id', sizeCategory: 'size_category', sizeCategoryName: 'size_category_name',
        unitsPerPallet: 'units_per_pallet', estimatedPalletWeight: 'estimated_pallet_weight', quantityType: 'quantity_type',
        ingredientRatios: 'ingredient_ratios', ingredientsList: 'ingredients_list', mixingGuidelines: 'mixing_guidelines',
        totalWeightLbs: 'total_weight_lbs', customNotes: 'custom_notes', needsTransportation: 'needs_transportation',
        destinationAddress: 'destination_address', destinationCity: 'destination_city', destinationState: 'destination_state',
        destinationZip: 'destination_zip', preferredDeliveryDate: 'preferred_delivery_date', preferredDeliveryTime: 'preferred_delivery_time',
        linkedBolId: 'linked_bol_id',
      };

      const snakeCaseUpdates = {};
      for (const [key, value] of Object.entries(updates)) {
        const snakeKey = fieldMap[key] || key;
        snakeCaseUpdates[snakeKey] = value;
      }
      snakeCaseUpdates.updated_at = new Date().toISOString();

      const { data, error } = await db.from('ops_work_orders').update(snakeCaseUpdates).eq('id', woId).select().single();

      if (error) {
        if (error.code === 'PGRST116') return res.status(404).json({ error: 'Work order not found' });
        throw error;
      }
      return res.json(data);
    }

    // ============ OPERATIONS TASK BOARD ENDPOINTS ============

    // GET /api/admin/operations/tasks/projects - List all projects
    if (path === '/api/admin/operations/tasks/projects' && req.method === 'GET') {
      const admin = await verifyAdminToken(req);
      if (!admin) return res.status(401).json({ error: 'Unauthorized' });

      const { data, error } = await db.from('ops_projects').select('*').order('name');
      if (error) throw error;
      return res.json(data || []);
    }

    // POST /api/admin/operations/tasks/projects - Create a project
    if (path === '/api/admin/operations/tasks/projects' && req.method === 'POST') {
      const admin = await verifyAdminToken(req);
      if (!admin) return res.status(401).json({ error: 'Unauthorized' });

      const { name, color } = req.body || {};
      if (!name) return res.status(400).json({ message: 'Name is required' });

      const { data, error } = await db.from('ops_projects').insert({ name, color: color || 'gray' }).select().single();
      if (error) throw error;
      return res.status(201).json(data);
    }

    // PATCH /api/admin/operations/tasks/projects/:id - Update a project
    const projectPatchMatch = path.match(/^\/api\/admin\/operations\/tasks\/projects\/([^/]+)$/);
    if (projectPatchMatch && req.method === 'PATCH') {
      const admin = await verifyAdminToken(req);
      if (!admin) return res.status(401).json({ error: 'Unauthorized' });

      const projectId = projectPatchMatch[1];
      const { name, color } = req.body || {};

      const { data: existing } = await db.from('ops_projects').select('name').eq('id', projectId).single();

      const updates = {};
      if (name) updates.name = name;
      if (color) updates.color = color;

      const { data, error } = await db.from('ops_projects').update(updates).eq('id', projectId).select().single();
      if (error) throw error;

      if (name && existing && existing.name !== name) {
        await db.from('ops_tasks').update({ project: name, updated_at: new Date().toISOString() }).eq('project', existing.name);
      }

      return res.json(data);
    }

    // DELETE /api/admin/operations/tasks/projects/:id - Delete a project
    const projectDeleteMatch = path.match(/^\/api\/admin\/operations\/tasks\/projects\/([^/]+)$/);
    if (projectDeleteMatch && req.method === 'DELETE') {
      const admin = await verifyAdminToken(req);
      if (!admin) return res.status(401).json({ error: 'Unauthorized' });

      const projectId = projectDeleteMatch[1];

      const { data: existing } = await db.from('ops_projects').select('name').eq('id', projectId).single();
      if (existing) {
        await db.from('ops_tasks').update({ project: null, updated_at: new Date().toISOString() }).eq('project', existing.name);
      }

      const { error } = await db.from('ops_projects').delete().eq('id', projectId);
      if (error) throw error;
      return res.json({ success: true });
    }

    // GET /api/admin/operations/tasks - List all tasks
    if (path === '/api/admin/operations/tasks' && req.method === 'GET') {
      const admin = await verifyAdminToken(req);
      if (!admin) return res.status(401).json({ error: 'Unauthorized' });

      const assignee = url.searchParams.get('assignee');
      const project = url.searchParams.get('project');
      const status = url.searchParams.get('status');

      let query = db.from('ops_tasks').select('*').order('position', { ascending: true }).order('created_at', { ascending: false });
      if (assignee) query = query.eq('assignee', assignee);
      if (project) query = query.eq('project', project);
      if (status) query = query.eq('status', status);

      const { data, error } = await query;
      if (error) throw error;
      return res.json(data || []);
    }

    // POST /api/admin/operations/tasks - Create a task
    if (path === '/api/admin/operations/tasks' && req.method === 'POST') {
      const admin = await verifyAdminToken(req);
      if (!admin) return res.status(401).json({ error: 'Unauthorized' });

      const { title, description, status, assignee, project, priority, due_date } = req.body || {};
      if (!title) return res.status(400).json({ message: 'Title is required' });

      const { data: maxPos } = await db.from('ops_tasks').select('position').eq('status', status || 'todo').order('position', { ascending: false }).limit(1);
      const nextPosition = (maxPos && maxPos.length > 0) ? maxPos[0].position + 1 : 0;

      const { data, error } = await db.from('ops_tasks').insert({
        title,
        description: description || null,
        status: status || 'todo',
        assignee: assignee || null,
        project: project || null,
        priority: priority || 'medium',
        due_date: due_date || null,
        position: nextPosition,
        created_by: admin.email || 'system',
      }).select().single();

      if (error) throw error;
      return res.status(201).json(data);
    }

    // PATCH /api/admin/operations/tasks/:id/move - Move a task
    const taskMoveMatch = path.match(/^\/api\/admin\/operations\/tasks\/([^/]+)\/move$/);
    if (taskMoveMatch && req.method === 'PATCH') {
      const admin = await verifyAdminToken(req);
      if (!admin) return res.status(401).json({ error: 'Unauthorized' });

      const taskId = taskMoveMatch[1];
      const { status, position } = req.body || {};

      const STATUSES = ['todo', 'in_progress', 'done'];
      if (!status || !STATUSES.includes(status)) {
        return res.status(400).json({ message: 'Valid status is required' });
      }

      const { data, error } = await db.from('ops_tasks').update({
        status,
        position: position ?? 0,
        updated_at: new Date().toISOString(),
      }).eq('id', taskId).select().single();

      if (error) throw error;
      return res.json(data);
    }

    // PATCH /api/admin/operations/tasks/:id - Update a task
    const taskPatchMatch = path.match(/^\/api\/admin\/operations\/tasks\/([^/]+)$/);
    if (taskPatchMatch && req.method === 'PATCH') {
      const admin = await verifyAdminToken(req);
      if (!admin) return res.status(401).json({ error: 'Unauthorized' });

      const taskId = taskPatchMatch[1];
      const updates = { updated_at: new Date().toISOString() };
      const allowedFields = ['title', 'description', 'status', 'assignee', 'project', 'priority', 'due_date', 'position'];
      for (const field of allowedFields) {
        if (req.body[field] !== undefined) updates[field] = req.body[field];
      }

      const { data, error } = await db.from('ops_tasks').update(updates).eq('id', taskId).select().single();
      if (error) throw error;
      return res.json(data);
    }

    // DELETE /api/admin/operations/tasks/:id - Delete a task
    const taskDeleteMatch = path.match(/^\/api\/admin\/operations\/tasks\/([^/]+)$/);
    if (taskDeleteMatch && req.method === 'DELETE') {
      const admin = await verifyAdminToken(req);
      if (!admin) return res.status(401).json({ error: 'Unauthorized' });

      const taskId = taskDeleteMatch[1];
      const { error } = await db.from('ops_tasks').delete().eq('id', taskId);
      if (error) throw error;
      return res.json({ success: true });
    }

    // ============ OPERATIONS SETTINGS ENDPOINTS ============

    // GET /api/admin/operations/settings/work-order-notifications
    if (path === '/api/admin/operations/settings/work-order-notifications' && req.method === 'GET') {
      const admin = await verifyAdminToken(req);
      if (!admin) return res.status(401).json({ error: 'Unauthorized' });

      const { data, error } = await db.from('ops_work_order_notification_recipients').select('*').order('created_at', { ascending: true });
      if (error) throw error;
      return res.json(data || []);
    }

    // POST /api/admin/operations/settings/work-order-notifications
    if (path === '/api/admin/operations/settings/work-order-notifications' && req.method === 'POST') {
      const admin = await verifyAdminToken(req);
      if (!admin) return res.status(401).json({ error: 'Unauthorized' });

      const { name, email, phone, notify_by_email, notify_by_phone } = req.body || {};
      if (!name || !name.trim()) return res.status(400).json({ message: 'Name is required' });
      if (!email || !email.trim()) return res.status(400).json({ message: 'Email is required' });

      const hasPhone = phone != null && String(phone).trim() !== '';
      const { data, error } = await db.from('ops_work_order_notification_recipients').insert({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        phone: hasPhone ? String(phone).trim() : null,
        notify_by_email: notify_by_email !== false,
        notify_by_phone: hasPhone && notify_by_phone === true,
      }).select().single();
      if (error) throw error;
      return res.status(201).json(data);
    }

    // PATCH /api/admin/operations/settings/work-order-notifications/:id
    const notifPatchMatch = path.match(/^\/api\/admin\/operations\/settings\/work-order-notifications\/(\d+)$/);
    if (notifPatchMatch && req.method === 'PATCH') {
      const admin = await verifyAdminToken(req);
      if (!admin) return res.status(401).json({ error: 'Unauthorized' });

      const nId = parseInt(notifPatchMatch[1], 10);
      const { name, email, phone, notify_by_email, notify_by_phone } = req.body || {};
      const updates = {};
      if (name !== undefined) updates.name = name.trim();
      if (email !== undefined) updates.email = email.trim().toLowerCase();
      if (phone !== undefined) updates.phone = phone != null && String(phone).trim() !== '' ? String(phone).trim() : null;
      if (typeof notify_by_email === 'boolean') updates.notify_by_email = notify_by_email;
      if (typeof notify_by_phone === 'boolean') updates.notify_by_phone = notify_by_phone;

      const { data, error } = await db.from('ops_work_order_notification_recipients').update(updates).eq('id', nId).select().single();
      if (error) throw error;
      return res.json(data);
    }

    // DELETE /api/admin/operations/settings/work-order-notifications/:id
    const notifDeleteMatch = path.match(/^\/api\/admin\/operations\/settings\/work-order-notifications\/(\d+)$/);
    if (notifDeleteMatch && req.method === 'DELETE') {
      const admin = await verifyAdminToken(req);
      if (!admin) return res.status(401).json({ error: 'Unauthorized' });

      const nId = parseInt(notifDeleteMatch[1], 10);
      const { error } = await db.from('ops_work_order_notification_recipients').delete().eq('id', nId);
      if (error) throw error;
      return res.json({ success: true });
    }

    // ============ SCHEDULED LOADS (Logistics Calendar) ENDPOINTS ============

    // GET /api/admin/operations/scheduled-loads
    if (path === '/api/admin/operations/scheduled-loads' && req.method === 'GET') {
      const admin = await verifyAdminToken(req);
      if (!admin) return res.status(401).json({ error: 'Unauthorized' });

      const weekStart = url.searchParams.get('weekStart');
      const weekEnd = url.searchParams.get('weekEnd');

      let query = db.from('scheduled_loads').select('*').order('date', { ascending: true });
      if (weekStart) query = query.gte('date', weekStart);
      if (weekEnd) query = query.lte('date', weekEnd);

      const { data, error } = await query;
      if (error) throw error;
      return res.json(data || []);
    }

    // POST /api/admin/operations/scheduled-loads
    if (path === '/api/admin/operations/scheduled-loads' && req.method === 'POST') {
      const admin = await verifyAdminToken(req);
      if (!admin) return res.status(401).json({ error: 'Unauthorized' });

      const { date, timeSlot, routeType, customer, destination, material, quantity, driver, carrierName, truckNumber, status, deal, contactName, contactPhone, notes } = req.body || {};
      if (!date || !routeType || !customer || !destination || !material) {
        return res.status(400).json({ message: 'Missing required fields' });
      }

      const { data, error } = await db.from('scheduled_loads').insert({
        date, time_slot: timeSlot, route_type: routeType, customer, destination, material, quantity, driver,
        carrier_name: carrierName, truck_number: truckNumber, status: status || 'scheduled',
        deal, contact_name: contactName, contact_phone: contactPhone, notes,
        created_by: admin.email || 'admin@ssw.com',
      }).select().single();
      if (error) throw error;
      return res.status(201).json(data);
    }

    // GET /api/admin/operations/scheduled-loads/:id
    const loadDetailMatch = path.match(/^\/api\/admin\/operations\/scheduled-loads\/(\d+)$/);
    if (loadDetailMatch && req.method === 'GET') {
      const admin = await verifyAdminToken(req);
      if (!admin) return res.status(401).json({ error: 'Unauthorized' });

      const { data, error } = await db.from('scheduled_loads').select('*').eq('id', loadDetailMatch[1]).single();
      if (error) throw error;
      if (!data) return res.status(404).json({ message: 'Scheduled load not found' });
      return res.json(data);
    }

    // PATCH /api/admin/operations/scheduled-loads/:id
    if (loadDetailMatch && req.method === 'PATCH') {
      const admin = await verifyAdminToken(req);
      if (!admin) return res.status(401).json({ error: 'Unauthorized' });

      const fieldMap = { date: 'date', timeSlot: 'time_slot', routeType: 'route_type', customer: 'customer', destination: 'destination', material: 'material', quantity: 'quantity', driver: 'driver', carrierName: 'carrier_name', truckNumber: 'truck_number', status: 'status', deal: 'deal', contactName: 'contact_name', contactPhone: 'contact_phone', notes: 'notes' };
      const updates = { updated_at: new Date().toISOString() };
      for (const [key, value] of Object.entries(req.body || {})) {
        if (fieldMap[key]) updates[fieldMap[key]] = value;
      }

      const { data, error } = await db.from('scheduled_loads').update(updates).eq('id', loadDetailMatch[1]).select().single();
      if (error) throw error;
      return res.json(data);
    }

    // DELETE /api/admin/operations/scheduled-loads/:id
    if (loadDetailMatch && req.method === 'DELETE') {
      const admin = await verifyAdminToken(req);
      if (!admin) return res.status(401).json({ error: 'Unauthorized' });

      const { error } = await db.from('scheduled_loads').delete().eq('id', loadDetailMatch[1]);
      if (error) throw error;
      return res.json({ success: true });
    }

    // POST /api/admin/operations/scheduled-loads/bulk-delete
    if (path === '/api/admin/operations/scheduled-loads/bulk-delete' && req.method === 'POST') {
      const admin = await verifyAdminToken(req);
      if (!admin) return res.status(401).json({ error: 'Unauthorized' });

      const { ids } = req.body || {};
      if (!ids || !Array.isArray(ids) || ids.length === 0) return res.status(400).json({ message: 'No IDs provided' });

      const { error } = await db.from('scheduled_loads').delete().in('id', ids);
      if (error) throw error;
      return res.json({ success: true, deleted: ids.length });
    }

    // ============ NEWSLETTER SUBSCRIBE / UNSUBSCRIBE ENDPOINTS ============

    // The QR embedded in a private coupon contains only an opaque UUID. It never
    // exposes customer information and can only be redeemed by an authenticated yard rep.
    const wormQrMatch = path.match(/^\/api\/public\/worm-castings\/qr\/([0-9a-f-]{36})\.(svg|png)$/i);
    if (wormQrMatch && req.method === 'GET') {
      const db = await getSupabase();
      const { data: redemption, error } = await db
        .from('sp_worm_castings_redemptions')
        .select('id')
        .eq('campaign_key', WORM_CASTINGS_CAMPAIGN_KEY)
        .eq('redemption_token', wormQrMatch[1])
        .maybeSingle();
      if (error || !redemption) return res.status(404).send('Not found');
      if (wormQrMatch[2].toLowerCase() === 'png') {
        const png = await QRCode.toBuffer(wormQrMatch[1], { type: 'png', errorCorrectionLevel: 'M', margin: 2, width: 600 });
        res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400');
        res.setHeader('Content-Type', 'image/png');
        return res.status(200).send(png);
      }
      const svg = await QRCode.toString(wormQrMatch[1], { type: 'svg', errorCorrectionLevel: 'M', margin: 2, width: 360 });
      res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400');
      res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
      return res.status(200).send(svg);
    }

    const surveyQrMatch = path.match(/^\/api\/public\/survey-coupon\/qr\/(SSW30-[A-HJ-NP-Z2-9]{8})\.(svg|png)$/i);
    if (surveyQrMatch && req.method === 'GET') {
      const { buildSurveyCouponQr, sendSurveyCouponQr } = await import('../shared/surveyCouponQr.js');
      const db = await getSupabase();
      const result = await buildSurveyCouponQr({
        db,
        fileName: `${surveyQrMatch[1]}.${surveyQrMatch[2]}`,
      });
      return sendSurveyCouponQr(res, result);
    }

    // Newsletter contacts SoT: Supabase sp_customers (Airtable email base retired)

    // GET /api/admin/surveys - one-table inbox grouped by survey_kind.
    if (path === '/api/admin/surveys' && req.method === 'GET') {
      const admin = await verifyAdminToken(req);
      if (!admin) return res.status(401).json({ error: 'Unauthorized' });
      try {
        const { listSurveyInbox } = await import('../shared/surveyResponses.js');
        const inbox = await listSurveyInbox(db, {
          kind: url.searchParams.get('kind') || 'all',
          limit: url.searchParams.get('limit'),
        });
        return res.json(inbox);
      } catch (error) {
        console.error('[Admin surveys]', error?.message || error);
        return res.status(500).json({ error: 'Could not load surveys.' });
      }
    }

    // POST /api/survey and /api/survey/submit - CSAT / yard / class feedback.
    // Also accept /api/public/survey and /api/surveys (those 404'd in prod).
    // One table: sp_survey_responses. Never writes newsletter_subscribed.
    // After a successful save, ping staff internally. Never email the customer here.
    if (isSurveySubmitPostPath(path) && req.method === 'POST') {
      try {
        const result = await processSurveySubmission({
          db: await getSupabase(),
          body: req.body || {},
          userAgent: String(req.headers['user-agent'] || ''),
          resend: process.env.RESEND_API_KEY ? await getResend() : null,
        });
        return res.status(result.status).json(result.json);
      } catch (error) {
        console.error('[Survey] Error:', error?.message || error);
        return res.status(500).json({ error: 'We could not save your answers. Please try again.' });
      }
    }

    // POST /api/giveaway/enter — Phoenix Fall Garden Giveaway (/win).
    // Open by default. Set GIVEAWAY_ENTRIES_OPEN=false to pause. Never emails
    // the customer from this path. Staff receive one Lead Report per 30 valid
    // entries when GIVEAWAY_LEAD_REPORTS_ACTIVE=true; individual alerts are off.
    if (path === '/api/giveaway/enter' && req.method === 'POST') {
      try {
        const { processGiveawayEntry } = await import('../shared/giveawayEntries.js');
        const giveawayDb = await getSupabase();
        const result = await processGiveawayEntry({
          db: giveawayDb,
          body: req.body || {},
          userAgent: String(req.headers['user-agent'] || ''),
        });
        const {
          giveawayLeadReportsEnabled,
          maybeSendGiveawayLeadReports,
          shouldEvaluateGiveawayLeadReport,
          getGiveawayLeadReportRecipients,
        } = await import('../shared/giveawayNotifications.js');
        if (shouldEvaluateGiveawayLeadReport(result) && giveawayLeadReportsEnabled()) {
          try {
            const reportResult = await maybeSendGiveawayLeadReports({
              db: giveawayDb,
              resend: await getResend(),
              recipients: getGiveawayLeadReportRecipients(),
            });
            console.info('[Giveaway] Lead Report check:', {
              count: reportResult.count,
              completedBatches: reportResult.completedBatches,
              processed: reportResult.results.filter((item) => !item.skipped).length,
            });
          } catch (notificationError) {
            console.error('[Giveaway] Lead Report error:', notificationError?.message || notificationError);
          }
        }
        return res.status(result.status).json(result.json);
      } catch (error) {
        console.error('[Giveaway] Error:', error?.message || error);
        return res.status(500).json({ error: 'We could not save your entry. Please try again.' });
      }
    }

    // POST /api/workshops/fall-garden/register — persist the class roster first,
    // then send the class staff alert. Marketing subscribe never sends a second staff email.
    if (path === '/api/workshops/fall-garden/register' && req.method === 'POST') {
      try {
        const { subscribeNewsletterContact } = await import('../shared/newsletterEngagement.js');
        const { submitGardenClassRegistration } = await import('../shared/workshopRegistrations.js');
        const result = await submitGardenClassRegistration({
          db: await getSupabase(),
          input: req.body || {},
          subscribeNewsletterContact,
          resend: process.env.RESEND_API_KEY ? await getResend() : null,
        });
        if (!result.ok) return res.status(result.status || 400).json({ error: result.error });
        if (result.bot) return res.json({ success: true });
        return res.status(result.created ? 201 : 200).json({
          success: true,
          registrationId: result.registration.id,
          alreadyRegistered: !result.created,
          marketingStatus: result.marketingSyncStatus,
          notificationStatus: result.notificationStatus,
          message: result.created ? 'Your workshop spot is saved.' : 'Your workshop RSVP is already saved.',
        });
      } catch (error) {
        console.error('[Workshop RSVP] Error:', error?.message || error);
        return res.status(500).json({ error: 'We could not save your RSVP. Please try again.' });
      }
    }

    // POST /api/newsletter/subscribe - Explicit website newsletter opt-in
    if (path === '/api/newsletter/subscribe' && req.method === 'POST') {
      const { email, name, phone, customerCategory, consent, website, source, campaign } = req.body || {};
      const normalizedEmail = normalizeCampaignEmail(email);
      const normalizedName = String(name || '').trim();
      const normalizedPhone = String(phone || '').trim();
      const normalizedSource = normalizeCampaignSource(source || 'website_newsletter_signup').slice(0, 100);
      const { isGardenClassRegistrationSource } = await import('../shared/newsletterNotifications.js');

      // The public Garden Reset form currently posts here. Persist the class
      // roster before any staff email, and never also send "SSW signup".
      if (isGardenClassRegistrationSource(normalizedSource)) {
        if (website) return res.json({ success: true });
        try {
          const { subscribeNewsletterContact } = await import('../shared/newsletterEngagement.js');
          const { submitGardenClassRegistration } = await import('../shared/workshopRegistrations.js');
          const result = await submitGardenClassRegistration({
            db: await getSupabase(),
            input: {
              name: normalizedName,
              email: normalizedEmail,
              phone: normalizedPhone,
              customerCategory,
              source: normalizedSource,
              eventUpdatesConsent: true,
              marketingConsent: Boolean(consent),
              website,
            },
            subscribeNewsletterContact,
            resend: process.env.RESEND_API_KEY ? await getResend() : null,
          });
          if (!result.ok) return res.status(result.status || 400).json({ error: result.error });
          if (result.bot) return res.json({ success: true });
          return res.json({ success: true, message: "You're subscribed." });
        } catch (error) {
          console.error('[Workshop RSVP] Error:', error?.message || error);
          return res.status(500).json({ error: 'We could not save your RSVP. Please try again.' });
        }
      }

      const allowedCustomerCategories = new Set(['home-gardener', 'farmer', 'landscaper', 'nursery', 'contractor', 'municipal-commercial', 'other']);
      const campaignRequested = campaign === 'free-worm-castings-2026-08' || isWormCastingsCampaignSource(source);
      if (campaignRequested && !WORM_CASTINGS_PUBLIC_SIGNUP_OPEN) {
        return res.status(410).json({
          error: WORM_CASTINGS_CAMPAIGN_ENDED_MESSAGE,
          campaignEnded: true,
        });
      }
      let routing = null;
      let normalizedCustomerCategory = String(customerCategory || '').trim();

      // Honeypot fields are silently accepted so bots do not learn how to bypass them.
      if (website) return res.json({ success: true });
      if (!consent) return res.status(400).json({ error: 'Please confirm that you want to receive emails.' });
      if (!normalizedEmail || normalizedEmail.length > 254) {
        return res.status(400).json({ error: 'Please enter a valid email address.' });
      }
      if (campaignRequested && (normalizedName.length < 2 || normalizedName.length > 120)) {
        return res.status(400).json({ error: 'Please enter your full name.' });
      }
      if (normalizedPhone.replace(/\D/g, '').length < 10 || normalizedPhone.length > 30) {
        return res.status(400).json({ error: 'Please enter a valid phone number.' });
      }
      if (campaignRequested) {
        const validated = validateWormCastingsRouting(req.body || {});
        if (!validated.ok) return res.status(400).json({ error: validated.error });
        routing = validated.routing;
        normalizedCustomerCategory = routing.customerType;
      } else if (!allowedCustomerCategories.has(normalizedCustomerCategory)) {
        return res.status(400).json({ error: 'Please select the option that best describes you.' });
      }

      try {
        const db = await getSupabase();
        const { subscribeNewsletterContact } = await import('../shared/newsletterEngagement.js');
        const result = await subscribeNewsletterContact(db, {
          email: normalizedEmail,
          name: normalizedName,
          phone: normalizedPhone,
          customerCategory: normalizedCustomerCategory,
          source: normalizedSource,
          zipCode: routing?.zipCode,
        });

        if (result.status === 'opted_out') {
          return res.status(409).json({
            error: 'This address has a previous opt-out. Please contact us if you would like us to review it.',
          });
        }

        let couponDeliveryStatus = null;
        let customerNumber = null;
        if (campaignRequested) {
          const { data: customer, error: customerError } = await db
            .from('sp_customers')
            .select('id, full_name, email, delivery_zip, newsletter_notes, ssw_number, ssw_number_alias')
            .ilike('email', normalizedEmail)
            .maybeSingle();
          if (customerError || !customer) throw customerError || new Error('Campaign subscriber could not be found');
          const customerNumberAssigned = await ensureSswNumber(db, customer);
          customer.ssw_number = customerNumberAssigned;
          customerNumber = customerNumberAssigned;

          const routingColumns = routing ? routingRecordColumns(routing, normalizedSource) : {};
          let { data: redemption, error: redemptionError } = await db
            .from('sp_worm_castings_redemptions')
            .select('*')
            .eq('campaign_key', WORM_CASTINGS_CAMPAIGN_KEY)
            .eq('email_normalized', normalizedEmail)
            .maybeSingle();

          if (!redemption && !redemptionError) {
            const created = await db.from('sp_worm_castings_redemptions').insert({
              campaign_key: WORM_CASTINGS_CAMPAIGN_KEY,
              customer_id: customer.id,
              full_name: normalizedName || String(customer.full_name || '').trim() || normalizedEmail.split('@')[0],
              email: normalizedEmail,
              email_normalized: normalizedEmail,
              ...routingColumns,
            }).select().single();
            redemption = created.data;
            redemptionError = created.error;
          }
          if (redemptionError || !redemption) throw redemptionError || new Error('Could not create the private coupon');

          // The email owns one permanent coupon, but the latest valid form name
          // should replace stale import/test labels before that coupon is resent.
          if (redemption.full_name !== normalizedName || redemption.customer_id !== customer.id) {
            const updated = await db.from('sp_worm_castings_redemptions').update({
              customer_id: customer.id,
              full_name: normalizedName,
              updated_at: new Date().toISOString(),
            }).eq('id', redemption.id).select().single();
            if (updated.error || !updated.data) {
              throw updated.error || new Error('Could not update the private coupon owner');
            }
            redemption = updated.data;
          }

          if (routing) {
            await persistWormCastingsRouting({
              db,
              customer,
              redemptionId: redemption.id,
              routing,
              source: normalizedSource,
            });
          }

          // A repeat submission never creates a second coupon. It resends the
          // same private coupon, subject to a short anti-spam cooldown.
          if (['pending', 'failed'].includes(redemption.distribution_status)) {
            try {
              const delivery = await sendWormCastingsCoupon({ db, redemption, customerNumber });
              couponDeliveryStatus = delivery.status;
            } catch (couponError) {
              console.error('[Worm Castings] coupon delivery failed:', couponError?.message || couponError);
              couponDeliveryStatus = 'failed';
            }
          } else if (redemption.distribution_status === 'sent') {
            try {
              const delivery = await resendExistingWormCastingsCoupon({ db, redemption });
              couponDeliveryStatus = delivery.status;
            } catch (couponError) {
              console.error('[Worm Castings] existing coupon resend failed:', couponError?.message || couponError);
              couponDeliveryStatus = 'failed';
            }
          } else {
            couponDeliveryStatus = redemption.distribution_status;
          }
        }

        // Notification delivery is intentionally independent from the opt-in transaction.
        try {
          const r = await getResend();
          const { getNewsletterAdminRecipients, sendNewsletterAdminNotifications } = await import('../shared/newsletterNotifications.js');
          const recipients = getNewsletterAdminRecipients();
          const notificationResults = await sendNewsletterAdminNotifications({
            resend: r,
            recipients,
            subscriber: {
              email: normalizedEmail,
              name: normalizedName,
              phone: normalizedPhone,
              customerCategory: normalizedCustomerCategory,
              source: normalizedSource,
              subscribedAt: new Date().toISOString(),
              zipCode: routing?.zipCode,
              gardenStatus: routing?.gardenStatus,
              propertyProfile: routing?.propertyProfile,
              offer: routing?.offer,
              nextAction: routing?.nextAction,
              customerNumber,
            },
          });
          notificationResults.forEach((notificationResult, index) => {
            if (notificationResult.status === 'rejected') {
              console.error(`[Newsletter Subscribe] Admin notification to ${recipients[index]?.email} failed:`, notificationResult.reason?.message || notificationResult.reason);
            }
          });
        } catch (notificationError) {
          console.error('[Newsletter Subscribe] Admin notification error:', notificationError?.message || notificationError);
        }

        return res.json({
          success: true,
          campaign: campaignRequested ? WORM_CASTINGS_CAMPAIGN_KEY : null,
          couponDeliveryStatus,
          customerNumber,
          message: campaignRequested
            ? (couponDeliveryStatus === 'resent'
              ? 'Your existing private coupon was emailed again.'
              : couponDeliveryStatus === 'recently_sent'
                ? 'Your private coupon was emailed recently.'
                : 'Your private coupon is on its way.')
            : "You're subscribed.",
        });
      } catch (e) {
        console.error('[Newsletter Subscribe] Error:', e?.message || e);
        return res.status(500).json({ error: 'We could not save your subscription. Please try again.' });
      }
    }

    // Admin-only delivery retry. The record and token are preserved; only the same
    // private coupon is sent again.
    const wormCouponResendMatch = path.match(/^\/api\/admin\/worm-castings\/([0-9a-f-]{36})\/resend$/i);
    if (wormCouponResendMatch && req.method === 'POST') {
      const admin = await verifyAdminToken(req);
      if (!admin) return res.status(401).json({ error: 'Unauthorized' });
      const db = await getSupabase();
      const { data: existing, error: lookupError } = await db.from('sp_worm_castings_redemptions')
        .select('*').eq('campaign_key', WORM_CASTINGS_CAMPAIGN_KEY)
        .eq('redemption_token', wormCouponResendMatch[1]).maybeSingle();
      if (lookupError) throw lookupError;
      if (!existing) return res.status(404).json({ error: 'Coupon not found' });
      const { data: queued, error: queueError } = await db.from('sp_worm_castings_redemptions')
        .update({ distribution_status: 'pending', distribution_last_error: null, updated_at: new Date().toISOString() })
        .eq('id', existing.id).select().single();
      if (queueError) throw queueError;
      const delivery = await sendWormCastingsCoupon({ db, redemption: queued });
      return res.json({ success: true, deliveryStatus: delivery.status });
    }

    // Persist opt-outs for newsletter AND giveaway-only contacts.
    if (path === '/api/unsubscribe' && req.method === 'POST') {
      const body = req.body || {};
      const email = body.email || url.searchParams.get('email');
      const reason = body.reason || (body['List-Unsubscribe'] === 'One-Click' ? 'One-click unsubscribe' : undefined);

      if (typeof email !== 'string' || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
        return res.status(400).json({ error: 'A valid email is required' });
      }

      const normalizedEmail = email.toLowerCase().trim();

      try {
        const db = await getSupabase();
        const { unsubscribeNewsletterContact } = await import('../shared/newsletterEngagement.js');
        await unsubscribeNewsletterContact(db, normalizedEmail, reason);
        // Suppression is durable before attempting cancellation. A transient
        // provider failure is retried by the minute worker, never a resubscribe.
        let cancellationDb;
        try {
          const { default: pg } = await import('pg');
          const { runGiveawayReminderQueue } = await import('../shared/giveawayReminderQueue.js');
          cancellationDb = new pg.Client({ connectionString: process.env.DATABASE_URL,
            ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 3000 });
          await cancellationDb.connect();
          await runGiveawayReminderQueue(cancellationDb, { cancellationOnly: true, deadline: Date.now()+10_000 });
        } catch (error) {
          console.error('[Unsubscribe] Cancellation queued for retry:', error?.message || error);
        } finally { if (cancellationDb) await cancellationDb.end(); }
        return res.json({ success: true, message: 'Unsubscribed successfully' });
      } catch (e) {
        console.error('[Unsubscribe] Error:', e?.message || e);
        return res.status(500).json({ error: 'Failed to update subscription status' });
      }
    }

    // GET /api/unsubscribe/status/:email - Check subscription status (sp_customers)
    const unsubStatusMatch = path.match(/^\/api\/unsubscribe\/status\/(.+)$/);
    if (unsubStatusMatch && req.method === 'GET') {
      const email = decodeURIComponent(unsubStatusMatch[1]).toLowerCase().trim();
      const db = await getSupabase();
      const { data: customer } = await db
        .from('sp_customers')
        .select('newsletter_subscribed, newsletter_unsubscribed_at')
        .ilike('email', email)
        .maybeSingle();

      if (!customer) {
        return res.json({ found: false });
      }

      return res.json({
        found: true,
        subscribed: customer.newsletter_subscribed !== false,
        unsubscribedDate: customer.newsletter_unsubscribed_at || null,
        source: 'sp_customers',
      });
    }

    // POST /api/resend/webhook — fallback if dedicated api/resend/webhook.js is not hit
    if (path === '/api/resend/webhook' && req.method === 'POST') {
      try {
        const { readRawBody, verifyResendWebhookSignature } = await import('../shared/resendWebhookVerify.js');
        const rawBody = await readRawBody(req);
        const secret = process.env.RESEND_WEBHOOK_SECRET;
        if (secret) {
          const verified = verifyResendWebhookSignature(rawBody, req.headers, secret);
          if (!verified.ok) {
            console.error('[Resend Webhook] signature failed:', verified.reason);
            return res.status(401).json({ error: 'Invalid signature', reason: verified.reason });
          }
        }
        let event = req.body;
        if (rawBody && (!event || typeof event !== 'object' || !event.type)) {
          event = JSON.parse(rawBody);
        }
        const db = await getSupabase();
        const { handleResendNewsletterWebhook } = await import('../shared/newsletterEngagement.js');
        const result = await handleResendNewsletterWebhook(db, event);
        return res.json({ received: true, ...result });
      } catch (e) {
        console.error('[Resend Webhook] Error:', e?.message || e);
        return res.status(500).json({ received: false, error: 'Processing error' });
      }
    }

    // ============ CUSTOMER AUTH ENDPOINTS ============

    // Customer signup
    if (path === '/api/auth/signup' && req.method === 'POST') {
      const { email, password, fullName, phone, companyName, accountType = 'retail' } = req.body || {};

      if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required' });
      }
      if (password.length < 8) {
        return res.status(400).json({ error: 'Password must be at least 8 characters' });
      }
      if (!['retail', 'wholesale', 'commercial'].includes(accountType)) {
        return res.status(400).json({ error: 'Invalid account type' });
      }

      const sb = await getSupabase();

      // Create user in Supabase Auth
      const { data: authData, error: authError } = await sb.auth.admin.createUser({
        email,
        password,
        email_confirm: false,
      });

      if (authError) {
        console.error('Signup error:', authError);
        return res.status(400).json({ error: authError.message });
      }

      // Update customer profile with additional data
      const { error: profileError } = await sb
        .from('customer_profiles')
        .update({
          full_name: fullName || null,
          phone: phone || null,
          company_name: companyName || null,
          account_type: accountType,
          is_approved: true,
        })
        .eq('id', authData.user.id);

      if (profileError) {
        console.error('Profile update error:', profileError);
      }

      // Generate email verification token
      const crypto = await import('crypto');
      const verificationToken = crypto.randomBytes(32).toString('hex');
      await sb.from('email_verification_tokens').insert({
        email,
        token: verificationToken,
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      });

      // Send verification email
      try {
        const r = await getResend();
        const baseUrl = 'https://www.organicsoilwholesale.com';
        const verificationUrl = `${baseUrl}/verify-email/${verificationToken}`;
        await r.emails.send({
          from: 'Organic Soil Wholesale <info@soilseedandwater.com>',
          replyTo: 'ralvarez@soilseedandwater.com',
          to: email,
          subject: 'Verify your email for Organic Soil Wholesale',
          html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px"><div style="background-color:#2c5530;color:white;padding:20px;text-align:center"><h1>Organic Soil Wholesale</h1></div><div style="padding:30px;background-color:#f9f9f9"><h2>Verify Your Email Address</h2><p>Thank you for creating an account!</p><p>Please click the button below to verify your email address:</p><center><a href="${verificationUrl}" style="display:inline-block;padding:12px 30px;background-color:#2c5530;color:white;text-decoration:none;border-radius:5px;margin:20px 0">Verify Email</a></center><p>This link will expire in 24 hours.</p></div><div style="text-align:center;padding:20px;color:#666;font-size:14px"><p>Organic Soil Wholesale &bull; 1634 N 19th Ave, Phoenix, AZ 85009 &bull; (623) 263-3386</p></div></div>`,
        });
      } catch (emailErr) {
        console.error('Failed to send verification email:', emailErr);
      }

      // Notify Rodo of new signup
      try {
        const r = await getResend();
        await r.emails.send({
          from: 'Organic Soil Wholesale <info@soilseedandwater.com>',
          replyTo: 'ralvarez@soilseedandwater.com',
          to: 'ralvarez@soilseedandwater.com',
          subject: `New ${accountType} signup: ${fullName || email}`,
          html: `<p><strong>New account signup on organicsoilwholesale.com</strong></p><ul><li><strong>Name:</strong> ${fullName || 'N/A'}</li><li><strong>Email:</strong> ${email}</li><li><strong>Phone:</strong> ${phone || 'N/A'}</li><li><strong>Company:</strong> ${companyName || 'N/A'}</li><li><strong>Type:</strong> ${accountType}</li><li><strong>Auto-approved:</strong> Yes (portal access granted)</li></ul>`,
        });
      } catch (notifyErr) {
        console.error('Failed to send signup notification:', notifyErr);
      }

      return res.json({
        success: true,
        message: 'Account created successfully. Please check your email to verify your account.',
        requiresApproval: false,
      });
    }

    // Customer signin
    if (path === '/api/auth/signin' && req.method === 'POST') {
      const { email, password } = req.body || {};

      if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required' });
      }

      // Use a separate client for signin to avoid polluting the shared service role client
      const { createClient } = await import('@supabase/supabase-js');
      const signinClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
      const { data: authData, error: authError } = await signinClient.auth.signInWithPassword({ email, password });

      if (authError) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      // Use the main service role client for admin queries (not polluted by signIn)
      const sb = await getSupabase();
      const { data: profile } = await sb.from('customer_profiles').select('*').eq('id', authData.user.id).single();

      if (!profile) {
        return res.status(404).json({ error: 'Profile not found' });
      }

      // All accounts can sign in now — portal handles gating

      // Log activity
      await sb.from('customer_activity_log').insert({
        customer_id: authData.user.id,
        action: 'signin',
        ip_address: req.headers['x-forwarded-for'] || req.ip,
        user_agent: req.headers['user-agent'],
      });

      return res.json({
        token: authData.session.access_token,
        user: { id: authData.user.id, email: authData.user.email, profile },
      });
    }

    // Customer session check
    if (path === '/api/auth/session' && req.method === 'GET') {
      const token = req.headers.authorization?.replace('Bearer ', '');
      if (!token) return res.status(401).json({ error: 'No token provided' });

      const sb = await getSupabase();
      const { data: { user }, error } = await sb.auth.getUser(token);

      if (error || !user) return res.status(401).json({ error: 'Invalid session' });

      const { data: profile } = await sb.from('customer_profiles').select('*').eq('id', user.id).single();

      return res.json({ user: { id: user.id, email: user.email, profile } });
    }

    // Customer signout
    if (path === '/api/auth/signout' && req.method === 'POST') {
      const token = req.headers.authorization?.replace('Bearer ', '');
      if (token) {
        const sb = await getSupabase();
        await sb.auth.admin.signOut(token);
      }
      return res.json({ success: true });
    }

    // Email verification
    const verifyMatch = path.match(/^\/api\/auth\/verify-email\/(.+)$/);
    if (verifyMatch && req.method === 'POST') {
      const verifyToken = verifyMatch[1];
      const sb = await getSupabase();

      const { data: tokenData, error: tokenError } = await sb
        .from('email_verification_tokens')
        .select('*')
        .eq('token', verifyToken)
        .eq('verified', false)
        .gt('expires_at', new Date().toISOString())
        .single();

      if (tokenError || !tokenData) {
        return res.status(400).json({ error: 'Invalid or expired verification token' });
      }

      const { data: users } = await sb.auth.admin.listUsers();
      const user = users.users.find(u => u.email === tokenData.email);

      if (!user) return res.status(404).json({ error: 'User not found' });

      await sb.auth.admin.updateUserById(user.id, { email_confirm: true });
      await sb.from('email_verification_tokens').update({ verified: true }).eq('id', tokenData.id);

      return res.json({ success: true, message: 'Email verified successfully' });
    }

    // ========== CUSTOMER PORTAL ENDPOINTS ==========

    // Helper: get customer from bearer token
    async function getCustomerFromToken(req) {
      const tkn = req.headers.authorization?.replace('Bearer ', '');
      if (!tkn) return null;
      const sb = await getSupabase();
      const { data: { user }, error } = await sb.auth.getUser(tkn);
      if (error || !user) return null;
      const { data: profile } = await sb.from('customer_profiles').select('*').eq('id', user.id).single();
      if (!profile) return null;
      return { id: user.id, email: user.email, profile };
    }

    // GET /api/portal/profile
    if (path === '/api/portal/profile' && req.method === 'GET') {
      const customer = await getCustomerFromToken(req);
      if (!customer) return res.status(401).json({ error: 'Unauthorized' });
      return res.json({ profile: customer.profile });
    }

    // GET /api/portal/application
    if (path === '/api/portal/application' && req.method === 'GET') {
      const customer = await getCustomerFromToken(req);
      if (!customer) return res.status(401).json({ error: 'Unauthorized' });

      const sb = await getSupabase();
      const { data: app } = await sb.from('customer_applications').select('*').eq('customer_id', customer.id).single();

      if (!app) {
        return res.json({ application: { status: 'none' } });
      }
      return res.json({ application: app });
    }

    // POST /api/portal/application
    if (path === '/api/portal/application' && req.method === 'POST') {
      const customer = await getCustomerFromToken(req);
      if (!customer) return res.status(401).json({ error: 'Unauthorized' });

      const sb = await getSupabase();
      const body = req.body || {};

      // Upsert application
      const appData = {
        customer_id: customer.id,
        legal_entity_name: body.legal_entity_name || null,
        dba_name: body.dba_name || null,
        ein_tax_id: body.ein_tax_id || null,
        business_type: body.business_type || null,
        years_in_business: body.years_in_business || null,
        ops_contact_name: body.ops_contact_name || null,
        ops_contact_title: body.ops_contact_title || null,
        ops_contact_email: body.ops_contact_email || null,
        ops_contact_phone: body.ops_contact_phone || null,
        ap_contact_name: body.ap_contact_name || null,
        ap_contact_title: body.ap_contact_title || null,
        ap_contact_email: body.ap_contact_email || null,
        ap_contact_phone: body.ap_contact_phone || null,
        preferred_payment_method: body.preferred_payment_method || null,
        preferred_payment_terms: body.preferred_payment_terms || null,
        has_forklift: body.has_forklift || false,
        delivery_instructions: body.delivery_instructions || null,
        credit_references: body.credit_references || [],
        status: 'submitted',
        submitted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const { data: existing } = await sb.from('customer_applications').select('id').eq('customer_id', customer.id).single();

      let result;
      if (existing) {
        const { data, error } = await sb.from('customer_applications').update(appData).eq('customer_id', customer.id).select().single();
        if (error) return res.status(500).json({ error: error.message });
        result = data;
      } else {
        const { data, error } = await sb.from('customer_applications').insert(appData).select().single();
        if (error) return res.status(500).json({ error: error.message });
        result = data;
      }

      // Update profile application_status
      await sb.from('customer_profiles').update({ application_status: 'submitted' }).eq('id', customer.id);

      // Notify Rodo
      try {
        const r = await getResend();
        await r.emails.send({
          from: 'Organic Soil Wholesale <info@soilseedandwater.com>',
          replyTo: 'ralvarez@soilseedandwater.com',
          to: 'ralvarez@soilseedandwater.com',
          subject: `New wholesale application: ${body.legal_entity_name || customer.profile.company_name || customer.email}`,
          html: `<p><strong>New wholesale application submitted</strong></p>
            <ul>
              <li><strong>Business:</strong> ${body.legal_entity_name || 'N/A'} ${body.dba_name ? `(DBA: ${body.dba_name})` : ''}</li>
              <li><strong>Type:</strong> ${body.business_type || 'N/A'}</li>
              <li><strong>Contact:</strong> ${body.ops_contact_name || 'N/A'} - ${body.ops_contact_email || 'N/A'} - ${body.ops_contact_phone || 'N/A'}</li>
              <li><strong>Payment:</strong> ${body.preferred_payment_method || 'N/A'} / ${body.preferred_payment_terms || 'N/A'}</li>
              <li><strong>Forklift:</strong> ${body.has_forklift ? 'Yes' : 'No'}</li>
            </ul>
            <p>Review in the admin panel or reply to approve.</p>`,
        });
      } catch (notifyErr) {
        console.error('Failed to send application notification:', notifyErr);
      }

      return res.json({ success: true, application: result });
    }

    // POST /api/portal/orders — submit order from cart
    if (path === '/api/portal/orders' && req.method === 'POST') {
      const customer = await getCustomerFromToken(req);
      if (!customer) return res.status(401).json({ error: 'Unauthorized' });

      const sb = await getSupabase();
      const body = req.body || {};
      const items = body.items || [];

      if (items.length === 0) {
        return res.status(400).json({ error: 'Order must have at least one item' });
      }

      // Calculate total
      const totalAmount = items.reduce((sum, item) => sum + (item.unit_price * item.quantity), 0);

      // Update SMS opt-in if provided
      if (typeof body.sms_opt_in === 'boolean') {
        await sb.from('customer_profiles').update({ sms_opt_in: body.sms_opt_in }).eq('id', customer.id);
      }

      // Create order
      const { data: order, error: orderError } = await sb.from('orders').insert({
        customer_profile_id: customer.id,
        customer_name: customer.profile.full_name || customer.email,
        customer_email: customer.email,
        business_name: customer.profile.company_name || customer.profile.full_name || customer.email,
        email: customer.email,
        phone: customer.profile.phone || '',
        delivery_type: body.fulfillment_type || 'pickup',
        order_items: JSON.stringify(items.map(i => ({ name: i.product_name, format: i.format, qty: i.quantity, price: i.unit_price }))),
        order_type: body.fulfillment_type === 'delivery' ? 'delivery' : 'pickup',
        status: 'pending',
        total: Math.round(totalAmount),
        subtotal: Math.round(totalAmount),
        fulfillment_type: body.fulfillment_type || 'pickup',
        delivery_address_json: body.delivery_address || null,
        preferred_date: body.preferred_date || null,
        preferred_time_start: body.preferred_time_start || null,
        preferred_time_end: body.preferred_time_end || null,
        special_instructions: body.special_instructions || null,
      }).select().single();

      if (orderError) {
        console.error('Order creation error:', orderError);
        return res.status(500).json({ error: orderError.message });
      }

      // Insert order items (format = product name for display, size_option = pallet format)
      const orderItems = items.map(item => ({
        order_id: order.id,
        quantity: item.quantity,
        size_option: item.format,
        format: item.product_name,
        unit_price: item.unit_price,
        total_price: item.unit_price * item.quantity,
      }));

      const { error: itemsError } = await sb.from('order_items').insert(orderItems);
      if (itemsError) {
        console.error('Order items error:', itemsError);
      }

      // Insert initial status history
      await sb.from('order_status_history').insert({
        order_id: order.id,
        new_status: 'pending',
        notes: 'Order submitted by customer',
      });

      // Notify Rodo
      try {
        const r = await getResend();
        const itemsList = items.map(i => `<li>${i.product_name} - ${i.format} x ${i.quantity} ($${(i.unit_price * i.quantity).toLocaleString()})</li>`).join('');
        await r.emails.send({
          from: 'Organic Soil Wholesale <info@soilseedandwater.com>',
          replyTo: 'ralvarez@soilseedandwater.com',
          to: 'ralvarez@soilseedandwater.com',
          subject: `New wholesale order #${order.order_number} - $${totalAmount.toLocaleString()} - ${customer.profile.company_name || customer.email}`,
          html: `<p><strong>New wholesale order from ${customer.profile.company_name || customer.email}</strong></p>
            <p><strong>Order #${order.order_number}</strong> - $${totalAmount.toLocaleString()}</p>
            <p><strong>${body.fulfillment_type === 'delivery' ? 'Delivery' : 'Pickup'}</strong> on ${body.preferred_date || 'TBD'}</p>
            <ul>${itemsList}</ul>
            ${body.special_instructions ? `<p><strong>Notes:</strong> ${body.special_instructions}</p>` : ''}`,
        });
      } catch (notifyErr) {
        console.error('Failed to send order notification:', notifyErr);
      }

      return res.json({ success: true, order });
    }

    // GET /api/portal/orders — list customer orders
    if (path === '/api/portal/orders' && req.method === 'GET') {
      const customer = await getCustomerFromToken(req);
      if (!customer) return res.status(401).json({ error: 'Unauthorized' });

      const sb = await getSupabase();
      const limit = parseInt(req.query?.limit) || 50;

      const { data: orders, error } = await sb
        .from('orders')
        .select('id, order_number, status, total, created_at, fulfillment_type')
        .eq('customer_profile_id', customer.id)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) return res.status(500).json({ error: error.message });

      // Get item counts
      const orderIds = (orders || []).map(o => o.id);
      let itemCounts = {};
      if (orderIds.length > 0) {
        const { data: items } = await sb
          .from('order_items')
          .select('order_id')
          .in('order_id', orderIds);
        if (items) {
          items.forEach(i => { itemCounts[i.order_id] = (itemCounts[i.order_id] || 0) + 1; });
        }
      }

      const enriched = (orders || []).map(o => ({
        ...o,
        item_count: itemCounts[o.id] || 0,
      }));

      return res.json({ orders: enriched });
    }

    // GET /api/portal/orders/:id — order detail
    const portalOrderMatch = path.match(/^\/api\/portal\/orders\/([a-f0-9-]+)$/);
    if (portalOrderMatch && req.method === 'GET') {
      const customer = await getCustomerFromToken(req);
      if (!customer) return res.status(401).json({ error: 'Unauthorized' });

      const orderId = portalOrderMatch[1];
      const sb = await getSupabase();

      const { data: order, error } = await sb
        .from('orders')
        .select('*')
        .eq('id', orderId)
        .eq('customer_profile_id', customer.id)
        .single();

      if (error || !order) return res.status(404).json({ error: 'Order not found' });

      // Get items
      const { data: items } = await sb
        .from('order_items')
        .select('*')
        .eq('order_id', orderId)
        .order('created_at', { ascending: true });

      // Get status history
      const { data: history } = await sb
        .from('order_status_history')
        .select('*')
        .eq('order_id', orderId)
        .order('created_at', { ascending: false });

      return res.json({
        order: {
          ...order,
          delivery_address: order.delivery_address_json,
          items: items || [],
          status_history: history || [],
        },
      });
    }

    // ========== ADMIN: CUSTOMERS ==========

    // GET /api/admin/customers
    if (path === '/api/admin/customers' && req.method === 'GET') {
      const admin = await verifyAdminToken(req);
      if (!admin) return res.status(401).json({ error: 'Unauthorized' });
      const sb = await getSupabase();
      const { data, error } = await sb.from('customer_profiles').select('*').order('created_at', { ascending: false });
      if (error) return res.status(500).json({ error: error.message });
      return res.json(data || []);
    }

    // GET /api/admin/customers/:id
    const adminCustMatch = path.match(/^\/api\/admin\/customers\/([a-f0-9-]+)$/);
    if (adminCustMatch && req.method === 'GET') {
      const admin = await verifyAdminToken(req);
      if (!admin) return res.status(401).json({ error: 'Unauthorized' });
      const sb = await getSupabase();
      const custId = adminCustMatch[1];
      const { data: profile } = await sb.from('customer_profiles').select('*').eq('id', custId).single();
      if (!profile) return res.status(404).json({ error: 'Customer not found' });
      const { data: application } = await sb.from('customer_applications').select('*').eq('customer_id', custId).single();
      const { data: orders } = await sb.from('orders').select('id, order_number, status, total, created_at, fulfillment_type').eq('customer_profile_id', custId).order('created_at', { ascending: false });
      return res.json({ profile, application, orders: orders || [] });
    }

    // ========== ADMIN: APPLICATIONS ==========

    // GET /api/admin/applications
    if (path === '/api/admin/applications' && req.method === 'GET') {
      const admin = await verifyAdminToken(req);
      if (!admin) return res.status(401).json({ error: 'Unauthorized' });
      const sb = await getSupabase();
      const { data, error } = await sb.from('customer_applications').select('*, customer_profiles!customer_applications_customer_id_fkey(full_name, email, company_name, phone, account_type)').order('submitted_at', { ascending: false });
      if (error) {
        // Fallback without join
        const { data: apps } = await sb.from('customer_applications').select('*').order('submitted_at', { ascending: false });
        return res.json(apps || []);
      }
      return res.json(data || []);
    }

    // POST /api/admin/applications/:id/approve
    const approveMatch = path.match(/^\/api\/admin\/applications\/([a-f0-9-]+)\/approve$/);
    if (approveMatch && req.method === 'POST') {
      const admin = await verifyAdminToken(req);
      if (!admin) return res.status(401).json({ error: 'Unauthorized' });
      const sb = await getSupabase();
      const appId = approveMatch[1];
      const { data: app } = await sb.from('customer_applications').select('customer_id').eq('id', appId).single();
      if (!app) return res.status(404).json({ error: 'Application not found' });
      const body = req.body || {};
      await sb.from('customer_applications').update({ status: 'approved', reviewed_at: new Date().toISOString(), notes: body.notes || null }).eq('id', appId);
      // Prospects submit with customer_id=null (no portal account yet). On approval,
      // provision an auth user + profile so net terms / credit limit have a home and
      // the customer can later log in to order on terms.
      let customerId = app.customer_id;
      if (!customerId) {
        const { data: full } = await sb.from('customer_applications')
          .select('ops_contact_email, ops_contact_name, ops_contact_phone, legal_entity_name, business_type, ein_tax_id')
          .eq('id', appId).single();
        const email = (full?.ops_contact_email || '').toLowerCase();
        if (email) {
          const { data: existing } = await sb.from('customer_profiles').select('id').eq('email', email).maybeSingle();
          if (existing) {
            customerId = existing.id;
          } else {
            try {
              const { data: createdUser } = await sb.auth.admin.createUser({ email, email_confirm: true });
              const uid = createdUser?.user?.id;
              if (uid) {
                await sb.from('customer_profiles').insert({
                  id: uid, email, full_name: full?.ops_contact_name || null,
                  company_name: full?.legal_entity_name || null, phone: full?.ops_contact_phone || null,
                  tax_id: full?.ein_tax_id || null, account_type: full?.business_type || 'wholesale',
                  application_status: 'submitted', is_approved: false,
                });
                customerId = uid;
              }
            } catch (e) { console.error('[approve] account provisioning failed:', e?.message); }
          }
          if (customerId) await sb.from('customer_applications').update({ customer_id: customerId }).eq('id', appId);
        }
      }
      if (customerId) {
        await sb.from('customer_profiles').update({ is_approved: true, approved_at: new Date().toISOString() }).eq('id', customerId);
        await sb.from('customer_profiles').update({ application_status: 'approved' }).eq('id', customerId);
        if (body.credit_limit) await sb.from('customer_profiles').update({ credit_limit: body.credit_limit }).eq('id', customerId);
        if (body.payment_terms) await sb.from('customer_profiles').update({ payment_terms: body.payment_terms }).eq('id', customerId);
      }
      return res.json({ success: true, provisioned_customer_id: customerId || null });
    }

    // POST /api/admin/applications/:id/reject
    const rejectMatch = path.match(/^\/api\/admin\/applications\/([a-f0-9-]+)\/reject$/);
    if (rejectMatch && req.method === 'POST') {
      const admin = await verifyAdminToken(req);
      if (!admin) return res.status(401).json({ error: 'Unauthorized' });
      const sb = await getSupabase();
      const appId = rejectMatch[1];
      const { data: app } = await sb.from('customer_applications').select('customer_id').eq('id', appId).single();
      if (!app) return res.status(404).json({ error: 'Application not found' });
      const body = req.body || {};
      await sb.from('customer_applications').update({ status: 'rejected', reviewed_at: new Date().toISOString(), notes: body.reason || null }).eq('id', appId);
      if (app.customer_id) await sb.from('customer_profiles').update({ application_status: 'rejected' }).eq('id', app.customer_id);
      return res.json({ success: true });
    }

    // ========== ADMIN: ORDERS ==========

    // GET /api/admin/orders
    if (path === '/api/admin/orders' && req.method === 'GET') {
      const admin = await verifyAdminToken(req);
      if (!admin) return res.status(401).json({ error: 'Unauthorized' });
      const sb = await getSupabase();
      const status = req.query?.status;
      let query = sb.from('orders').select('*').order('created_at', { ascending: false }).limit(100);
      if (status && status !== 'all') query = query.eq('status', status);
      const { data, error } = await query;
      if (error) return res.status(500).json({ error: error.message });
      return res.json(data || []);
    }

    // GET /api/admin/orders/:id
    const adminOrderMatch = path.match(/^\/api\/admin\/orders\/(\d+)$/);
    if (adminOrderMatch && req.method === 'GET') {
      const admin = await verifyAdminToken(req);
      if (!admin) return res.status(401).json({ error: 'Unauthorized' });
      const sb = await getSupabase();
      const orderId = parseInt(adminOrderMatch[1]);
      const { data: order } = await sb.from('orders').select('*').eq('id', orderId).single();
      if (!order) return res.status(404).json({ error: 'Order not found' });
      const { data: items } = await sb.from('order_items').select('*').eq('order_id', orderId);
      const { data: history } = await sb.from('order_status_history').select('*').eq('order_id', orderId).order('created_at', { ascending: false });
      return res.json({ ...order, items: items || [], status_history: history || [] });
    }

    // POST /api/admin/orders/:id/status — update order status
    const adminOrderStatusMatch = path.match(/^\/api\/admin\/orders\/(\d+)\/status$/);
    if (adminOrderStatusMatch && req.method === 'POST') {
      const admin = await verifyAdminToken(req);
      if (!admin) return res.status(401).json({ error: 'Unauthorized' });
      const sb = await getSupabase();
      const orderId = parseInt(adminOrderStatusMatch[1]);
      const body = req.body || {};
      if (!body.status) return res.status(400).json({ error: 'Status required' });
      const { data: order } = await sb.from('orders').select('*').eq('id', orderId).single();
      if (!order) return res.status(404).json({ error: 'Order not found' });
      await sb.from('orders').update({ status: body.status, updated_at: new Date().toISOString() }).eq('id', orderId);
      await sb.from('order_status_history').insert({ order_id: orderId, old_status: order.status, new_status: body.status, notes: body.notes || null });

      // Auto-send customer notification for key status changes (fire and forget)
      const notifyStatuses = ['approved', 'ready_for_pickup', 'out_for_delivery', 'completed'];
      let notificationSent = false;
      if (notifyStatuses.includes(body.status) && body.notify !== false) {
        const customerEmail = order.customer_email || order.email;
        if (customerEmail) {
          const orderRef = order.order_number?.slice(0, 8) || order.id;
          const { HOURS_LABEL } = await getPickupSchedule();
          const statusMessages = {
            approved: { subject: `Order #${orderRef} Approved`, body: `Great news! Your order #${orderRef} has been approved and is being prepared.` },
            ready_for_pickup: { subject: `Order #${orderRef} Ready for Pickup`, body: `Your order #${orderRef} is ready for pickup at 1634 N 19th Ave, Phoenix, AZ 85009. ${HOURS_LABEL}.` },
            out_for_delivery: { subject: `Order #${orderRef} Out for Delivery`, body: `Your order #${orderRef} is on its way! Call (623) 263-3386 with questions.` },
            completed: { subject: `Order #${orderRef} Completed`, body: `Your order #${orderRef} has been completed. Thank you for your business!` },
          };
          const msg = statusMessages[body.status];
          if (msg) {
            try {
              const dev = await getDeveloperMode();
              const r = await getResend();
              await r.emails.send({
                from: 'Organic Soil Wholesale <info@soilseedandwater.com>',
                replyTo: 'ralvarez@soilseedandwater.com',
                to: dev.resolveCustomerEmail(customerEmail),
                subject: dev.devModeSubject(msg.subject),
                html: `<p>Hi ${order.customer_name || 'there'},</p><p>${msg.body}</p><p>Thanks,<br>Rodo Alvarez<br>Soil Seed & Water</p>`,
              });
              notificationSent = true;
            } catch (notifyErr) {
              console.error('Auto-notify email failed:', notifyErr);
            }
          }
        }
      }

      return res.json({ success: true, notification_sent: notificationSent });
    }

    // ========== ADMIN: LEADS ==========

    // GET /api/admin/leads
    if (path === '/api/admin/leads' && req.method === 'GET') {
      const admin = await verifyAdminToken(req);
      if (!admin) return res.status(401).json({ error: 'Unauthorized' });
      const sb = await getSupabase();
      const { data, error } = await sb.from('contact_messages').select('*').order('created_at', { ascending: false }).limit(100);
      if (error) return res.status(500).json({ error: error.message });
      return res.json(data || []);
    }

    // ========== PUBLIC: LEAD SUBMISSION (Vercel production) ==========

    // POST /api/leads/submit
    if (path === '/api/leads/submit' && req.method === 'POST') {
      console.info(JSON.stringify({ event: 'lead_submission_started', requestId }));
      let body = req.body || {};
      const isGardenBed = body.source === 'osw_garden_bed_order';
      if (isGardenBed) {
        const normalized = normalizeGardenBedRequest(body);
        if (normalized.honeypot) return res.json({ success: true });
        if (normalized.error) return res.status(400).json({ error: normalized.error, requestId });
        body = normalized.payload;
      }
      const {
        name, phone, notes, preferred_date, order, source_url, brand_id,
      } = body;
      const isRlsBrand = brand_id === 'regenerative_landscaper_supply';
      const leadBrand = isRlsBrand ? 'Regenerative Landscaper Supply' : 'Organic Soil Wholesale';
      const isOrderCallback =
        body.lead_type === 'order_callback' || body.source === 'osw_order_callback';
      const emailRaw = String(body.email || '').trim();

      if (!name || !phone) {
        console.warn(JSON.stringify({ event: 'lead_submission_rejected', requestId, status: 400, reason: 'missing_required_fields', durationMs: Date.now() - startedAt }));
        return res.status(400).json({
          error: isOrderCallback
            ? 'Name and phone are required'
            : 'Name, email, and phone are required',
          requestId,
        });
      }
      if (!isOrderCallback && !emailRaw) {
        console.warn(JSON.stringify({ event: 'lead_submission_rejected', requestId, status: 400, reason: 'missing_email', durationMs: Date.now() - startedAt }));
        return res.status(400).json({ error: 'Name, email, and phone are required', requestId });
      }
      if (isOrderCallback && (!order?.line_items || !order.line_items.length)) {
        console.warn(JSON.stringify({ event: 'lead_submission_rejected', requestId, status: 400, reason: 'missing_order_lines', durationMs: Date.now() - startedAt }));
        return res.status(400).json({ error: 'Add at least one order line before requesting a callback', requestId });
      }

      const email = emailRaw || (isOrderCallback
        ? `callback+${String(phone).replace(/\D/g, '').slice(-10) || 'unknown'}@leads.organicsoilwholesale.com`
        : '');

      const orderLines = Array.isArray(order?.line_items) ? order.line_items : [];
      const orderNoteParts = [];
      if (isOrderCallback && orderLines.length) {
        orderNoteParts.push('ORDER LINES:');
        for (const item of orderLines) {
          const qty = item.quantity ?? 1;
          const pname = item.product_name || 'Product';
          const format = item.format ? ` (${item.format})` : '';
          const total = item.line_total != null
            ? ` — $${Number(item.line_total).toFixed(2)}`
            : item.unit_price != null
              ? ` — $${(Number(item.unit_price) * qty).toFixed(2)}`
              : '';
          const spots = item.flatbed_spots > 0
            ? ` [+${item.flatbed_spots} spot${item.flatbed_spots === 1 ? '' : 's'}]`
            : '';
          orderNoteParts.push(`- ${qty}x ${pname}${format}${total}${spots}`);
        }
        if (order.estimated_total != null) {
          orderNoteParts.push(`Estimated products: $${Number(order.estimated_total).toFixed(2)}`);
        }
        if (order.flatbed_spots > 0) {
          orderNoteParts.push(`Flatbed spots: ${order.flatbed_spots}/22`);
        }
        if (order.delivery_zip) {
          const fee = order.delivery_fee != null
            ? ` · est. delivery $${Number(order.delivery_fee).toFixed(2)}`
            : '';
          orderNoteParts.push(`Delivery ZIP: ${order.delivery_zip}${fee}`);
        }
        if (order.preferred_call_window) {
          const windowLabels = {
            morning: 'Morning (8–11am AZ)',
            afternoon: 'Afternoon (12–4pm AZ)',
            evening: 'Evening (4–6pm AZ)',
          };
          const key = String(order.preferred_call_window).toLowerCase();
          orderNoteParts.push(`Preferred call time: ${windowLabels[key] || order.preferred_call_window}`);
        }
        if (notes) orderNoteParts.push('', `Customer note: ${notes}`);
      }
      const orderNotes = orderNoteParts.length
        ? orderNoteParts.join('\n')
        : (notes || 'No additional notes');
      const itemCount = orderLines.length;
      const estimated = order?.estimated_total != null ? Number(order.estimated_total) : null;
      const subject = isOrderCallback
        ? `${isRlsBrand ? '[RLS] ' : ''}Callback requested — ${itemCount} line item${itemCount === 1 ? '' : 's'}${estimated != null ? ` · ~$${estimated.toFixed(0)}` : ''}`
        : `${isRlsBrand ? '[RLS] ' : ''}Lead Form Submission`;

      const sb = await getSupabase();
      const insertData = {
        name,
        email,
        subject,
        message: `Phone: ${phone}\n\n${orderNotes}`,
        brand_id: isRlsBrand ? 'regenerative_landscaper_supply' : null,
        created_at: new Date().toISOString(),
      };
      if (preferred_date) insertData.preferred_date = preferred_date;
      if (isGardenBed) {
        insertData.subject = `Garden bed order request — ${order.line_items[0].quantity} bed(s) · $${order.estimated_total}`;
        const previous = await sb.from('contact_messages').select('id, subject').eq('email', email)
          .like('message', `%Request reference: ${body.request_token}`).limit(1).maybeSingle();
        if (previous.error) return res.status(503).json({ error: 'Please try again in a moment.', requestId });
        if (previous.data) return res.json({ success: true, leadId: previous.data.id, quantity: Number(previous.data.subject.match(/— (\d+) bed/)?.[1]) || order.line_items[0].quantity, requestId });
      }
      const { data, error } = await sb.from('contact_messages').insert(insertData).select().single();
      if (error) {
        console.error(JSON.stringify({ event: 'lead_submission_failed', requestId, status: 500, reason: 'database_insert', durationMs: Date.now() - startedAt }), error);
        return res.status(500).json({ error: 'Failed to process lead', requestId });
      }

      try {
        const r = await getResend();
        const notifyFlag = isOrderCallback ? 'notify_new_orders' : 'notify_quote_requests';
        const adminResult = await sb.from('admin_notifications').select('email').eq('active', true).eq(notifyFlag, true);
        const adminEmails = (adminResult.data || []).map((row) => row.email).filter(Boolean);
        if (!adminEmails.length) adminEmails.push('ralvarez@soilseedandwater.com');
        await Promise.all(adminEmails.map((to) => r.emails.send({
          from: `${isRlsBrand ? 'Regenerative Landscaper Supply' : 'Organic Soil Wholesale'} <info@soilseedandwater.com>`,
          replyTo: 'ralvarez@soilseedandwater.com',
          to,
          subject: isGardenBed ? `Garden bed order request from ${name}` : isOrderCallback
            ? `${isRlsBrand ? '[RLS] ' : ''}Callback about order from ${name}`
            : `${isRlsBrand ? '[RLS] ' : ''}New quote request from ${name}`,
          html: `<p><strong>${isOrderCallback ? 'Callback requested about an order' : 'New lead from the website'}${isRlsBrand ? ' · Regenerative Landscaper Supply' : ''}</strong></p><ul><li><strong>Name:</strong> ${escapeHtml(name)}</li><li><strong>Email:</strong> ${escapeHtml(emailRaw || '(none — phone callback)')}</li><li><strong>Phone:</strong> ${escapeHtml(phone)}</li>${preferred_date ? `<li><strong>Preferred Date:</strong> ${escapeHtml(preferred_date)}</li>` : ''}</ul><pre style="white-space:pre-wrap;font-family:inherit">${escapeHtml(orderNotes)}</pre>`,
        })));
        if (isRlsBrand && emailRaw) {
          await r.emails.send({
            from: 'Regenerative Landscaper Supply <info@soilseedandwater.com>',
            replyTo: 'ralvarez@soilseedandwater.com',
            to: emailRaw,
            subject: 'We received your request | Regenerative Landscaper Supply',
            html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;color:#24382d"><h1>Regenerative Landscaper Supply</h1><p>Thanks, ${escapeHtml(String(name).split(' ')[0])}. We received your material request and our Organic Soil Wholesale team will review availability, pricing, and fulfillment.</p><p>We’ll follow up using the contact information you provided.</p><p>— Organic Soil Wholesale<br>Soil Seed &amp; Water</p></div>`,
          });
        }
      } catch (e) { console.error('Lead notification error:', e); }

      // Forward to MOS sales portal (production path previously skipped this).
      try {
        const secret = process.env.MOS_LEAD_INGEST_SECRET;
        if (secret) {
          const mosSource = isOrderCallback ? 'osw_order_callback' : 'osw_lead_form';
          const mosMessage = `${isRlsBrand ? 'Regenerative Landscaper Supply lead. ' : ''}${isOrderCallback
            ? `Callback requested — ${itemCount} line items${estimated != null ? ` · ~$${estimated.toFixed(0)}` : ''}\n\n${orderNotes}`
            : (notes || undefined)}`;
          const r = await fetch(process.env.MOS_LEAD_INGEST_URL || 'https://myorganicsoil.com/api/leads', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Lead-Source-Key': secret,
            },
            body: JSON.stringify({
              full_name: name,
              email,
              phone,
              message: mosMessage,
              source: mosSource,
              source_url: source_url || 'https://organicsoilwholesale.com/',
              source_data: {
                osw_contact_message_id: data.id,
                brand_id: isRlsBrand ? 'regenerative_landscaper_supply' : 'organic_soil_wholesale',
                brand_name: leadBrand,
                lead_type: isOrderCallback ? 'order_callback' : 'lead_form',
                ...(isOrderCallback && order ? { order } : {}),
                ...(isGardenBed ? { campaign: 'garden_bed_launch', request_token: body.request_token } : {}),
              },
            }),
          });
          if (!r.ok) {
            console.error('[leads/submit] MOS forward', r.status, (await r.text().catch(() => '')).slice(0, 200));
          }
        } else {
          console.warn('[leads/submit] MOS_LEAD_INGEST_SECRET not set — lead not forwarded');
        }
      } catch (e) {
        console.error('[leads/submit] MOS forward error:', e?.message || e);
      }

      console.info(JSON.stringify({ event: 'lead_submission_succeeded', requestId, status: 200, leadId: data.id, durationMs: Date.now() - startedAt }));
      return res.json({
        success: true,
        message: isOrderCallback
          ? 'Thanks — a rep will call you about this order shortly.'
          : 'Quote request submitted successfully',
        leadId: data.id,
        ...(isGardenBed ? { quantity: order.line_items[0].quantity } : {}),
        requestId,
      });
    }

    // ========== SCHEDULING ENDPOINTS ==========

    // POST /api/portal/scheduling/available-dates — returns earliest pickup date based on cart items
    if ((path === '/api/portal/scheduling/available-dates' || path === '/api/scheduling/available-dates') && req.method === 'POST') {
      const sb = await getSupabase();
      const body = req.body || {};
      const productSlugs = body.product_slugs || [];
      const { getAvailableDatesForProducts } = await getPickupSchedule();

      let products = [];
      if (productSlugs.length > 0) {
        const { data } = await sb.from('products').select('slug, name, pickup_lead_days, is_yard_available').in('slug', productSlugs);
        products = data || [];
      }

      const maxLeadDays = products.length > 0
        ? Math.max(...products.map(p => p.pickup_lead_days || 7))
        : 7;

      const hasYardItems = products.some(p => p.is_yard_available);
      const allYardAvailable = products.length > 0 && products.every(p => p.is_yard_available);

      const schedule = getAvailableDatesForProducts({ allYardAvailable, maxLeadDays });

      const productAvailability = products.map(p => ({
        slug: p.slug,
        name: p.name,
        is_yard_available: p.is_yard_available,
        pickup_lead_days: p.pickup_lead_days,
      }));

      return res.json({
        ...schedule,
        has_yard_items: hasYardItems,
        products: productAvailability,
      });
    }

    // POST /api/portal/scheduling/time-slots — returns hourly pickup slots for a date
    if ((path === '/api/portal/scheduling/time-slots' || path === '/api/scheduling/time-slots') && req.method === 'POST') {
      const body = req.body || {};
      const date = body.date;
      const { getTimeSlotsForDate } = await getPickupSchedule();

      if (!date) return res.status(400).json({ error: 'Date is required' });

      return res.json(getTimeSlotsForDate(date));
    }

    // ========== PRODUCT AVAILABILITY (Admin) ==========

    // GET /api/admin/products/availability — list all products with availability info
    if (path === '/api/admin/products/availability' && req.method === 'GET') {
      const admin = await verifyAdminToken(req);
      if (!admin) return res.status(401).json({ error: 'Unauthorized' });
      const sb = await getSupabase();
      const { data, error } = await sb.from('products')
        .select('id, name, slug, is_yard_available, pickup_lead_days, product_status')
        .order('name');
      if (error) return res.status(500).json({ error: error.message });
      return res.json(data || []);
    }

    // PATCH /api/admin/products/:id/availability — toggle yard availability and lead days
    const prodAvailMatch = path.match(/^\/api\/admin\/products\/(\d+)\/availability$/);
    if (prodAvailMatch && req.method === 'PATCH') {
      const admin = await verifyAdminToken(req);
      if (!admin) return res.status(401).json({ error: 'Unauthorized' });
      const sb = await getSupabase();
      const productId = parseInt(prodAvailMatch[1]);
      const body = req.body || {};
      const updates = {};
      if (typeof body.is_yard_available === 'boolean') updates.is_yard_available = body.is_yard_available;
      if (typeof body.pickup_lead_days === 'number') updates.pickup_lead_days = Math.max(1, Math.min(30, body.pickup_lead_days));
      if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'No valid fields to update' });
      const { data, error } = await sb.from('products').update(updates).eq('id', productId).select('id, name, is_yard_available, pickup_lead_days').single();
      if (error) return res.status(500).json({ error: error.message });
      return res.json(data);
    }

    // ========== STRIPE DEPOSITS ==========

    // POST /api/admin/orders/:id/payment-link — create Stripe Payment Link for deposit
    const paymentLinkMatch = path.match(/^\/api\/admin\/orders\/(\d+)\/payment-link$/);
    if (paymentLinkMatch && req.method === 'POST') {
      const admin = await verifyAdminToken(req);
      if (!admin) return res.status(401).json({ error: 'Unauthorized' });

      const sb = await getSupabase();
      const orderId = parseInt(paymentLinkMatch[1]);
      const { data: order } = await sb.from('orders').select('*').eq('id', orderId).single();
      if (!order) return res.status(404).json({ error: 'Order not found' });

      const body = req.body || {};
      // Default: 25% of total, minimum $100
      const depositPct = body.deposit_percent || 25;
      const depositAmount = Math.max(100, Math.round(order.total * depositPct / 100));

      try {
        const Stripe = (await import('stripe')).default;
        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

        // Create a price for the deposit
        const price = await stripe.prices.create({
          unit_amount: depositAmount * 100, // cents
          currency: 'usd',
          product_data: {
            name: `Order #${order.order_number?.slice(0, 8) || order.id} - Deposit`,
            metadata: { order_id: orderId.toString() },
          },
        });

        // Create payment link
        const paymentLink = await stripe.paymentLinks.create({
          line_items: [{ price: price.id, quantity: 1 }],
          metadata: { order_id: orderId.toString(), type: 'deposit' },
          after_completion: {
            type: 'redirect',
            redirect: { url: `${process.env.VITE_SUPABASE_URL ? 'https://soilseedandwater.com' : 'http://localhost:5173'}/portal/orders/${order.id}?deposit=success` },
          },
        });

        // Update order with payment link info
        await sb.from('orders').update({
          deposit_amount: depositAmount,
          stripe_payment_link_id: paymentLink.id,
          updated_at: new Date().toISOString(),
        }).eq('id', orderId);

        // Send payment link to customer
        const customerEmail = order.customer_email || order.email;
        if (customerEmail) {
          const r = await getResend();
          await r.emails.send({
            from: 'Organic Soil Wholesale <info@soilseedandwater.com>',
          replyTo: 'ralvarez@soilseedandwater.com',
            to: customerEmail,
            subject: `Payment link for Order #${order.order_number?.slice(0, 8) || order.id}`,
            html: `<p>Hi ${order.customer_name || 'there'},</p>
              <p>Your order has been approved! To confirm your order, please pay the deposit of <strong>$${depositAmount.toLocaleString()}</strong>.</p>
              <p><a href="${paymentLink.url}" style="display:inline-block;padding:12px 24px;background:#264027;color:white;text-decoration:none;border-radius:8px;font-weight:bold;">Pay Deposit - $${depositAmount}</a></p>
              <p>Or copy this link: ${paymentLink.url}</p>
              <p>If you prefer to pay in full or have questions, just reply to this email.</p>
              <p>Thanks,<br>Rodo Alvarez<br>Soil Seed & Water</p>`,
          });
        }

        return res.json({ success: true, payment_link: paymentLink.url, deposit_amount: depositAmount });
      } catch (err) {
        console.error('Payment link error:', err);
        return res.status(500).json({ error: err.message || 'Failed to create payment link' });
      }
    }

    // POST /api/webhooks/stripe — handle Stripe webhook for deposit payments
    if (path === '/api/webhooks/stripe' && req.method === 'POST') {
      try {
        const Stripe = (await import('stripe')).default;
        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
        const sb = await getSupabase();

        // Verify webhook signature if secret is configured
        let event = req.body;
        const sig = req.headers['stripe-signature'];
        if (process.env.STRIPE_WEBHOOK_SECRET && sig) {
          try {
            event = stripe.webhooks.constructEvent(
              typeof req.body === 'string' ? req.body : JSON.stringify(req.body),
              sig,
              process.env.STRIPE_WEBHOOK_SECRET
            );
          } catch (err) {
            console.error('Webhook signature verification failed:', err.message);
            return res.status(400).json({ error: 'Invalid signature' });
          }
        }

        if (!event || !event.type) return res.status(400).json({ error: 'Invalid event' });

        if (event.type === 'checkout.session.completed') {
          const session = event.data?.object;
          const orderId = session?.metadata?.order_id;

          if (orderId && session?.metadata?.type === 'deposit') {
            // Mark deposit as paid
            await sb.from('orders').update({
              deposit_paid: true,
              deposit_paid_at: new Date().toISOString(),
              stripe_payment_intent_id: session.payment_intent || null,
              updated_at: new Date().toISOString(),
            }).eq('id', parseInt(orderId));

            // Log status change
            await sb.from('order_status_history').insert({
              order_id: parseInt(orderId),
              old_status: 'pending',
              new_status: 'deposit_paid',
              notes: `Deposit paid via Stripe. Payment Intent: ${session.payment_intent || 'N/A'}`,
            });

            // Notify Rodo via SMS
            try {
              const twilio = (await import('twilio')).default;
              const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
              const { data: order } = await sb.from('orders').select('order_number, customer_name, deposit_amount').eq('id', parseInt(orderId)).single();
              if (order) {
                await twilioClient.messages.create({
                  body: `Deposit paid! Order #${order.order_number?.slice(0, 8)} - $${order.deposit_amount} from ${order.customer_name}`,
                  from: process.env.TWILIO_PHONE_NUMBER,
                  to: process.env.RODO_PHONE,
                });
              }
            } catch (smsErr) {
              console.error('SMS notification error:', smsErr);
            }

            // Send confirmation email to customer
            try {
              const { data: order } = await sb.from('orders').select('*').eq('id', parseInt(orderId)).single();
              if (order) {
                const r = await getResend();
                await r.emails.send({
                  from: 'Organic Soil Wholesale <info@soilseedandwater.com>',
          replyTo: 'ralvarez@soilseedandwater.com',
                  to: order.customer_email || order.email,
                  subject: `Deposit confirmed - Order #${order.order_number?.slice(0, 8) || order.id}`,
                  html: `<p>Hi ${order.customer_name || 'there'},</p>
                    <p>Your deposit of <strong>$${order.deposit_amount}</strong> has been received for Order #${order.order_number?.slice(0, 8) || order.id}.</p>
                    <p>We'll notify you when your order is ready for ${order.fulfillment_type === 'delivery' ? 'delivery' : 'pickup'}.</p>
                    <p>Thanks,<br>Rodo Alvarez<br>Soil Seed & Water</p>`,
                });
              }
            } catch (emailErr) {
              console.error('Deposit confirmation email error:', emailErr);
            }
          } else if (orderId) {
            // OSW pay-and-pickup checkout (Stripe often sends all events here)
            await fulfillOswCheckoutOrder(parseInt(String(orderId), 10), session);
          }
        }

        return res.json({ received: true });
      } catch (err) {
        console.error('Webhook error:', err);
        return res.status(500).json({ error: 'Webhook processing failed' });
      }
    }

    // ========== ORDER NOTIFICATIONS ==========

    // POST /api/admin/orders/:id/notify — send status change notification to customer
    const notifyMatch = path.match(/^\/api\/admin\/orders\/(\d+)\/notify$/);
    if (notifyMatch && req.method === 'POST') {
      const admin = await verifyAdminToken(req);
      if (!admin) return res.status(401).json({ error: 'Unauthorized' });

      const sb = await getSupabase();
      const orderId = parseInt(notifyMatch[1]);
      const { data: order } = await sb.from('orders').select('*').eq('id', orderId).single();
      if (!order) return res.status(404).json({ error: 'Order not found' });

      const customerEmail = order.customer_email || order.email;
      if (!customerEmail) return res.status(400).json({ error: 'No customer email' });

      const status = order.status;
      const orderRef = order.order_number?.slice(0, 8) || order.id;
      const { HOURS_LABEL } = await getPickupSchedule();

      const statusMessages = {
        approved: {
          subject: `Order #${orderRef} Approved`,
          html: `<p>Hi ${order.customer_name || 'there'},</p>
            <p>Great news! Your order #${orderRef} has been approved and is being prepared.</p>
            ${order.preferred_date ? `<p><strong>Scheduled for:</strong> ${new Date(order.preferred_date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p>` : ''}
            <p>We'll notify you when it's ready.</p>
            <p>Thanks,<br>Rodo Alvarez<br>Soil Seed & Water</p>`,
        },
        ready_for_pickup: {
          subject: `Order #${orderRef} Ready for Pickup`,
          html: `<p>Hi ${order.customer_name || 'there'},</p>
            <p>Your order #${orderRef} is ready for pickup!</p>
            <p><strong>Pickup Location:</strong><br>1634 N 19th Ave, Phoenix, AZ 85009<br>${HOURS_LABEL}</p>
            <p>Please bring a valid ID when picking up your order.</p>
            <p>Thanks,<br>Rodo Alvarez<br>Soil Seed & Water</p>`,
        },
        out_for_delivery: {
          subject: `Order #${orderRef} Out for Delivery`,
          html: `<p>Hi ${order.customer_name || 'there'},</p>
            <p>Your order #${orderRef} is on its way! Our driver will arrive at the scheduled time.</p>
            <p>If you need to make any changes, call us at (623) 263-3386.</p>
            <p>Thanks,<br>Rodo Alvarez<br>Soil Seed & Water</p>`,
        },
        completed: {
          subject: `Order #${orderRef} Completed`,
          html: `<p>Hi ${order.customer_name || 'there'},</p>
            <p>Your order #${orderRef} has been completed. Thank you for your business!</p>
            <p>If you have any questions or need to reorder, just reply to this email or visit our website.</p>
            <p>Thanks,<br>Rodo Alvarez<br>Soil Seed & Water</p>`,
        },
      };

      const template = statusMessages[status];
      if (!template) return res.status(400).json({ error: `No notification template for status: ${status}` });

      try {
        const r = await getResend();
        const dev = await getDeveloperMode();
        await r.emails.send({
          from: 'Organic Soil Wholesale <info@soilseedandwater.com>',
          replyTo: 'ralvarez@soilseedandwater.com',
          to: dev.resolveCustomerEmail(customerEmail),
          subject: dev.devModeSubject(template.subject),
          html: template.html,
        });

        // Send SMS if opted in
        const { data: profile } = await sb.from('customer_profiles').select('sms_opt_in, phone').eq('id', order.customer_profile_id).single();
        const smsTo = profile?.sms_opt_in && profile?.phone
          ? dev.resolveCustomerSmsPhone(profile.phone.startsWith('+') ? profile.phone : `+1${profile.phone.replace(/\D/g, '')}`)
          : null;
        if (smsTo) {
          try {
            const twilio = (await import('twilio')).default;
            const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
            const smsMessages = {
              approved: `SSW: Order #${orderRef} approved! We're preparing it now.`,
              ready_for_pickup: `SSW: Order #${orderRef} is ready for pickup at 1634 N 19th Ave, Phoenix. ${HOURS_LABEL}.`,
              out_for_delivery: `SSW: Order #${orderRef} is out for delivery! Call (623) 263-3386 with questions.`,
              completed: `SSW: Order #${orderRef} completed. Thanks for your business!`,
            };
            if (smsMessages[status]) {
              await twilioClient.messages.create({
                body: dev.devModeSmsBody(smsMessages[status]),
                from: process.env.TWILIO_PHONE_NUMBER,
                to: smsTo,
              });
            }
          } catch (smsErr) {
            console.error('SMS notification error:', smsErr);
          }
        }

        return res.json({ success: true, status, email_sent: true });
      } catch (err) {
        console.error('Notification error:', err);
        return res.status(500).json({ error: err.message || 'Failed to send notification' });
      }
    }

    // ========== TRUCKING QUOTE ==========
    // Self-contained delivery price calculator. Picks the right truck from cart
    // contents, looks up round-trip drive time (Haversine fallback when no
    // Google Maps key), and returns a cost honest enough to pay against.

    const OSW_YARDS = {
      phoenix:  { label: 'Phoenix, AZ', lat: 33.4675, lng: -112.1000, zip: '85009' },
      congress: { label: 'Congress, AZ', lat: 34.1608, lng: -112.8515, zip: '85332' },
    };

    const DEFAULT_TRUCK_RATES = {
      walking_floor:   { hourly_rate: 165, min_fee: 400, capacity_label: '24 tons / 90 cu yd per load' },
      flatbed_moffett: { hourly_rate: 150, min_fee: 400, capacity_label: '22 pallets / 22 totes' },
      hot_shot:        { hourly_rate: 95,  min_fee: 175, capacity_label: '4-10 pallets' },
      avg_speed_mph:   55,
      road_factor:     1.30,
      unload_hours:    0.5,
    };

    async function getTruckingRates() {
      try {
        const { data } = await db.from('sp_settings').select('value').eq('key', 'trucking_rates').single();
        if (data?.value) return { ...DEFAULT_TRUCK_RATES, ...data.value };
      } catch (_) { /* settings table missing → defaults */ }
      return DEFAULT_TRUCK_RATES;
    }

    // Loose match: caller may pass an item with sizeOption like "Truckload (22 pallets)"
    // or "9lb Bag" — we need format from the string.
    function inferFormat(rawKey) {
      const k = String(rawKey || '').toLowerCase();
      // Pallet truckloads need flatbed/hot-shot, not walking-floor bulk dump.
      if (k.includes('truckload') && k.includes('pallet')) return 'pallet';
      if (k.includes('truckload') || k.includes('bulk')) return 'bulk';
      if (k === '2-cy' || k.includes('cubic yard') || k.includes('cu yd') || k.includes(' cy ')) return 'bulk';
      if (k.includes('pallet') || k.includes('tote') || k.includes('supersack') || k.includes('super sack')) return 'pallet';
      return 'bag';
    }

    function walkingFloorLoads(items) {
      return Math.max(1, (items || []).reduce((sum, item) => {
        if (inferFormat(item.sizeOption || item.format || '') !== 'bulk') return sum;
        const unit = String(item.unit || item.sizeOption || item.format || '').toLowerCase();
        const quantity = Math.max(1, Number(item.quantity) || 1);
        const capacity = unit.includes('ton') ? 24 : 90;
        return sum + Math.max(1, Math.ceil(quantity / capacity));
      }, 0));
    }

    // Cart items shape: [{ sizeOption, quantity, ... }]
    function palletCountFromItem(item) {
      const key = String(item.sizeOption || item.format || '');
      const qty = Math.max(1, Number(item.quantity) || 1);
      const match = key.match(/(\d+)\s*pallets?/i);
      if (match) return Number(match[1]) * qty;
      if (inferFormat(key) === 'pallet') return qty;
      return 0;
    }

    function pickTruck(items, milesEstimate = 100) {
      const formats = items.map((i) => inferFormat(i.sizeOption || i.format || ''));
      const hasBulk = formats.includes('bulk');
      const palletQty = items.reduce((sum, i) => sum + palletCountFromItem(i), 0);

      if (hasBulk && palletQty === 0) {
        return { truck: 'walking_floor', split: null };
      }
      if (hasBulk && palletQty > 0) {
        // Mixed → return the heavier-cost truck (walking_floor) and flag a split.
        // UI will surface a "we'll split into two deliveries" notice.
        return { truck: 'walking_floor', split: 'mixed' };
      }
      if (palletQty <= 4 && milesEstimate < 200) {
        return { truck: 'hot_shot', split: null };
      }
      return { truck: 'flatbed_moffett', split: null };
    }

    function haversineMiles(a, b) {
      const toRad = (d) => (d * Math.PI) / 180;
      const R = 3958.7613; // Earth radius (mi)
      const dLat = toRad(b.lat - a.lat);
      const dLng = toRad(b.lng - a.lng);
      const sa = Math.sin(dLat / 2);
      const sb = Math.sin(dLng / 2);
      const h = sa * sa + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sb * sb;
      return 2 * R * Math.asin(Math.sqrt(h));
    }

    async function geocodeZip(zip) {
      // zippopotam.us is free, no key required, ~50ms typical latency
      const r = await fetch(`https://api.zippopotam.us/us/${encodeURIComponent(zip)}`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!r.ok) throw new Error(`ZIP ${zip} not found`);
      const j = await r.json();
      const place = j?.places?.[0];
      if (!place) throw new Error(`ZIP ${zip} not resolvable`);
      return { lat: Number(place.latitude), lng: Number(place.longitude), city: place['place name'], state: place['state abbreviation'] };
    }

    async function getOneWayDistance(originKey, destZip, rates) {
      // Cache lookup first
      try {
        const { data: cached } = await db
          .from('sp_trucking_distance_cache')
          .select('miles_one_way, hours_one_way')
          .eq('origin_key', originKey)
          .eq('dest_zip', destZip)
          .single();
        if (cached) {
          let city = null;
          let state = null;
          try {
            const place = await geocodeZip(destZip);
            city = place.city || null;
            state = place.state || null;
          } catch (_) { /* non-fatal */ }
          return { miles: Number(cached.miles_one_way), hours: Number(cached.hours_one_way), city, state, cached: true };
        }
      } catch (_) { /* miss */ }

      const yard = OSW_YARDS[originKey];
      if (!yard) throw new Error(`Unknown origin yard: ${originKey}`);
      const dest = await geocodeZip(destZip);
      const straightMiles = haversineMiles(yard, dest);
      const miles = +(straightMiles * (rates.road_factor || 1.3)).toFixed(1);
      const hours = +(miles / (rates.avg_speed_mph || 55)).toFixed(2);

      // Best-effort cache write
      try {
        await db.from('sp_trucking_distance_cache').upsert({
          origin_key: originKey,
          dest_zip: destZip,
          miles_one_way: miles,
          hours_one_way: hours,
          source: 'haversine',
          refreshed_at: new Date().toISOString(),
        }, { onConflict: 'origin_key,dest_zip' });
      } catch (_) {}

      return { miles, hours, city: dest.city, state: dest.state, cached: false };
    }

    async function pickClosestOrigin(destZip, rates) {
      // All customer deliveries dispatch from Congress plant.
      const congress = await getOneWayDistance('congress', destZip, rates);
      return { origin: 'congress', distance: congress };
    }

    async function quoteTrucking({ items, zip, roughAccess, originKey }) {
      const rates = await getTruckingRates();
      const { origin, distance } = originKey
        ? { origin: originKey, distance: await getOneWayDistance(originKey, zip, rates) }
        : await pickClosestOrigin(zip, rates);

      const { truck, split } = pickTruck(items || [], distance.miles);
      const truckRate = rates[truck];
      if (!truckRate) throw new Error(`No rate configured for truck ${truck}`);
      const palletSpots = (items || []).reduce((sum, item) => sum + palletCountFromItem(item), 0);
      const loadCount =
        truck === 'walking_floor'
          ? walkingFloorLoads(items || [])
          : Math.max(1, Math.ceil(palletSpots / 22));

      const roundTripHours = distance.hours * 2 + (rates.unload_hours || 0.5);
      const baseCost = roundTripHours * truckRate.hourly_rate;
      const accessModifier = roughAccess ? 1.2 : 1.0;
      const subtotal = Math.max(truckRate.min_fee, baseCost) * accessModifier * loadCount;
      const costCents = Math.round(subtotal * 100);

      return {
        truck,
        truckLabel: ({
          walking_floor: 'Walking-floor (bulk dump)',
          flatbed_moffett: 'Flatbed with onboard forklift',
          hot_shot: 'Hot-shot trailer',
        })[truck],
        originYard: origin,
        originLabel: OSW_YARDS[origin].label,
        milesRoundTrip: +(distance.miles * 2).toFixed(1),
        hoursRoundTrip: +roundTripHours.toFixed(2),
        accessModifier,
        costCents,
        costDollars: +(costCents / 100).toFixed(2),
        split,
        breakdown: {
          milesOneWay: distance.miles,
          hoursOneWay: distance.hours,
          unloadHours: rates.unload_hours || 0.5,
          hourlyRate: truckRate.hourly_rate,
          minFee: truckRate.min_fee,
          capacityLabel: truckRate.capacity_label,
          loadCount,
          destinationCity: distance.city,
          destinationState: distance.state,
          cached: distance.cached,
        },
      };
    }

    // GET /api/address/suggest?q=&zip= — Phoenix/AZ-biased street autocomplete (Nominatim)
    if (path === '/api/address/suggest' && req.method === 'GET') {
      try {
        const q = String(url.searchParams.get('q') || '').trim();
        const zipHint = String(url.searchParams.get('zip') || '').trim();
        if (q.length < 3) return res.json({ suggestions: [] });

        const PHOENIX = { lat: 33.4484, lng: -112.074, city: 'Phoenix', state: 'AZ' };
        let bias = PHOENIX;
        if (/^\d{5}$/.test(zipHint)) {
          try {
            const zr = await fetch(`https://api.zippopotam.us/us/${zipHint}`, { signal: AbortSignal.timeout(4000) });
            if (zr.ok) {
              const zj = await zr.json();
              const place = zj?.places?.[0];
              if (place) {
                bias = {
                  lat: Number(place.latitude),
                  lng: Number(place.longitude),
                  city: place['place name'] || 'Phoenix',
                  state: place['state abbreviation'] || 'AZ',
                };
              }
            }
          } catch (_) { /* keep Phoenix */ }
        }

        const alreadyScoped = /\b(az|arizona|phoenix)\b/i.test(q);
        const scopedQuery = alreadyScoped
          ? q
          : zipHint && bias.city
            ? `${q}, ${bias.city}, AZ`
            : `${q}, Phoenix, AZ`;

        const params = new URLSearchParams({
          q: scopedQuery,
          format: 'jsonv2',
          addressdetails: '1',
          countrycodes: 'us',
          limit: '6',
          viewbox: '-114.9,37.0,-109.0,31.3',
          bounded: '0',
        });
        const nr = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
          headers: {
            'User-Agent': 'OrganicSoilWholesale/1.0 (checkout address assist; info@soilseedandwater.com)',
            Accept: 'application/json',
          },
          signal: AbortSignal.timeout(6000),
        });
        if (!nr.ok) return res.status(502).json({ error: 'Address lookup unavailable', suggestions: [] });
        const rows = await nr.json();
        const suggestions = (Array.isArray(rows) ? rows : [])
          .map((row) => {
            const a = row.address || {};
            const number = (a.house_number || '').trim();
            const road = (a.road || a.pedestrian || a.residential || a.highway || '').trim();
            const street = number && road ? `${number} ${road}` : (road || number);
            const city = a.city || a.town || a.village || a.hamlet || a.municipality || a.county || '';
            const code = String(a.state_code || '').trim().toUpperCase();
            const stateName = String(a.state || '').trim().toLowerCase();
            const stateMap = { arizona: 'AZ', california: 'CA', nevada: 'NV', 'new mexico': 'NM', utah: 'UT', colorado: 'CO', texas: 'TX' };
            const state = /^[A-Z]{2}$/.test(code) ? code : (stateMap[stateName] || 'AZ');
            const zip = String(a.postcode || '').replace(/\D/g, '').slice(0, 5);
            if (!street || !city) return null;
            const lat = Number(row.lat);
            const lng = Number(row.lon);
            const dist = Number.isFinite(lat) && Number.isFinite(lng)
              ? (lat - bias.lat) ** 2 + (lng - bias.lng) ** 2
              : 99;
            const inAz = state === 'AZ' || /arizona/i.test(a.state || '');
            return {
              id: String(row.place_id ?? `${street}-${zip}`),
              label: [street, city, state, zip].filter(Boolean).join(', '),
              street, city, state: state || 'AZ', zip, _dist: dist, _inAz: inAz,
            };
          })
          .filter(Boolean)
          .sort((a, b) => (a._inAz !== b._inAz ? (a._inAz ? -1 : 1) : a._dist - b._dist))
          .slice(0, 5)
          .map(({ _dist, _inAz, ...rest }) => rest);

        return res.json({ suggestions, bias: { lat: bias.lat, lng: bias.lng, city: bias.city, zip: zipHint || null } });
      } catch (err) {
        console.error('[address/suggest]', err);
        return res.status(500).json({ error: 'Address lookup failed', suggestions: [] });
      }
    }

    // GET /api/address/zip/:zip — city/state for a ZIP
    if (path.startsWith('/api/address/zip/') && req.method === 'GET') {
      try {
        const zip = path.split('/').pop()?.replace(/\D/g, '').slice(0, 5);
        if (!zip || zip.length !== 5) return res.status(400).json({ error: 'Invalid ZIP' });
        const zr = await fetch(`https://api.zippopotam.us/us/${zip}`, { signal: AbortSignal.timeout(4000) });
        if (!zr.ok) return res.status(404).json({ error: 'ZIP not found' });
        const zj = await zr.json();
        const place = zj?.places?.[0];
        if (!place) return res.status(404).json({ error: 'ZIP not found' });
        return res.json({
          zip,
          city: place['place name'],
          state: place['state abbreviation'],
          lat: Number(place.latitude),
          lng: Number(place.longitude),
        });
      } catch (err) {
        console.error('[address/zip]', err);
        return res.status(500).json({ error: 'ZIP lookup failed' });
      }
    }

    // POST /api/quote/trucking — body { items: [{sizeOption, quantity}], zip, roughAccess?, originKey? }
    if (path === '/api/quote/trucking' && req.method === 'POST') {
      try {
        const { items, zip, roughAccess, originKey } = req.body || {};
        if (!zip || typeof zip !== 'string' || !/^\d{5}$/.test(zip.trim())) {
          return res.status(400).json({ error: 'A 5-digit ZIP is required' });
        }
        if (!Array.isArray(items) || items.length === 0) {
          return res.status(400).json({ error: 'items[] is required' });
        }
        const quote = await quoteTrucking({ items, zip: zip.trim(), roughAccess: !!roughAccess, originKey });
        res.setHeader('Cache-Control', 'public, s-maxage=900, stale-while-revalidate=3600');
        return res.json(quote);
      } catch (err) {
        console.error('[trucking quote]', err);
        return res.status(500).json({ error: err?.message || 'Failed to calculate trucking' });
      }
    }

    // GET /api/quote/trucking?zip=85308&truck=walking_floor — quick sanity check
    if (path === '/api/quote/trucking' && req.method === 'GET') {
      try {
        const zip = url.searchParams.get('zip');
        const truck = url.searchParams.get('truck') || 'walking_floor';
        const roughAccess = url.searchParams.get('rough') === '1';
        const originKey = url.searchParams.get('origin') || undefined;
        if (!zip || !/^\d{5}$/.test(zip)) {
          return res.status(400).json({ error: 'zip query param required (5 digits)' });
        }
        // Simulate one item with a sizeOption that maps to the requested truck
        const simulatedItem = truck === 'walking_floor'
          ? { sizeOption: 'Truckload', quantity: 1 }
          : truck === 'hot_shot'
            ? { sizeOption: 'Pallet of 1CF Bags', quantity: 2 }
            : { sizeOption: 'Pallet of 1CF Bags', quantity: 12 };
        const quote = await quoteTrucking({ items: [simulatedItem], zip, roughAccess, originKey });
        return res.json(quote);
      } catch (err) {
        return res.status(500).json({ error: err?.message || 'quote failed' });
      }
    }

    // ========== PAY & PICKUP CHECKOUT ==========

    // POST /api/checkout/webhook — Stripe webhook for OSW pay-and-pickup orders.
    // On `checkout.session.completed`: mark order paid, reserve inventory, send
    // confirmation emails, and forward to the MOS sales portal so yard reps see
    // the order in the iOS app.
    //
    // NOTE: Vercel's default body parser converts JSON before this handler runs,
    // so we can't byte-perfect verify the Stripe signature without a separate
    // function with bodyParser disabled. We attempt verification when possible
    // and otherwise trust the parsed event but require the Stripe-Signature
    // header to be present (basic anti-spam guard). To enforce strict verification,
    // move this handler to its own function with `export const config = { api: { bodyParser: false } }`.
    if (path === '/api/checkout/webhook' && req.method === 'POST') {
      try {
        const Stripe = (await import('stripe')).default;
        const stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY, {
          httpClient: Stripe.createFetchHttpClient(),
        });

        let event = req.body;
        const sig = req.headers['stripe-signature'];
        if (!sig) return res.status(400).json({ error: 'Missing Stripe-Signature header' });

        if (process.env.STRIPE_WEBHOOK_SECRET) {
          try {
            event = stripeClient.webhooks.constructEvent(
              typeof req.body === 'string' ? req.body : JSON.stringify(req.body),
              sig,
              process.env.STRIPE_WEBHOOK_SECRET
            );
          } catch (err) {
            console.warn('[checkout webhook] signature verification failed, trusting parsed body:', err?.message);
            event = req.body;
          }
        }

        if (!event || !event.type) return res.status(400).json({ error: 'Invalid event' });

        if (event.type === 'checkout.session.completed') {
          const session = event.data?.object;
          const orderId = parseInt(session?.metadata?.order_id || '0', 10);
          if (!orderId) return res.json({ received: true, note: 'no order_id in metadata' });

          // Skip if this is a deposit checkout — let /api/webhooks/stripe handle it.
          if (session?.metadata?.type === 'deposit') {
            return res.json({ received: true, note: 'deposit — handled elsewhere' });
          }

          await fulfillOswCheckoutOrder(orderId, session);
        } else if (event.type === 'payment_intent.payment_failed') {
          const pi = event.data?.object;
          const { data: order } = await db
            .from('orders')
            .select('id')
            .eq('stripe_payment_intent_id', pi?.id)
            .single();
          if (order) {
            await db.from('orders').update({
              payment_status: 'failed',
              status: 'payment_failed',
            }).eq('id', order.id);
          }
        }

        return res.json({ received: true });
      } catch (err) {
        console.error('[checkout webhook] error:', err);
        return res.status(500).json({ error: 'Webhook processing failed' });
      }
    }

    // POST /api/checkout/confirm-paid — client fallback when Stripe webhook is delayed/missed
    if (path === '/api/checkout/confirm-paid' && req.method === 'POST') {
      try {
        const { orderId, sessionId } = req.body || {};
        const id = parseInt(String(orderId || ''), 10);
        if (!id) return res.status(400).json({ error: 'orderId required' });

        const { data: order } = await db.from('orders').select('*').eq('id', id).single();
        if (!order) return res.status(404).json({ error: 'Order not found' });
        if (order.payment_status === 'paid') {
          return res.json({ ok: true, alreadyPaid: true });
        }

        const Stripe = (await import('stripe')).default;
        const stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY, {
          httpClient: Stripe.createFetchHttpClient(),
        });
        const sid = sessionId || order.stripe_checkout_session_id;
        if (!sid) return res.status(400).json({ error: 'No Stripe session for this order' });

        const session = await stripeClient.checkout.sessions.retrieve(String(sid));
        if (session.payment_status !== 'paid') {
          return res.json({ ok: false, pending: true, paymentStatus: session.payment_status });
        }

        const result = await fulfillOswCheckoutOrder(id, session);
        const monitorId = session?.metadata?.checkout_monitor_id;
        if (isCheckoutMonitorSessionId(monitorId)) {
          await safeRecordCheckoutEvent(db, {
            sessionId: monitorId,
            event: 'payment_completed',
            orderId: id,
            stripeSessionId: session.id,
            fulfillment: session?.metadata?.fulfillment_type,
          });
        }
        return res.json(result);
      } catch (err) {
        console.error('[checkout confirm-paid] error:', err?.message || err);
        return res.status(500).json({ error: 'Failed to confirm order payment' });
      }
    }

    // POST /api/checkout/create-session
    // Creates a draft order, then either (a) skips Stripe for free orders
    // (TEST discount code = 100% off) or (b) returns a Stripe Checkout URL.
    if (path === '/api/checkout/create-session' && req.method === 'POST') {
      const monitorSessionId = req.body?.monitorSessionId;
      try {
        const {
          items: rawItems, customerInfo, locationId, discountCode,
          fulfillmentType, deliveryAddress, deliveryQuote, pickupLocation, brand_id,
        } = req.body || {};
        const orderBrandId = brand_id === 'regenerative_landscaper_supply' ? brand_id : 'organic_soil_wholesale';
        let { pickupTime, pickupMode } = req.body || {};

        if (!Array.isArray(rawItems) || rawItems.length === 0) {
          return res.status(400).json({ error: 'No items to check out' });
        }

        const displayName = String(
          customerInfo?.company || customerInfo?.businessName || customerInfo?.name || '',
        ).trim();
        const checkoutPhone = String(customerInfo?.phone || '').trim();
        if (!displayName || !checkoutPhone) {
          return res.status(400).json({ error: 'Name and phone are required' });
        }

        if (isCheckoutMonitorSessionId(monitorSessionId)) {
          await safeRecordCheckoutEvent(db, {
            sessionId: monitorSessionId,
            event: 'payment_requested',
            fulfillment: fulfillmentType === 'delivery' ? 'delivery' : 'pickup',
            itemCount: rawItems.length,
            cartValue: rawItems.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 0), 0),
          });
        }

        const { applyFullFlatbedProductDiscount, requiresPickupHeadsUp } = await import('../shared/flatbedSpots.js');
        const {
          cartAllowsPhoenixYardPickup,
          PHOENIX_YARD_PICKUP_BLOCKED_MESSAGE,
        } = await import('../shared/phoenixYardPickup.js');
        let canonicalItems;
        try {
          canonicalItems = normalizeV5CheckoutItems(rawItems);
        } catch (pricingError) {
          return res.status(400).json({ error: pricingError.message || 'Unsupported product format' });
        }
        const flatbedPricing = applyFullFlatbedProductDiscount(canonicalItems);
        const items = flatbedPricing.items;

        const normalizedDiscount = typeof discountCode === 'string' ? discountCode.trim().toUpperCase() : null;
        const discountPercent = normalizedDiscount === 'TEST' ? 100 : 0;

        // ---- Delivery (optional). Re-quote server-side so client price can't be trusted. ----
        const isDelivery = fulfillmentType === 'delivery';
        let truckingQuote = null;

        if (!isDelivery) {
          const schedule = await getPickupSchedule();
          const pickupSite = (schedule.PICKUP_LOCATIONS || []).find((loc) => loc.locationId === locationId)
            || (schedule.PICKUP_LOCATIONS || []).find((loc) => typeof pickupLocation === 'string' && pickupLocation.toLowerCase().includes(loc.id))
            || (schedule.PICKUP_LOCATIONS || [])[0];
          const bulkPickupTons = items.reduce((sum, item) => {
            const size = String(item.sizeOption || item.format || '').toLowerCase();
            const unit = String(item.unit || '').toLowerCase();
            if (!size.includes('bulk')) return sum;
            const qty = Number(item.quantity || 0);
            return sum + (unit.includes('ton') || size.includes('ton') ? qty : qty * (schedule.TONS_PER_CU_YD || 0.675));
          }, 0);
          const isPhoenixBulkPickup = pickupSite?.id === 'phoenix' && bulkPickupTons > 0;
          if (pickupSite?.id === 'phoenix' && !cartAllowsPhoenixYardPickup(items)) {
            return res.status(400).json({ error: PHOENIX_YARD_PICKUP_BLOCKED_MESSAGE });
          }
          const hasBulkPickup = bulkPickupTons > 0;
          const needsHeadsUp = requiresPickupHeadsUp(items);
          const resolved = schedule.resolveCheckoutPickupTime({
            pickupMode,
            pickupTime,
            allowAsap: isPhoenixBulkPickup
              ? pickupSite?.bulkAllowAsap !== false
              : hasBulkPickup
                ? pickupSite?.bulkAllowAsap !== false
                : needsHeadsUp
                  ? false
                  : pickupSite?.allowAsap !== false,
            minLeadDays: isPhoenixBulkPickup ? pickupSite?.bulkMinLeadDays || 7 : pickupSite?.minLeadDays || 0,
          });
          if (!resolved.ok) {
            return res.status(400).json({ error: resolved.message });
          }
          pickupTime = resolved.pickupAtIso;
        }

        if (isDelivery) {
          if (!deliveryAddress?.zip || !/^\d{5}$/.test(String(deliveryAddress.zip).trim())) {
            return res.status(400).json({ error: 'Delivery ZIP is required (5 digits)' });
          }
          try {
            truckingQuote = await quoteTrucking({
              items,
              zip: String(deliveryAddress.zip).trim(),
              roughAccess: !!deliveryAddress?.roughAccess,
              originKey: deliveryAddress?.originKey,
            });
          } catch (err) {
            return res.status(400).json({ error: `Could not price delivery: ${err.message}` });
          }
        }

        const preferredDeliveryDate = isDelivery && typeof deliveryAddress?.preferredDate === 'string'
          ? deliveryAddress.preferredDate.trim()
          : '';
        const preferredDeliveryDateEnd = isDelivery && typeof deliveryAddress?.preferredDateEnd === 'string'
          ? deliveryAddress.preferredDateEnd.trim()
          : '';
        const preferredDeliveryWindow = isDelivery && typeof deliveryAddress?.preferredWindow === 'string'
          ? deliveryAddress.preferredWindow.trim()
          : '';
        const availabilityLabel = preferredDeliveryDate && preferredDeliveryDateEnd && preferredDeliveryDate !== preferredDeliveryDateEnd
          ? `${preferredDeliveryDate} → ${preferredDeliveryDateEnd}`
          : (preferredDeliveryDate || '');

        const customerNotes = [
          orderBrandId === 'regenerative_landscaper_supply' ? 'Source brand: Regenerative Landscaper Supply (regenerativelandscapersupply.com)' : null,
          customerInfo?.customerCategory ? `Customer type: ${customerInfo.customerCategory}` : null,
          customerInfo?.company ? `Company/farm: ${customerInfo.company}` : null,
          typeof customerInfo?.marketingOptIn === 'boolean' ? `Marketing contact list: ${customerInfo.marketingOptIn ? 'yes' : 'no'}` : null,
          normalizedDiscount && discountPercent > 0 ? `Discount applied: ${normalizedDiscount} (-${discountPercent}%)` : null,
          flatbedPricing.applied
            ? `Full flatbed (22 spots): 10% product discount (−$${flatbedPricing.discountAmount.toFixed(2)})`
            : null,
          isDelivery && deliveryAddress ? `Delivery to: ${[deliveryAddress.street, deliveryAddress.city, deliveryAddress.state, deliveryAddress.zip].filter(Boolean).join(', ')}` : null,
          isDelivery && truckingQuote ? `Delivery: ${truckingQuote.truckLabel}, ~${truckingQuote.hoursRoundTrip} hr round-trip from ${truckingQuote.originLabel} ($${truckingQuote.costDollars})` : null,
          isDelivery && availabilityLabel ? `Customer availability: ${availabilityLabel}${preferredDeliveryWindow ? ` · ${preferredDeliveryWindow}` : ''}` : null,
          deliveryAddress?.roughAccess ? 'Site access: hard-to-reach / off-pavement (+20% modifier applied)' : null,
          // Semi-truck access: only call out the negative case. Customer opted out
          // of the pre-checked semi-access question, so we MUST call before dispatch.
          isDelivery && deliveryAddress?.semiAccess === false ? 'SEMI-TRUCK ACCESS: customer says NOT enough room - call before dispatching.' : null,
          !isDelivery && pickupLocation ? `Pickup at: ${pickupLocation}` : null,
          items.some((item) => resolvePromoBundle(item))
            ? 'Includes already-priced Phoenix pickup garden bundle (no extra percent off that line).'
            : null,
          customerInfo?.notes ? `Customer notes: ${customerInfo.notes}` : null,
        ].filter(Boolean).join('\n');

        const checkoutLocationId = locationId || 1;

        const productSubtotalDollars = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        const truckingDollars = isDelivery && truckingQuote ? truckingQuote.costDollars : 0;
        const rawSubtotal = productSubtotalDollars + truckingDollars;
        const discountBase = discountPercent === 100
          ? rawSubtotal
          : nonBundleProductSubtotal(items);
        const totalDollars = Math.max(0, rawSubtotal - discountBase * (discountPercent / 100));
        const totalCents = Math.round(totalDollars * 100);
        const isFreeOrder = totalCents === 0 && discountPercent > 0;

        // Create order
        const orderData = {
          brand_id: orderBrandId,
          email: customerInfo?.email || null,
          phone: checkoutPhone,
          status: isFreeOrder ? 'paid' : 'pending_payment',
          payment_status: isFreeOrder ? 'paid' : 'pending',
          delivery_type: isDelivery ? 'delivery' : 'pickup',
          fulfillment_type: isDelivery ? 'delivery' : 'pickup',
          pickup_scheduled_at: isDelivery ? null : (pickupTime || null),
          subtotal: totalCents,
          total: totalCents,
          total_amount: totalDollars,
          location_id: checkoutLocationId,
          pickup_location: !isDelivery ? (pickupLocation || null) : null,
          customer_name: String(customerInfo?.name || '').trim() || displayName,
          customer_email: customerInfo?.email || null,
          // orders.business_name is NOT NULL — never insert null for residential checkouts
          business_name: displayName,
          order_type: isDelivery ? 'delivery' : 'pickup',
          notes: customerNotes || null,
          paid_at: isFreeOrder ? new Date().toISOString() : null,
          // Delivery / trucking columns (new). Safe to set when isDelivery is false too.
          trucking_fee_cents: isDelivery && truckingQuote ? truckingQuote.costCents : 0,
          delivery_truck_type: isDelivery && truckingQuote ? truckingQuote.truck : null,
          delivery_zip: isDelivery ? (deliveryAddress?.zip || null) : null,
          delivery_miles: isDelivery && truckingQuote ? truckingQuote.milesRoundTrip : null,
          delivery_hours: isDelivery && truckingQuote ? truckingQuote.hoursRoundTrip : null,
          access_modifier: isDelivery && truckingQuote ? truckingQuote.accessModifier : null,
          delivery_origin_yard: isDelivery && truckingQuote ? truckingQuote.originYard : null,
          address: isDelivery && deliveryAddress
            ? [deliveryAddress.street, deliveryAddress.city, deliveryAddress.state, deliveryAddress.zip].filter(Boolean).join(', ')
            : null,
          preferred_date: isDelivery && preferredDeliveryDate ? preferredDeliveryDate : null,
          preferred_time_start: isDelivery && preferredDeliveryWindow ? preferredDeliveryWindow : null,
          preferred_time_end: null,
          delivery_address_json: isDelivery && deliveryAddress
            ? {
                street: deliveryAddress.street || '',
                line1: deliveryAddress.street || '',
                city: deliveryAddress.city || '',
                state: deliveryAddress.state || 'AZ',
                zip: deliveryAddress.zip || '',
                roughAccess: !!deliveryAddress.roughAccess,
                semiAccess: deliveryAddress.semiAccess !== false,
                originKey: deliveryAddress.originKey || null,
                availabilityFrom: preferredDeliveryDate || null,
                availabilityTo: preferredDeliveryDateEnd || preferredDeliveryDate || null,
                preferredWindow: preferredDeliveryWindow || null,
                availabilityPreset: deliveryAddress.availabilityPreset || null,
              }
            : null,
          order_items: items.map((item) => ({
            product_id: item.productId,
            name: item.name,
            size: item.sizeOption,
            quantity: item.quantity,
            price: item.price,
            list_price: item.listUnitPrice ?? item.price,
            savings: (item.savingsPerUnit || 0) * item.quantity,
            discount_percent: item.discountPercent || 0,
            units_per_pallet: item.unitsPerPallet || null,
            total: item.price * item.quantity,
          })),
        };

        const { data: order, error: orderError } = await db
          .from('orders')
          .insert(orderData)
          .select()
          .single();

        if (orderError) {
          console.error('Order insert error:', orderError);
          return res.status(500).json({ error: 'Failed to create order' });
        }

        if (isCheckoutMonitorSessionId(monitorSessionId)) {
          await safeRecordCheckoutEvent(db, {
            sessionId: monitorSessionId,
            event: 'payment_requested',
            orderId: order.id,
            fulfillment: isDelivery ? 'delivery' : 'pickup',
            itemCount: items.length,
            cartValue: totalDollars,
          });
        }

        const orderItems = items.map((item) => ({
          order_id: order.id,
          product_id: item.productId,
          quantity: item.quantity,
          unit_price: item.price,
          total_price: item.price * item.quantity,
          size_option: item.sizeOption,
          status: isFreeOrder ? 'reserved' : 'pending',
        }));

        const { error: itemsError } = await db.from('order_items').insert(orderItems);
        if (itemsError) console.error('order_items insert error:', itemsError);

        if (isFreeOrder) {
          // Fan out to MOS so yard reps see the test order in the iOS portal.
          try {
            const freeOrderPickupLabel = !isDelivery && pickupTime
              ? await formatPickupReadyLabel(pickupTime)
              : undefined;
            await forwardOswPickupToMos({
              osw_order_id: order.id,
              osw_order_number: order.order_number || undefined,
              customer_name: customerInfo?.name || customerInfo?.company || 'Test Customer',
              customer_phone: customerInfo?.phone || '',
              customer_email: customerInfo?.email || undefined,
              items: items.map((item) => ({
                product_id: item.productId,
                product_name: item.name,
                size_option: item.sizeOption || '',
                quantity: item.quantity || 1,
                unit_price_cents: Math.round((item.price || 0) * 100),
                total_price_cents: Math.round((item.price || 0) * (item.quantity || 1) * 100),
              })),
              // pickup-shape fields
              pickup_at: isDelivery ? null : (pickupTime || new Date().toISOString()),
              slot_label: freeOrderPickupLabel,
              // delivery-shape fields
              fulfillment_type: isDelivery ? 'delivery' : 'pickup',
              delivery_address: isDelivery ? orderData.delivery_address_json : null,
              truck_type: isDelivery && truckingQuote ? truckingQuote.truck : null,
              origin_yard: isDelivery && truckingQuote ? truckingQuote.originYard : null,
              miles_round_trip: isDelivery && truckingQuote ? truckingQuote.milesRoundTrip : null,
              hours_round_trip: isDelivery && truckingQuote ? truckingQuote.hoursRoundTrip : null,
              trucking_fee_cents: isDelivery && truckingQuote ? truckingQuote.costCents : 0,
              total_cents: 0,
              payment_status: 'paid',
              source: isDelivery ? 'osw_pay_delivery' : 'osw_pay_pickup',
            });
            if (!isDelivery) {
              await sendNewPickupOrderAlerts({
                order: { ...order, pickup_location: pickupLocation, location_id: checkoutLocationId },
                orderItems: items,
                pickupLabel: freeOrderPickupLabel,
                locationId: checkoutLocationId,
              });
            }
          } catch (e) {
            console.error('[free-order MOS forward] failed:', e?.message || e);
          }

          if (isDelivery) {
            try {
              const { createDeliveryWorkOrderFromOswOrder } = await import('../shared/oswDeliveryIntake.js');
              await createDeliveryWorkOrderFromOswOrder(order.id);
            } catch (e) {
              console.error('[free-order delivery intake] failed:', e?.message || e);
            }
          }

          if (isCheckoutMonitorSessionId(monitorSessionId)) {
            await safeRecordCheckoutEvent(db, {
              sessionId: monitorSessionId,
              event: 'payment_completed',
              orderId: order.id,
              fulfillment: isDelivery ? 'delivery' : 'pickup',
              itemCount: items.length,
              cartValue: 0,
            });
          }

          return res.json({
            free: true,
            orderId: order.id,
            confirmationCode: order.confirmation_code,
            url: null,
          });
        }

        // Stripe path. Use fetch-based HTTP client — the default Node http
        // transport occasionally fails with "connection retried" inside Vercel
        // serverless functions; fetch is the supported workaround.
        const Stripe = (await import('stripe')).default;
        const stripeKey = process.env.STRIPE_SECRET_KEY;
        if (!stripeKey) {
          return res.status(500).json({ error: 'Stripe is not configured on the server' });
        }
        const stripeClient = new Stripe(stripeKey, {
          httpClient: Stripe.createFetchHttpClient(),
          maxNetworkRetries: 2,
        });

        const origin =
          (req.headers.origin) ||
          (req.headers.referer && req.headers.referer.replace(/(https?:\/\/[^/]+).*/, '$1')) ||
          'https://organicsoilwholesale.com';

        const absolutizeImage = (urlStr) => {
          if (!urlStr) return null;
          if (/^https?:\/\//i.test(urlStr)) return urlStr;
          return `${origin.replace(/\/$/, '')}${urlStr.startsWith('/') ? '' : '/'}${urlStr}`;
        };

        const lineItems = items.map((item) => {
          const img = absolutizeImage(item.imageUrl);
          return {
            price_data: {
              currency: 'usd',
              product_data: {
                name: item.name,
                description: item.sizeOption,
                ...(img ? { images: [img] } : {}),
              },
              unit_amount: Math.round(item.price * 100),
            },
            quantity: item.quantity,
          };
        });

        // Delivery shows as its own line item so the customer sees the cost transparently.
        if (isDelivery && truckingQuote && truckingQuote.costCents > 0) {
          lineItems.push({
            price_data: {
              currency: 'usd',
              product_data: {
                name: 'Delivery',
                description: `${truckingQuote.truckLabel} • ${truckingQuote.hoursRoundTrip} hr round-trip from ${truckingQuote.originLabel}${deliveryAddress?.roughAccess ? ' • rough-access site' : ''}`,
              },
              unit_amount: truckingQuote.costCents,
            },
            quantity: 1,
          });
        }

        const session = await stripeClient.checkout.sessions.create({
          payment_method_types: ['card'],
          line_items: lineItems,
          mode: 'payment',
          success_url: `${origin}/order-confirmation?session_id={CHECKOUT_SESSION_ID}&order_id=${order.id}`,
          cancel_url: `${origin}/checkout?canceled=true${isCheckoutMonitorSessionId(monitorSessionId) ? `&monitor_id=${encodeURIComponent(monitorSessionId)}` : ''}`,
          metadata: {
            order_id: String(order.id),
            brand_id: orderBrandId,
            checkout_monitor_id: isCheckoutMonitorSessionId(monitorSessionId) ? monitorSessionId : '',
            pickup_time: pickupTime || '',
            fulfillment_type: isDelivery ? 'delivery' : 'pickup',
            preferred_delivery_date: isDelivery ? preferredDeliveryDate : '',
            preferred_delivery_date_end: isDelivery ? preferredDeliveryDateEnd : '',
            preferred_delivery_window: isDelivery ? preferredDeliveryWindow : '',
            customer_type: customerInfo?.customerCategory || '',
            company: customerInfo?.company || '',
          },
          payment_intent_data: {
            metadata: {
              order_id: String(order.id),
              brand_id: orderBrandId,
              checkout_monitor_id: isCheckoutMonitorSessionId(monitorSessionId) ? monitorSessionId : '',
              fulfillment_type: isDelivery ? 'delivery' : 'pickup',
            },
          },
          customer_email: customerInfo?.email || undefined,
        });

        await db
          .from('orders')
          .update({ stripe_checkout_session_id: session.id })
          .eq('id', order.id);

        if (isCheckoutMonitorSessionId(monitorSessionId)) {
          await safeRecordCheckoutEvent(db, {
            sessionId: monitorSessionId,
            event: 'stripe_redirect',
            orderId: order.id,
            stripeSessionId: session.id,
            fulfillment: isDelivery ? 'delivery' : 'pickup',
            itemCount: items.length,
            cartValue: totalDollars,
          });
        }

        return res.json({
          sessionId: session.id,
          orderId: order.id,
          confirmationCode: order.confirmation_code,
          url: session.url,
        });
      } catch (err) {
        console.error('Checkout error:', err);
        if (isCheckoutMonitorSessionId(monitorSessionId)) {
          try {
            const monitor = await safeRecordCheckoutEvent(db, {
              sessionId: monitorSessionId,
              event: 'checkout_error',
              errorCode: err?.type || err?.code || 'checkout_session_error',
              errorMessage: err?.message || 'Failed to create checkout session',
            });
            await notifyCheckoutIssue(
              db,
              monitor,
              'Checkout could not start',
              'A customer could not reach Stripe Checkout',
              monitor?.error_message || err?.message,
            );
          } catch (monitorError) {
            console.error('[checkout monitor] could not record create-session failure:', monitorError?.message || monitorError);
          }
        }
        return res.status(500).json({ error: err.message || 'Failed to create checkout session' });
      }
    }

    // 404 — alert admin only when a real submission (POST/PUT/PATCH) hits a
    // missing route (i.e. a broken input), not GET noise from bots/crawlers.
    if (shouldAlertUnmatchedInput(path, req.method)) {
      await reportFailure({ kind: 'unmatched_input', path, method: req.method, status: 404, message: 'No prod route for this input' });
    }
    return res.status(404).json({ error: 'API endpoint not found', path });
  } catch (error) {
    if (isLeadSubmission) {
      console.error(JSON.stringify({ event: 'lead_submission_failed', requestId, status: 500, reason: 'unhandled', durationMs: Date.now() - startedAt }), error);
      return res.status(500).json({ error: 'Failed to process lead', requestId });
    }
    console.error('API error:', error);
    await reportFailure({ kind: 'server_error', path, method: req.method, status: 500, message: error?.message || String(error) });
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
