/**
 * Soil Seed & Water mail must leave from a mailbox on the verified
 * bettersystems.ai domain. soilseedandwater.com is not verified on the
 * Resend team that owns RESEND_API_KEY, so any From address on that domain
 * is rewritten onto SSW_EMAIL_FROM_ADDRESS before send.
 *
 * SSW_EMAIL_FROM_ADDRESS (env) may replace the mailbox. A value on
 * soilseedandwater.com is ignored. Per-feature from env vars are accepted
 * only when their address is not on soilseedandwater.com.
 */

export const SSW_EMAIL_FROM_ADDRESS = 'soilseedandwater@bettersystems.ai';
export const SSW_EMAIL_REPLY_TO = 'info@soilseedandwater.com';
export const SSW_BUSINESS_CARD_FROM_NAME = 'Rodo Alvarez – Soil Seed & Water';

const BLOCKED_DOMAIN = 'soilseedandwater.com';

function cleanDisplayName(value) {
  return String(value || '').replace(/[\r\n<>"]/g, '').trim();
}

export function extractEmailAddress(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  const angled = text.match(/<([^<>]+)>/);
  const candidate = (angled ? angled[1] : text).trim().replace(/^mailto:/i, '');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate)) return '';
  return candidate;
}

export function extractDisplayName(value) {
  const text = String(value || '').trim();
  const angled = text.match(/^(.*)<[^<>]+>\s*$/);
  if (!angled) return '';
  return cleanDisplayName(angled[1].replace(/^['"]|['"]$/g, ''));
}

export function isBlockedSenderAddress(value) {
  const email = extractEmailAddress(value) || String(value || '').trim();
  const at = email.lastIndexOf('@');
  if (at < 0) return false;
  return email.slice(at + 1).toLowerCase() === BLOCKED_DOMAIN;
}

function defaultEnv() {
  return (typeof process !== 'undefined' && process.env) || {};
}

export function getSswEmailFromAddress(env = defaultEnv()) {
  const raw = String(env?.SSW_EMAIL_FROM_ADDRESS || '').trim();
  const address = extractEmailAddress(raw) || raw;
  if (address && address.includes('@') && !isBlockedSenderAddress(address) && !/[\s<>]/.test(address)) {
    return address;
  }
  return SSW_EMAIL_FROM_ADDRESS;
}

export function sswFrom(displayName, env = defaultEnv()) {
  const name = cleanDisplayName(displayName);
  const address = getSswEmailFromAddress(env);
  return name ? `${name} <${address}>` : address;
}

/**
 * Resolve the From header that will actually be sent.
 * An address on soilseedandwater.com (including one stored as a campaign
 * from_address or set in CHECKOUT_ALERT_FROM and the other per-feature env
 * vars) falls back to the central mailbox and fallbackDisplayName.
 * A candidate whose address is on any other domain is kept, including its
 * display name.
 */
export function resolveSswFrom(candidate, fallbackDisplayName = 'Soil Seed & Water', env = defaultEnv()) {
  const address = extractEmailAddress(candidate);
  if (address && !isBlockedSenderAddress(address)) {
    const displayName = extractDisplayName(candidate) || cleanDisplayName(fallbackDisplayName);
    return displayName ? `${displayName} <${address}>` : address;
  }
  return sswFrom(fallbackDisplayName, env);
}

/** Fill a missing reply-to. Existing reply-to values are left alone. */
export function withSswReplyTo(payload, replyTo = SSW_EMAIL_REPLY_TO) {
  const next = { ...payload, from: resolveSswFrom(payload?.from, extractDisplayName(payload?.from) || 'Soil Seed & Water') };
  if (!next.replyTo && !next.reply_to && replyTo) next.replyTo = replyTo;
  return next;
}

/**
 * Last line of defense for Resend SDK clients. Rewrites a blocked From
 * and adds info@soilseedandwater.com only when the payload has no reply-to.
 */
export function guardResend(client) {
  if (!client?.emails?.send || client.emails.send.__sswGuarded) return client;
  const original = client.emails.send.bind(client.emails);
  const send = (payload, options) => original(withSswReplyTo(payload), options);
  send.__sswGuarded = true;
  client.emails.send = send;
  return client;
}
