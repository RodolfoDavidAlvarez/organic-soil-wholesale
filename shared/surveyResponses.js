import { randomBytes } from 'node:crypto';
import {
  GARDEN_CLASS_EVENT_KEY,
  GARDEN_CLASS_SURVEY_SOURCE,
  SURVEY_KIND_GARDEN_CLASS,
  SURVEY_KIND_PURCHASE,
  SURVEY_SOURCE,
  isGardenClassSurveySource,
  normalizeSurveyKindFilter,
  normalizeSurveySource,
  readGardenClassSurveyPrefill,
  readSurveyPrefill,
  surveyKindFromSource,
} from './surveySources.js';

export {
  GARDEN_CLASS_EVENT_KEY,
  GARDEN_CLASS_SURVEY_SOURCE,
  SURVEY_KIND_GARDEN_CLASS,
  SURVEY_KIND_PURCHASE,
  SURVEY_SOURCE,
  isGardenClassSurveySource,
  normalizeSurveyKindFilter,
  normalizeSurveySource,
  readGardenClassSurveyPrefill,
  readSurveyPrefill,
  surveyKindFromSource,
};

export const SURVEY_COUPON_LABEL = 'SSW survey thank-you';
export const SURVEY_COUPON_OFFER = '30% off one item, one time, Phoenix yard pickup.';
export const SURVEY_COUPON_RESTRICTIONS =
  'Not the whole ticket. Not delivery. Not already-discounted workshop pallets.';
export const SURVEY_COUPON_VALID_DAYS = 90;
export const SURVEY_COUPON_PREFIX = 'SSW30-';
export const SURVEY_COUPON_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const SURVEY_COUPON_CODE_RE = /^SSW30-[A-HJ-NP-Z2-9]{8}$/;

const YES_NO = new Set(['yes', 'no', 'not-sure']);
export const GARDEN_CLASS_COME_AGAIN = new Set(['yes', 'maybe', 'no']);

export function parseGardenClassScore(value) {
  if (value == null || value === '') return null;
  const n = typeof value === 'number' ? value : Number(String(value).trim());
  if (!Number.isInteger(n) || n < 1 || n > 10) return null;
  return n;
}

export function parseSurveyScore(value) {
  return parseGardenClassScore(value);
}

function pickClassScore(input, keys) {
  const nested = input && typeof input.scores === 'object' && input.scores ? input.scores : {};
  for (const key of keys) {
    const parsed = parseGardenClassScore(input?.[key] ?? nested[key]);
    if (parsed != null) return parsed;
  }
  return null;
}

const COUPON_SELECT =
  'id, first_name, email, coupon_code, coupon_issued_at, coupon_expires_at, coupon_redeemed_at';
const SAVED_SELECT = `${COUPON_SELECT}, created_at, customer_id, survey_kind, event_key, scores, notes, source`;
const INBOX_SELECT =
  'id, created_at, survey_kind, event_key, source, first_name, email_normalized, customer_id, would_come_back, notes, scores, user_agent, coupon_code, experience_score, finding_us, worked_well, improve_most';

function trimText(value, max) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function compactScores(values) {
  const scores = {};
  for (const [key, value] of Object.entries(values)) {
    if (value === 0 || value) scores[key] = value;
  }
  return scores;
}

function normalizeStringArray(value, maxItems = 12, maxLen = 80) {
  const list = Array.isArray(value) ? value : value ? [value] : [];
  const out = [];
  const seen = new Set();
  for (const item of list) {
    const text = trimText(item, maxLen);
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text);
    if (out.length >= maxItems) break;
  }
  return out;
}

function yardScoreScale(input) {
  const raw = input?.scoreScale ?? input?.score_scale ?? input?.scores?.scale;
  return Number(raw) === 5 ? 5 : 10;
}

function fitYardScore(score, scale) {
  if (score == null) return null;
  if (scale === 5 && score > 5) return null;
  return score;
}

function yardScoreSummary(experienceScore, findingUsScore, comeBackScore, scale = 10) {
  if (experienceScore == null || findingUsScore == null || comeBackScore == null) return '';
  const max = scale === 5 ? 5 : 10;
  return `Experience ${experienceScore}/${max}. Finding us ${findingUsScore}/${max}. Come back ${comeBackScore}/${max}.`;
}

