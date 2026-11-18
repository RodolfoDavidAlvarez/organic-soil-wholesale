/**
 * School ID verification payload helpers.
 * The browser calls https://myorganicsoil.com unless an env base is set.
 * Uploaded IDs stay on that service. This module never returns a public file URL.
 */

export const SCHOOL_UTM_KEYS = Object.freeze([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
]);

export const SCHOOL_ID_MAX_BYTES = 10 * 1024 * 1024;
export const SCHOOL_VERIFICATION_API_BASE_DEFAULT = 'https://myorganicsoil.com';

const CONTENT_TYPES_BY_EXT = Object.freeze({
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  heic: 'image/heic',
  heif: 'image/heif',
  pdf: 'application/pdf',
});

const ALLOWED_CONTENT_TYPES = new Set(Object.values(CONTENT_TYPES_BY_EXT));
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function schoolVerificationApiBase(env = {}) {
  const configured = String(
    env.VITE_SCHOOL_VERIFICATION_API_BASE || env.SCHOOL_VERIFICATION_API_BASE || '',
  ).trim();
  if (!configured) return SCHOOL_VERIFICATION_API_BASE_DEFAULT;
  return configured.replace(/\/$/, '');
}

export function collectUtmParams(search = '') {
  const raw = String(search || '');
  const params = new URLSearchParams(raw.startsWith('?') ? raw.slice(1) : raw);
  const utm = {};
  for (const key of SCHOOL_UTM_KEYS) {
    const value = params.get(key);
    if (value && value.trim()) utm[key] = value.trim().slice(0, 200);
  }
  return utm;
}

export function mergeUtmParams(stored = {}, incoming = {}) {
  const next = {};
  for (const key of SCHOOL_UTM_KEYS) {
    const value = incoming[key] || stored[key];
    if (value) next[key] = String(value).slice(0, 200);
  }
  return next;
}

export function withUtm(path, utm = {}) {
  const [beforeHash, hash = ''] = String(path || '').split('#');
  const [pathname, query = ''] = beforeHash.split('?');
  const params = new URLSearchParams(query);
  for (const key of SCHOOL_UTM_KEYS) {
    if (utm?.[key]) params.set(key, utm[key]);
  }
  const qs = params.toString();
  return `${pathname}${qs ? `?${qs}` : ''}${hash ? `#${hash}` : ''}`;
}

const HEIC_TYPES = new Set(['image/heic', 'image/heif']);

export function schoolIdContentType(file) {
  const name = String(file?.name || '');
  const ext = name.includes('.') ? name.split('.').pop().toLowerCase() : '';
  const fromExt = CONTENT_TYPES_BY_EXT[ext] || null;
  const type = String(file?.type || '').toLowerCase();
  if (type === 'image/jpg') return fromExt === 'image/jpeg' || !fromExt ? 'image/jpeg' : null;
  // iPhones label the same HEIC file as image/heic or image/heif. The verification
  // service accepts either mime for either extension.
  if (fromExt && HEIC_TYPES.has(fromExt) && (!type || type === 'application/octet-stream' || HEIC_TYPES.has(type))) {
    return fromExt;
  }
  if (fromExt && (!type || type === 'application/octet-stream' || type === fromExt)) return fromExt;
  if (ALLOWED_CONTENT_TYPES.has(type) && (!fromExt || fromExt === type)) return type;
  return null;
}

export function validateSchoolIdFile(file) {
  if (!file) return 'Upload a school ID.';
  const contentType = schoolIdContentType(file);
  if (!contentType) return 'Upload a JPG, PNG, HEIC, or PDF.';
  const size = Number(file.size);
  if (!Number.isFinite(size) || size <= 0) return 'That file is empty.';
  if (size > SCHOOL_ID_MAX_BYTES) return 'That file is larger than 10 MB.';
  return null;
}

export function schoolIdPreviewKind(contentType) {
  if (contentType === 'image/jpeg' || contentType === 'image/png') return 'image';
  if (contentType === 'image/heic' || contentType === 'image/heif') return 'heic';
  if (contentType === 'application/pdf') return 'pdf';
  return 'none';
}

export function validateSchoolSubmission(input = {}) {
  const errors = {};
  const schoolName = String(input.schoolName || '').trim();
  const district = String(input.schoolDistrict || '').trim();
  const contactName = String(input.contactName || '').trim();
  const email = String(input.contactEmail || '').trim();
  const phone = String(input.contactPhone || '').trim();
  const orderReference = String(input.orderReference || '').trim();
  const method = input.pickupOrPhone;

  if (schoolName.length < 2) errors.schoolName = 'Enter the school name.';
  else if (schoolName.length > 200) errors.schoolName = 'School name is too long.';
  if (district.length > 200) errors.schoolDistrict = 'District name is too long.';
  if (contactName.length < 2) errors.contactName = 'Enter a contact name.';
  else if (contactName.length > 200) errors.contactName = 'Contact name is too long.';
  if (!EMAIL_PATTERN.test(email) || email.length > 200) errors.contactEmail = 'Enter a valid email.';
  if (phone && phone.replace(/\D/g, '').length < 10) {
    errors.contactPhone = 'Enter a 10-digit phone number, or leave it blank.';
  }
  if (orderReference.length > 120) errors.orderReference = 'Order reference is too long.';
  if (method !== 'online_pickup' && method !== 'phone') {
    errors.pickupOrPhone = 'Choose how you will order.';
  }
  if (!input.consent) errors.consent = 'Confirm the ID is used only to verify eligibility.';
  const fileError = validateSchoolIdFile(input.file);
  if (fileError) errors.idFile = fileError;

  return { ok: Object.keys(errors).length === 0, errors };
}

export function buildSchoolSubmissionBody(input, idDocumentPath, utm = {}) {
  const body = {
    school_name: String(input.schoolName || '').trim(),
    contact_name: String(input.contactName || '').trim(),
    contact_email: String(input.contactEmail || '').trim(),
    pickup_or_phone: input.pickupOrPhone,
    id_document_path: idDocumentPath,
  };
  const district = String(input.schoolDistrict || '').trim();
  const phone = String(input.contactPhone || '').trim();
  const orderReference = String(input.orderReference || '').trim();
  if (district) body.school_district = district;
  if (phone) body.contact_phone = phone;
  if (orderReference) body.order_reference = orderReference;
  for (const key of SCHOOL_UTM_KEYS) {
    if (utm?.[key]) body[key] = String(utm[key]).slice(0, 200);
  }
  return body;
}

/**
 * Supabase signed uploads are a PUT to signed_upload_url with the returned
 * token on the query string. The storage client sends the file as multipart
 * form data and does not put the token in a header.
 */
function isSchoolUploadHost(hostname) {
  const host = String(hostname || '').toLowerCase();
  return host === 'supabase.co' || host.endsWith('.supabase.co');
}

export function schoolSignedUploadTarget(signedUrl, token) {
  let url;
  try {
    url = new URL(String(signedUrl || ''));
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.username || url.password) return null;
  if (!isSchoolUploadHost(url.hostname)) return null;
  if (token) url.searchParams.set('token', String(token));
  if (!url.searchParams.get('token')) return null;
  return url.toString();
}

export function validateStatusLookup(input = {}) {
  const errors = {};
  const id = String(input.id || '').trim();
  const email = String(input.email || '').trim();
  if (id.length < 1 || id.length > 80) errors.id = 'Enter the reference from your confirmation.';
  if (!EMAIL_PATTERN.test(email)) errors.email = 'Enter the email you used on the form.';
  return { ok: Object.keys(errors).length === 0, errors, id, email };
}
