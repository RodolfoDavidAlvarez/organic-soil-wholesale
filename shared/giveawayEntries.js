/**
 * Phoenix Fall Garden Giveaway (/win) entry validation and persistence.
 *
 * The October 3, 2026 drawing is complete. This campaign is permanently
 * closed to public entries, including from previously loaded browser tabs.
 */

export const GIVEAWAY_SOURCE = 'win-giveaway';
export const GIVEAWAY_CAMPAIGN_KEY = 'phoenix-fall-garden-2026';
export const GIVEAWAY_ENTRIES_CLOSED_MESSAGE = 'This giveaway has ended. Keep growing with us at /keep-growing for future giveaways and updates.';
export const GIVEAWAY_FOLLOW_COPY = 'Follow at least one account — tap Follow, then check the box.';

export const GIVEAWAY_CUSTOMER_TYPES = Object.freeze([
  ['homeowner', 'Homeowner'],
  ['landscaper', 'Landscaper'],
  ['specialty-farmer', 'Farmer / agriculture'],
  ['garden-professional', 'Garden professional'],
]);

export const GIVEAWAY_GARDEN_STATUSES = Object.freeze([
  ['new-to-gardening', 'I’m new to gardening'],
  ['brand-new', 'Starting a new garden'],
  ['existing', 'Improving an existing garden'],
]);

export const GIVEAWAY_GROWING_OPTIONS = Object.freeze([
  ['food-garden', 'Food garden'],
  ['turf', 'Turf/grass'],
  ['ornamentals', 'Ornamentals'],
  ['trees', 'Trees'],
  ['citrus-avocado', 'Citrus/avocado'],
  ['palms', 'Palms'],
  ['roses', 'Roses'],
  ['succulents', 'Succulents'],
  ['indoor-plants', 'Indoor plants'],
]);

export const GIVEAWAY_SOCIAL_CHANNELS = Object.freeze([
  {
    key: 'ig',
    column: 'followed_ig',
    label: 'Instagram @soilseedandwater',
    url: 'https://www.instagram.com/soilseedandwater/',
  },
  {
    key: 'fb',
    column: 'followed_fb',
    label: 'Facebook Soil Seed and Water',
    url: 'https://www.facebook.com/soilseedandwater',
  },
  {
    key: 'yt',
    column: 'followed_yt',
    label: 'YouTube @soilseedwater',
    url: 'https://www.youtube.com/@soilseedwater',
  },
]);

const CUSTOMER_TYPE_VALUES = new Set(GIVEAWAY_CUSTOMER_TYPES.map(([value]) => value));
const GARDEN_STATUS_VALUES = new Set(GIVEAWAY_GARDEN_STATUSES.map(([value]) => value));
const GROWING_VALUES = new Set(GIVEAWAY_GROWING_OPTIONS.map(([value]) => value));
const SOCIAL_KEYS = GIVEAWAY_SOCIAL_CHANNELS.map((channel) => channel.key);

// An old deployment environment flag must never reopen the completed draw.
export function areGiveawayEntriesOpen(_env) {
  return false;
}

function trimText(value, max) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

export function normalizeGiveawayZip(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length === 5) return digits;
  if (digits.length === 9) return `${digits.slice(0, 5)}-${digits.slice(5)}`;
  return null;
}

export function normalizeGiveawayGrowing(value) {
  const raw = Array.isArray(value) ? value : typeof value === 'string' && value ? [value] : [];
  const unique = [];
  for (const item of raw) {
    const key = String(item || '').trim();
    if (!GROWING_VALUES.has(key) || unique.includes(key)) continue;
    unique.push(key);
  }
  return unique;
}

function readFollowed(input = {}) {
  const nested = input.followed && typeof input.followed === 'object' ? input.followed : {};
  const followed = {};
  for (const key of SOCIAL_KEYS) {
    const column = GIVEAWAY_SOCIAL_CHANNELS.find((channel) => channel.key === key)?.column;
    followed[key] = nested[key] === true
      || input[key] === true
      || input[column] === true
      || input[`followed_${key}`] === true
      || input[`followed${key.charAt(0).toUpperCase()}${key.slice(1)}`] === true;
  }
  return followed;
}

export function normalizeGiveawayEntry(input = {}, extras = {}) {
  const email = String(input.email || '').trim().toLowerCase().slice(0, 254);
  const source = trimText(input.source, 80) || GIVEAWAY_SOURCE;
  const rawCustomerTypes = Array.isArray(input.customerTypes)
    ? input.customerTypes
    : [input.customerType || input.customerCategory].filter(Boolean);
  const customerTypes = [...new Set(rawCustomerTypes.map((value) => String(value || '').trim()))]
    .filter((value) => CUSTOMER_TYPE_VALUES.has(value))
    .slice(0, 4);
  return {
    fullName: trimText(input.fullName || input.name, 120),
    email,
    phone: trimText(input.phone, 30),
    zipCode: normalizeGiveawayZip(input.zipCode || input.zip),
    customerTypes,
    gardenStatus: String(input.gardenStatus || '').trim(),
    growing: normalizeGiveawayGrowing(input.growing),
    growingOther: trimText(input.growingOther || input.growing_other, 80) || null,
    notes: trimText(input.notes, 500) || null,
    emailConsent: input.emailConsent === true || input.consent === true,
    rulesConsent: input.rulesConsent === true || input.officialRules === true,
    followed: readFollowed(input),
    source,
    attributionSource: trimText(input.attributionSource || input.attribution_source, 80) || 'direct',
    utmSource: trimText(input.utmSource || input.utm_source, 100) || null,
    utmMedium: trimText(input.utmMedium || input.utm_medium, 100) || null,
    utmCampaign: trimText(input.utmCampaign || input.utm_campaign, 140) || null,
    utmContent: trimText(input.utmContent || input.utm_content, 140) || null,
    website: String(input.website || '').trim(),
    userAgent: trimText(extras.userAgent || input.userAgent || input.user_agent, 400),
  };
}