export function normalizeSurveyResponse(input = {}, extras = {}) {
  const source = normalizeSurveySource(input.source);
  const isClass = isGardenClassSurveySource(source);
  const wouldSendFriend = String(input.wouldSendFriend || input.would_send_friend || '').trim().toLowerCase();
  const saturday = isClass
    ? pickClassScore(input, ['saturday', 'saturdayFeel', 'saturday_feel'])
    : null;
  const heat = isClass ? pickClassScore(input, ['heat', 'heatCall', 'heat_call']) : null;
  const teachingScore = isClass ? pickClassScore(input, ['teaching']) : null;
  const teaching = isClass
    ? teachingScore
    : trimText(input.teaching || '', 40).toLowerCase();
  const comeAgain = trimText(
    input.comeAgain || input.come_again || input.wouldComeBack || input.would_come_back,
    40,
  ).toLowerCase();
  const yardScale = isClass ? 10 : yardScoreScale(input);
  const experienceScore = isClass
    ? null
    : fitYardScore(pickClassScore(input, ['experienceScore', 'experience_score', 'experience']), yardScale);
  const findingUsScore = isClass
    ? null
    : fitYardScore(pickClassScore(input, ['findingUs', 'finding_us']), yardScale);
  const comeBackScore = isClass
    ? null
    : fitYardScore(pickClassScore(input, ['comeBack', 'come_back']), yardScale);
  const workedWell = isClass ? [] : normalizeStringArray(input.workedWell || input.worked_well);
  const improveMost = isClass ? '' : trimText(input.improveMost || input.improve_most, 80);
  const findingUs = findingUsScore != null ? String(findingUsScore) : '';
  const rawWouldComeBack = isClass
    ? comeAgain
    : comeBackScore != null
      ? String(comeBackScore)
      : String(input.wouldComeBack || input.would_come_back || '').trim().toLowerCase();
  const notes = isClass
    ? trimText(input.notes || input.comment || input.visitFeedback || input.visit_feedback, 500)
    : trimText(input.notes || input.comment, 500);
  const scoreSummary = yardScoreSummary(experienceScore, findingUsScore, comeBackScore, yardScale);
  const visitFeedback = isClass
    ? notes
    : scoreSummary || trimText(input.visitFeedback || input.visit_feedback || input.q1, 500);
  const eventKey = trimText(input.eventKey || input.event_key, 80) || (isClass ? GARDEN_CLASS_EVENT_KEY : '');
  const saturdayLabel = saturday != null ? String(saturday) : '';
  const heatLabel = heat != null ? String(heat) : '';
  const teachingLabel = teachingScore != null ? String(teachingScore) : '';

  return {
    firstName: trimText(input.firstName || input.first_name || input.name, 80),
    email: String(input.email || '').trim().toLowerCase().slice(0, 254),
    phone: trimText(input.phone, 30),
    visitFeedback,
    notes,
    whatFeltEasy: isClass
      ? saturdayLabel
      : workedWell.join(', ') || trimText(input.whatFeltEasy || input.what_felt_easy || input.q2, 500),
    whatFeltConfusing: isClass
      ? heatLabel
      : trimText(input.whatFeltConfusing || input.what_felt_confusing || input.q3, 500),
    whatToAddNext: isClass
      ? teachingLabel
      : improveMost || trimText(input.whatToAddNext || input.what_to_add_next || input.q4, 500),
    wouldComeBack: isClass
      ? (GARDEN_CLASS_COME_AGAIN.has(rawWouldComeBack) ? rawWouldComeBack : trimText(rawWouldComeBack, 80))
      : comeBackScore != null
        ? String(comeBackScore)
        : YES_NO.has(rawWouldComeBack)
          ? rawWouldComeBack
          : trimText(rawWouldComeBack, 80),
    wouldSendFriend: YES_NO.has(wouldSendFriend) ? wouldSendFriend : trimText(wouldSendFriend, 80),
    saturday,
    heat,
    saturdayFeel: saturday,
    heatCall: heat,
    teaching,
    comeAgain,
    experienceScore,
    findingUs,
    findingUsScore,
    comeBack: comeBackScore,
    workedWell,
    improveMost,
    scores: isClass
      ? compactScores({ saturday, heat, teaching: teachingScore, comeAgain })
      : compactScores({
          experience: experienceScore,
          findingUs: findingUsScore,
          comeBack: comeBackScore,
          improveMost,
          ...(yardScale === 5 ? { scale: 5 } : {}),
        }),
    surveyKind: surveyKindFromSource(source),
    eventKey,
    source,
    website: String(input.website || '').trim(),
    userAgent: trimText(extras.userAgent || input.userAgent || input.user_agent, 400),
  };
}

