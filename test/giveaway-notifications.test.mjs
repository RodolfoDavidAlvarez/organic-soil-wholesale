import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

import {
  GIVEAWAY_LEAD_REPORT_BATCH_SIZE,
  GIVEAWAY_LEAD_REPORT_FIRST_AUTOMATED_BATCH,
  GIVEAWAY_LEAD_REPORT_FROM,
  GIVEAWAY_LEAD_REPORT_RECIPIENTS,
  buildGiveawayLeadMap,
  buildGiveawayLeadReportEmail,
  buildGiveawayLeadReportModel,
  giveawayLeadReportsEnabled,
  getGiveawayLeadReportRecipients,
  isGiveawayLeadReportEligible,
  sendGiveawayLeadReport,
  shouldEvaluateGiveawayLeadReport,
} from '../shared/giveawayNotifications.js';

const categories = [
  'food-garden', 'turf', 'ornamentals', 'trees', 'citrus-avocado',
  'palms', 'roses', 'succulents', 'indoor-plants',
];
const zips = ['85021', '85029', '85051', '85083', '85142', '85143', '85338', '85351', '85361', '85388'];
const giveawayEntries = Array.from({ length: 60 }, (_, index) => ({
  id: `entry-${String(index + 1).padStart(2, '0')}`,
  full_name: `Garden Lead ${index + 1}`,
  email: `lead${index + 1}@garden.test`,
  phone: `(623) 555-${String(index).padStart(4, '0')}`,
  zip_code: zips[index % zips.length],
  garden_status: index % 3 === 0 ? 'existing' : 'brand-new',
  growing: ['food-garden', categories[index % categories.length]],
  growing_other: null,
  created_at: new Date(Date.UTC(2026, 8, 1, 16, index)).toISOString(),
}));
const wormProfiles = [
  { zip_code: '85009', garden_status: 'existing', growing: ['food-garden', 'trees'] },
  { zip_code: '85032', garden_status: 'brand-new', growing: ['roses', 'indoor-plants'] },
  { zip_code: null, garden_status: null, growing: null },
];

test('giveaway Lead Reports are enabled explicitly and use batches of 30', () => {
  assert.equal(GIVEAWAY_LEAD_REPORT_BATCH_SIZE, 30);
  assert.equal(GIVEAWAY_LEAD_REPORT_FIRST_AUTOMATED_BATCH, 2);
  assert.equal(GIVEAWAY_LEAD_REPORT_FROM, 'SSW Lead Report <soilseedandwater@bettersystems.ai>');
  assert.equal(giveawayLeadReportsEnabled({ GIVEAWAY_LEAD_REPORTS_ACTIVE: 'true' }), true);
  assert.equal(giveawayLeadReportsEnabled({ GIVEAWAY_LEAD_REPORTS_ACTIVE: 'false' }), false);
  assert.equal(giveawayLeadReportsEnabled({}), false);
});

test('Lead Reports go only to Rodolfo, Sabrina, and Mike', () => {
  const expected = [
    { name: 'Rodolfo Alvarez', email: 'ralvarez@soilseedandwater.com' },
    { name: 'Sabrina Moses', email: 'sabrina@soilseedandwater.com' },
    { name: 'Mike McMahon', email: 'mike.mcmahon@agave-inc.com' },
  ];
  assert.deepEqual(GIVEAWAY_LEAD_REPORT_RECIPIENTS, expected);
  assert.deepEqual(getGiveawayLeadReportRecipients(), expected);
  assert.equal(getGiveawayLeadReportRecipients().length, 3);
});

test('only a newly created giveaway entry evaluates the 30-person threshold', () => {
  assert.equal(shouldEvaluateGiveawayLeadReport({ status: 201, json: { success: true, alreadyEntered: false } }), true);
  assert.equal(shouldEvaluateGiveawayLeadReport({ status: 200, json: { success: true, alreadyEntered: true } }), false);
  assert.equal(shouldEvaluateGiveawayLeadReport({ status: 400, json: { success: false } }), false);
});

test('production QA addresses never count toward a Lead Report batch', () => {
  assert.equal(isGiveawayLeadReportEligible({ email: 'person@gmail.com' }), true);
  assert.equal(isGiveawayLeadReportEligible({ email: 'live-check@example.com' }), false);
});

