import { escapeHtml, normalizeCouponGreetingName } from './wormCastingsCampaign.js';
import { normalizeSswNumber } from './sswNumber.js';

export const PURCHASE_THANK_YOU_FROM = 'Soil Seed & Water <info@soilseedandwater.com>';

export function buildPurchaseThankYouEmail({
  fullName,
  customerNumber,
  pickupLabel,
  location,
  brandName,
  orderNumber,
  qrImageUrl,
} = {}) {
  const customerBrand = brandName || 'Soil Seed and Water';
  const isRlsBrand = brandName === 'Regenerative Landscaper Supply';
  const name = escapeHtml(normalizeCouponGreetingName(fullName));
  const number = escapeHtml(normalizeSswNumber(customerNumber) || String(customerNumber || '').trim());
  const ready = escapeHtml(String(pickupLabel || '').trim());
  const yard = escapeHtml(String(location || '1634 N 19th Ave, Phoenix, AZ 85009').trim());
  const numberBlock = number
    ? `<tr><td style="padding:26px 28px;background:#264027;text-align:center;">
    <p style="margin:0 0 8px;color:#f1d6a6;font-size:12px;font-weight:700;letter-spacing:1.7px;text-transform:uppercase;">Your number</p>
    <p style="margin:0;color:#fff;font-size:42px;line-height:1.1;font-weight:800;letter-spacing:2px;">${number}</p>
    <p style="margin:12px auto 0;max-width:420px;color:#dce8d8;font-size:16px;line-height:1.5;">Call (623) 263-3386 with this number and we will pull you up.</p>
    <p style="margin:12px 0 0;"><a href="tel:+16232633386" style="color:#fff;font-size:18px;font-weight:800;text-decoration:none;">(623) 263-3386</a></p>
  </td></tr>`
    : '';
  const pickupBlock = `<tr><td style="padding:24px 28px;text-align:center;">
    <p style="margin:0;color:#3f4d40;font-size:15px;line-height:1.65;">Your order is confirmed.${ready ? `<br><strong>Estimated ready:</strong> ${ready}` : ''}<br><strong>Location:</strong> ${yard}</p>
  </td></tr>`;
  const safeOrderNumber = escapeHtml(String(orderNumber || '').trim());
  const safeQr = escapeHtml(String(qrImageUrl || '').trim());
  const qrBlock = safeOrderNumber && safeQr
    ? `<tr><td style="padding:8px 28px 28px;text-align:center;">
    <p style="margin:0 0 12px;color:#96703f;font-size:12px;font-weight:700;letter-spacing:1.7px;text-transform:uppercase;">Show this at pickup</p>
    <img src="${safeQr}" alt="Order receipt QR" width="168" height="168" style="display:inline-block;width:168px;height:168px;border:1px solid #ded8ca;border-radius:12px;background:#fff">
    <p style="margin:12px 0 0;color:#3f4d40;font-size:14px;">Order ${safeOrderNumber}</p>
  </td></tr>`
    : '';

  return {
    subject: number ? `Thank you. Your ${customerBrand} number is ${number}` : `Thank you for buying from ${customerBrand}`,
    from: isRlsBrand ? 'Regenerative Landscaper Supply <info@soilseedandwater.com>' : PURCHASE_THANK_YOU_FROM,
    html: `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Thank you for buying</title></head>
<body style="margin:0;background:#264027;font-family:Arial,Helvetica,sans-serif;color:#263527;">
<div style="display:none;max-height:0;overflow:hidden;">Thank you for buying. Keep this number handy when you call us.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#264027;"><tr><td align="center" style="padding:28px 12px;">
<table role="presentation" width="620" cellpadding="0" cellspacing="0" style="max-width:620px;width:100%;background:#fff;border-radius:16px;overflow:hidden;">
  <tr><td style="background:#f7f3e5;padding:32px 28px 22px;text-align:center;">
    <p style="margin:0 0 10px;color:#96703f;font-size:12px;font-weight:700;letter-spacing:1.7px;text-transform:uppercase;">${customerBrand}</p>
    <h1 style="margin:0;color:#264027;font-size:31px;line-height:1.16;">Thank you for buying</h1>
    <p style="margin:14px auto 0;max-width:480px;color:#4d5c4d;font-size:16px;line-height:1.55;">Hi ${name}, here is your customer number. Call us with it and we will pull you up.</p>
  </td></tr>
  ${numberBlock}
  ${pickupBlock}
  ${qrBlock}
  <tr><td style="padding:22px 28px;background:#264027;text-align:center;color:#dce8d8;font-size:12px;line-height:1.6;">Questions? (623) 263-3386 &nbsp;·&nbsp; ${isRlsBrand ? 'Fulfilled by Organic Soil Wholesale · Soil Seed &amp; Water' : 'Soil Seed &amp; Water'}</td></tr>
</table></td></tr></table></body></html>`,
  };
}