function validateContactFields(response) {
  if (response.firstName.length < 1) return { ok: false, error: 'Please enter your first name.' };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(response.email)) {
    return { ok: false, error: 'Please enter a valid email address.' };
  }
  if (response.phone && response.phone.replace(/\D/g, '').length < 10) {
    return { ok: false, error: 'Please enter a valid phone number, or leave it blank.' };
  }
  return null;
}

function validateGardenClassSurvey(response) {
  const contactError = validateContactFields(response);
  if (contactError) return contactError;
  if (parseGardenClassScore(response.saturday) == null) {
    return { ok: false, error: 'Please tell us how Saturday felt.' };
  }
  if (parseGardenClassScore(response.heat) == null) {
    return { ok: false, error: 'Please tell us how the heat felt.' };
  }
  if (parseGardenClassScore(response.teaching) == null) {
    return { ok: false, error: 'Please tell us how the teaching felt.' };
  }
  if (!GARDEN_CLASS_COME_AGAIN.has(response.comeAgain || response.wouldComeBack)) {
    return { ok: false, error: 'Please tell us if you would come to another class.' };
  }
  return { ok: true, bot: false, response };
}

function validateYardSurvey(response) {
  const contactError = validateContactFields(response);
  if (contactError) return contactError;
  if (parseSurveyScore(response.experienceScore) == null) {
    return { ok: false, error: 'Please tell us how the yard felt.' };
  }
  if (parseSurveyScore(response.findingUsScore) == null) {
    return { ok: false, error: 'Please tell us how easy it was to find us.' };
  }
  if (parseSurveyScore(response.comeBack) == null) {
    return { ok: false, error: 'Please tell us if you would come back.' };
  }
  return { ok: true, bot: false, response };
}

export function validateSurveyResponse(input = {}, extras = {}) {
  const response = normalizeSurveyResponse(input, extras);
  if (response.website) return { ok: true, bot: true, response };
  if (isGardenClassSurveySource(response.source)) {
    return validateGardenClassSurvey(response);
  }
  return validateYardSurvey(response);
}

export function generateSurveyCouponCode(bytes = randomBytes(8)) {
  let body = '';
  for (let i = 0; i < 8; i += 1) {
    body += SURVEY_COUPON_ALPHABET[bytes[i] % SURVEY_COUPON_ALPHABET.length];
  }
  return `${SURVEY_COUPON_PREFIX}${body}`;
}

export function isSurveyCouponCode(value) {
  return SURVEY_COUPON_CODE_RE.test(String(value || '').trim().toUpperCase());
}

export function surveyCouponExpiresAt(from = new Date()) {
  const issued = from instanceof Date ? from : new Date(from);
  return new Date(issued.getTime() + SURVEY_COUPON_VALID_DAYS * 24 * 60 * 60 * 1000);
}

export function surveyCouponQrPath(code) {
  return `/api/public/survey-coupon/qr/${encodeURIComponent(String(code || '').trim().toUpperCase())}.png`;
}

export function parseSurveyCouponQrRequest(fileName) {
  const match = String(fileName || '').trim().match(/^(SSW30-[A-HJ-NP-Z2-9]{8})\.(png|svg)$/i);
  if (!match) return null;
  return { code: match[1].toUpperCase(), format: match[2].toLowerCase() };
}

