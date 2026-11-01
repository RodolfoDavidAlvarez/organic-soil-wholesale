import QRCode from 'qrcode';

export const RECEIPT_PUBLIC_ORIGIN = 'https://myorganicsoil.com';

export function normalizeReceiptRef(value) {
  const raw = String(value || '').trim().replace(/\.png$/i, '');
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    decoded = raw;
  }
  return decoded.replace(/[^A-Za-z0-9._-]/g, '').slice(0, 80);
}

export function receiptLookupUrl(orderRef) {
  const ref = normalizeReceiptRef(orderRef);
  if (!ref) return RECEIPT_PUBLIC_ORIGIN;
  return `${RECEIPT_PUBLIC_ORIGIN}/o/${encodeURIComponent(ref)}`;
}

export function receiptQrImageUrl(orderRef, origin = 'https://www.organicsoilwholesale.com') {
  const ref = normalizeReceiptRef(orderRef);
  if (!ref) return '';
  return `${origin}/api/public/receipt-qr/${encodeURIComponent(ref)}.png`;
}

export async function renderReceiptQrPng(orderRef) {
  return QRCode.toBuffer(receiptLookupUrl(orderRef), {
    type: 'png',
    width: 336,
    margin: 2,
    errorCorrectionLevel: 'M',
    color: { dark: '#1b2620', light: '#ffffff' },
  });
}