function missingFollows(followed) {
  return SOCIAL_KEYS.filter((key) => !followed[key]);
}

export function validateGiveawayEntry(input = {}, extras = {}) {
  const entry = normalizeGiveawayEntry(input, extras);
  if (entry.website) return { ok: true, bot: true, entry };
  if (entry.fullName.length < 2) return { ok: false, error: 'Please enter your full name.' };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(entry.email)) {
    return { ok: false, error: 'Please enter a valid email address.' };
  }
  if (entry.phone.replace(/\D/g, '').length < 10) {
    return { ok: false, error: 'Please enter a valid phone number.' };
  }
  if (!entry.zipCode) return { ok: false, error: 'Please enter a valid US ZIP code.' };
  if (!entry.customerTypes.length) {
    return { ok: false, error: 'Please tell us who you are.' };
  }
  if (!GARDEN_STATUS_VALUES.has(entry.gardenStatus)) {
    return { ok: false, error: 'Please tell us if this is a brand new or existing garden.' };
  }
  if (!entry.growing.length) return { ok: false, error: 'Please tell us what you are growing.' };
  if (!entry.emailConsent) {
    return { ok: false, error: 'Please confirm we may email you if you win and about this giveaway.' };
  }
  if (!entry.rulesConsent) {
    return { ok: false, error: 'Please confirm you are eligible and agree to the official rules.' };
  }
  if (missingFollows(entry.followed).length === SOCIAL_KEYS.length) {
    return { ok: false, error: 'Please follow at least one account, then check the box.' };
  }
  return { ok: true, bot: false, entry };
}

export function giveawayEntryRow(entry, { now = new Date(), isPreview = false } = {}) {
  const timestamp = now instanceof Date ? now.toISOString() : now;
  const legacyCustomerType = entry.customerTypes.includes('homeowner')
    ? 'homeowner'
    : entry.customerTypes.includes('landscaper')
      ? 'landscaper'
      : 'specialty-farmer';
  const customerTypeNote = `Customer types: ${entry.customerTypes.join(', ')}`;
  return {
    source: entry.source || GIVEAWAY_SOURCE,
    campaign_key: GIVEAWAY_CAMPAIGN_KEY,
    attribution_source: entry.attributionSource || 'direct',
    utm_source: entry.utmSource,
    utm_medium: entry.utmMedium,
    utm_campaign: entry.utmCampaign,
    utm_content: entry.utmContent,
    is_preview: isPreview === true,
    full_name: entry.fullName,
    email: entry.email,
    email_normalized: entry.email,
    phone: entry.phone,
    zip_code: entry.zipCode,
    customer_type: legacyCustomerType,
    garden_status: entry.gardenStatus === 'new-to-gardening' ? 'brand-new' : entry.gardenStatus,
    growing: entry.growing,
    growing_other: entry.growingOther,
    notes: entry.notes ? `${customerTypeNote}\n${entry.notes}` : customerTypeNote,
    email_consent: entry.emailConsent === true,
    rules_consent: entry.rulesConsent === true,
    followed_ig: entry.followed?.ig === true,
    followed_fb: entry.followed?.fb === true,
    followed_yt: entry.followed?.yt === true,
    followed_tt: entry.followed?.tt === true,
    user_agent: entry.userAgent || null,
    created_at: timestamp,
    updated_at: timestamp,
  };
}

export async function saveGiveawayEntry({ db, entry, now = new Date() }) {
  const row = giveawayEntryRow(entry, { now, isPreview: false });
  const { data: existing, error: existingError } = await db
    .from('sp_giveaway_entries')
    .select('id, created_at')
    .eq('source', row.source)
    .eq('email_normalized', row.email_normalized)
    .eq('is_preview', false)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing) return { created: false, entry: existing };

  const { data, error } = await db
    .from('sp_giveaway_entries')
    .insert(row)
    .select('id, created_at')
    .single();
  if (error) {
    if (error.code === '23505') return { created: false, entry: { id: null, created_at: null } };
    throw error;
  }
  return { created: true, entry: data };
}

export async function processGiveawayEntry({
  db,
  body,
  userAgent = '',
  env,
  now = new Date(),
} = {}) {
  const entriesOpen = areGiveawayEntriesOpen(env);
  const normalized = normalizeGiveawayEntry(body || {}, { userAgent });
  if (normalized.website) return { status: 200, json: { success: true } };

  if (!entriesOpen) {
    return {
      status: 403,
      json: {
        success: false,
        error: GIVEAWAY_ENTRIES_CLOSED_MESSAGE,
        entriesOpen: false,
      },
    };
  }

  const validation = validateGiveawayEntry(body || {}, { userAgent });
  if (!validation.ok) return { status: 400, json: { error: validation.error } };

  const result = await saveGiveawayEntry({ db, entry: validation.entry, now });
  return {
    status: result.created ? 201 : 200,
    json: {
      success: true,
      entryId: result.entry?.id || null,
      alreadyEntered: !result.created,
      message: result.created
        ? 'Your giveaway entry is saved.'
        : 'This email already has one entry.',
    },
  };
}