export function buildPublicSurveyCoupon(row, { reused = false } = {}) {
  if (!row?.coupon_code) return null;
  return {
    code: row.coupon_code,
    label: SURVEY_COUPON_LABEL,
    offer: SURVEY_COUPON_OFFER,
    restrictions: SURVEY_COUPON_RESTRICTIONS,
    firstName: row.first_name,
    email: row.email,
    issuedAt: row.coupon_issued_at,
    expiresAt: row.coupon_expires_at,
    redeemedAt: row.coupon_redeemed_at || null,
    qrUrl: surveyCouponQrPath(row.coupon_code),
    reused: Boolean(reused),
  };
}

function isUniqueViolation(error, constraint) {
  const message = `${error?.message || ''} ${error?.details || ''}`;
  if (error?.code !== '23505') return false;
  return constraint ? message.includes(constraint) : true;
}

async function findCustomerId(db, email) {
  try {
    const { data, error } = await db
      .from('sp_customers')
      .select('id')
      .ilike('email', email)
      .limit(1);
    if (error) {
      console.error('[Survey] Customer lookup skipped:', error.message || error);
      return null;
    }
    return data?.[0]?.id || null;
  } catch (error) {
    console.error('[Survey] Customer lookup skipped:', error?.message || error);
    return null;
  }
}

export async function findSurveyCouponByEmail(db, email) {
  const { data, error } = await db
    .from('sp_survey_responses')
    .select(COUPON_SELECT)
    .eq('email_normalized', email)
    .not('coupon_code', 'is', null)
    .limit(1);
  if (error) throw error;
  return data?.[0] || null;
}

export async function findSurveyCouponByCode(db, code) {
  const normalized = String(code || '').trim().toUpperCase();
  if (!isSurveyCouponCode(normalized)) return null;
  const { data, error } = await db
    .from('sp_survey_responses')
    .select('id')
    .eq('coupon_code', normalized)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

function surveyRow(response, customerId, coupon = null) {
  const isClass = isGardenClassSurveySource(response.source);
  return {
    first_name: response.firstName,
    email: response.email,
    email_normalized: response.email,
    phone: response.phone || null,
    visit_feedback: response.visitFeedback || '',
    what_felt_easy: response.whatFeltEasy || null,
    what_felt_confusing: response.whatFeltConfusing || null,
    what_to_add_next: response.whatToAddNext || null,
    would_come_back: response.wouldComeBack || null,
    would_send_friend: isClass ? null : response.wouldSendFriend || null,
    notes: response.notes || null,
    survey_kind: response.surveyKind || surveyKindFromSource(response.source),
    event_key: response.eventKey || null,
    scores: response.scores || {},
    source: response.source || SURVEY_SOURCE,
    user_agent: response.userAgent || null,
    customer_id: customerId,
    ...(isClass
      ? {}
      : {
          experience_score: response.experienceScore,
          worked_well: Array.isArray(response.workedWell) ? response.workedWell : [],
          finding_us: response.findingUs || null,
          improve_most: response.improveMost || null,
        }),
    ...(coupon || {}),
  };
}

async function insertSurveyRow(db, row) {
  const { data: saved, error } = await db
    .from('sp_survey_responses')
    .insert(row)
    .select(SAVED_SELECT)
    .single();
  return { saved, error };
}

export async function listSurveyInbox(db, { kind = 'all', limit = 100 } = {}) {
  const filter = normalizeSurveyKindFilter(kind);
  const take = Math.min(Math.max(Number(limit) || 100, 1), 200);

  const { data: kindRows, error: kindError } = await db
    .from('sp_survey_responses')
    .select('survey_kind');
  if (kindError) throw kindError;

  const counts = { all: 0 };
  for (const row of kindRows || []) {
    const surveyKind = row.survey_kind || SURVEY_KIND_PURCHASE;
    counts[surveyKind] = (counts[surveyKind] || 0) + 1;
    counts.all += 1;
  }

  let query = db.from('sp_survey_responses').select(INBOX_SELECT);
  if (filter !== 'all') query = query.eq('survey_kind', filter);
  const { data, error } = await query.order('created_at', { ascending: false }).limit(take);
  if (error) throw error;

  return { kind: filter, counts, rows: data || [] };
}

export async function saveSurveyResponse({
  db,
  response,
} = {}) {
  const customerId = await findCustomerId(db, response.email);
  const { saved, error } = await insertSurveyRow(db, surveyRow(response, customerId));
  if (error) throw error;
  return { response: saved, coupon: null };
}