test('report model uses the exact batch, cumulative profiles, and all nine categories', () => {
  const model = buildGiveawayLeadReportModel({
    batchNumber: 1,
    giveawayEntries,
    wormProfiles,
    entryStart: 31,
    entryEnd: 60,
    giveawayTotalCount: 63,
  });
  assert.equal(model.batch.length, 30);
  assert.equal(model.batch[0].full_name, 'Garden Lead 31');
  assert.equal(model.startOrdinal, 31);
  assert.equal(model.endOrdinal, 60);
  assert.equal(model.giveawayTotalCount, 63);
  assert.equal(model.baselineCount, 2);
  assert.equal(model.beforeTotal, 32);
  assert.equal(model.afterTotal, 62);
  assert.equal(model.uniqueZips, 10);
  assert.equal(model.categories.length, 9);
  assert.deepEqual(new Set(model.categories.map((category) => category.key)), new Set(categories));
});

test('map shows only the selected batch and returns a PNG attachment', async () => {
  const map = await buildGiveawayLeadMap(giveawayEntries.slice(0, 30));
  assert.equal(map.mappedPeople, 30);
  assert.equal(map.unmappedPeople, 0);
  assert.equal(map.mappedZipCount, 10);
  assert.deepEqual([...map.buffer.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
});

test('email is a Lead Report with the map, all categories, and 30 contacts', async () => {
  const model = buildGiveawayLeadReportModel({ batchNumber: 1, giveawayEntries, wormProfiles });
  const report = await buildGiveawayLeadReportEmail({ model, testing: true, generatedAt: new Date('2026-09-03T06:00:00.000Z') });
  assert.equal(report.subject, '[TEST] SSW Lead Report #1 — Big Garden Giveaway');
  assert.equal(report.attachment.contentId, 'giveaway-lead-map');
  assert.match(report.html, /all 9 categories/i);
  assert.match(report.html, /Where the latest 30 leads are/);
  assert.match(report.html, /Total leads since August: 60/);
  assert.match(report.html, /Big Garden Giveaway leads since September: 60/);
  assert.match(report.html, /supported-color-schemes/);
  assert.match(report.html, /color-scheme:light dark/);
  assert.match(report.html, /prefers-color-scheme:dark/);
  assert.match(report.html, /\[data-ogsc\]/);
  assert.match(report.html, /background-image:linear-gradient\(#ffffff,#ffffff\)/);
  assert.doesNotMatch(report.html, /background:#17251b/);
  assert.match(report.html, /ssw-logo-white\.png/);
  assert.match(report.html, /Garden Lead 30/);
  assert.match(report.html, /Live batching is not triggered by this test/);
});

test('Resend delivery is individual, branded as Lead Report, and supports scheduling', async () => {
  const model = buildGiveawayLeadReportModel({ batchNumber: 1, giveawayEntries, wormProfiles });
  const report = await buildGiveawayLeadReportEmail({ model });
  const sent = [];
  const resend = {
    emails: {
      send: async (payload, options) => {
        sent.push({ payload, options });
        return { data: { id: `email-${sent.length}` }, error: null };
      },
    },
  };
  const recipients = [
    { name: 'Rodolfo', email: 'ralvarez@soilseedandwater.com' },
    { name: 'Team', email: 'team@soilseedandwater.com' },
  ];
  const scheduledAt = '2026-09-03T16:00:00.000Z';
  const delivery = await sendGiveawayLeadReport({ resend, report, model, recipients, scheduledAt });
  assert.equal(delivery.complete, true);
  assert.equal(sent.length, 2);
  assert.deepEqual(sent.map((item) => item.payload.to), recipients.map((recipient) => recipient.email));
  assert.deepEqual(sent.map((item) => item.payload.from), [GIVEAWAY_LEAD_REPORT_FROM, GIVEAWAY_LEAD_REPORT_FROM]);
  assert.deepEqual(sent.map((item) => item.payload.scheduledAt), [scheduledAt, scheduledAt]);
  assert.ok(sent.every((item) => item.payload.attachments[0].contentId === 'giveaway-lead-map'));
});

test('API no longer calls the one-email-per-entry giveaway sender and migration is durable', async () => {
  const api = await readFile(new URL('../api/index.js', import.meta.url), 'utf8');
  const migration = await readFile(new URL('../supabase/migrations/20260903_giveaway_lead_reports.sql', import.meta.url), 'utf8');
  assert.doesNotMatch(api, /sendGiveawayAdminNotifications/);
  assert.match(api, /maybeSendGiveawayLeadReports/);
  assert.match(api, /getGiveawayLeadReportRecipients/);
  assert.match(api, /GIVEAWAY_LEAD_REPORTS_ACTIVE/);
  assert.match(migration, /sp_giveaway_lead_reports/);
  assert.match(migration, /unique \(campaign_key, batch_number\)/);
});
