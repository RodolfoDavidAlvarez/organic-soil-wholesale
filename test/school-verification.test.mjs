import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SCHOOL_VERIFICATION_API_BASE_DEFAULT,
  buildSchoolSubmissionBody,
  collectUtmParams,
  mergeUtmParams,
  schoolIdContentType,
  schoolSignedUploadTarget,
  schoolVerificationApiBase,
  validateSchoolIdFile,
  validateSchoolSubmission,
  validateStatusLookup,
  withUtm,
} from '../shared/schoolVerification.js';

const valid = {
  schoolName: 'Desert Garden Elementary',
  schoolDistrict: 'Phoenix Elementary',
  contactName: 'Ada Lovelace',
  contactEmail: 'ada@school.example',
  contactPhone: '(623) 555-0100',
  orderReference: 'PO-14',
  pickupOrPhone: 'online_pickup',
  consent: true,
  file: { name: 'id.png', type: 'image/png', size: 1200 },
};

test('verification API base defaults to myorganicsoil.com', () => {
  assert.equal(schoolVerificationApiBase({}), SCHOOL_VERIFICATION_API_BASE_DEFAULT);
  assert.equal(
    schoolVerificationApiBase({ VITE_SCHOOL_VERIFICATION_API_BASE: 'https://example.test/' }),
    'https://example.test',
  );
});

test('school ID files are limited to jpg, png, heic, and pdf under 10 MB', () => {
  assert.equal(schoolIdContentType({ name: 'card.HEIC', type: '' }), 'image/heic');
  assert.equal(schoolIdContentType({ name: 'card.heic', type: 'image/heif' }), 'image/heic');
  assert.equal(schoolIdContentType({ name: 'card.heif', type: 'image/heic' }), 'image/heif');
  assert.equal(schoolIdContentType({ name: 'card.jpg', type: 'image/jpeg' }), 'image/jpeg');
  assert.equal(validateSchoolIdFile({ name: 'notes.txt', type: 'text/plain', size: 10 }), 'Upload a JPG, PNG, HEIC, or PDF.');
  assert.equal(validateSchoolIdFile({ name: 'big.pdf', type: 'application/pdf', size: 10 * 1024 * 1024 + 1 }), 'That file is larger than 10 MB.');
  assert.equal(validateSchoolIdFile(valid.file), null);
});

test('submission body matches the shared contract and keeps UTM fields', () => {
  const utm = collectUtmParams('?utm_source=meta&utm_medium=paid_social&utm_campaign=school_rate_nov2026&utm_content=story&gclid=skip');
  assert.deepEqual(utm, {
    utm_source: 'meta',
    utm_medium: 'paid_social',
    utm_campaign: 'school_rate_nov2026',
    utm_content: 'story',
  });
  const merged = mergeUtmParams({ utm_source: 'meta', utm_medium: 'paid_social' }, { utm_content: 'reel' });
  const body = buildSchoolSubmissionBody(valid, 'school-ids/private/card.png', merged);
  assert.equal(body.school_name, 'Desert Garden Elementary');
  assert.equal(body.school_district, 'Phoenix Elementary');
  assert.equal(body.pickup_or_phone, 'online_pickup');
  assert.equal(body.id_document_path, 'school-ids/private/card.png');
  assert.equal(body.utm_source, 'meta');
  assert.equal(body.utm_content, 'reel');
  assert.equal(body.gclid, undefined);
  assert.equal(Object.hasOwn(body, 'signed_upload_url'), false);
  const check = validateSchoolSubmission({ ...valid, consent: false, file: null });
  assert.equal(check.ok, false);
  assert.equal(check.errors.consent.includes('eligibility'), true);
});

test('signed uploads put the token on a Supabase storage URL', () => {
  const target = schoolSignedUploadTarget('https://project.supabase.co/storage/v1/object/upload/sign/school-verification-ids/pending/id.png', 'upload-token');
  assert.equal(target, 'https://project.supabase.co/storage/v1/object/upload/sign/school-verification-ids/pending/id.png?token=upload-token');
  assert.equal(schoolSignedUploadTarget('https://uploads.example.test/object/upload/sign/pending/id.png', 'upload-token'), null);
  assert.equal(schoolSignedUploadTarget('http://project.supabase.co/storage/v1/object/id.png', 'upload-token'), null);
  assert.equal(schoolSignedUploadTarget('https://project.supabase.co/storage/v1/object/id.png', ''), null);
  assert.equal(schoolSignedUploadTarget('https://user:pass@project.supabase.co/storage/v1/object/id.png', 'upload-token'), null);
});

test('status lookup and in-flow links keep the campaign query', () => {
  const href = withUtm('/schools/status?id=abc', { utm_source: 'meta', utm_campaign: 'school_rate_nov2026' });
  assert.equal(href, '/schools/status?id=abc&utm_source=meta&utm_campaign=school_rate_nov2026');
  assert.equal(validateStatusLookup({ id: 'abc', email: 'ada@school.example' }).ok, true);
  assert.equal(validateStatusLookup({ id: 'x', email: 'nope' }).ok, false);
});
