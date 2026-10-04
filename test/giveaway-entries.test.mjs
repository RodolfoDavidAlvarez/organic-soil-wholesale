import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  GIVEAWAY_CAMPAIGN_KEY,
  GIVEAWAY_CUSTOMER_TYPES,
  GIVEAWAY_ENTRIES_CLOSED_MESSAGE,
  GIVEAWAY_FOLLOW_COPY,
  GIVEAWAY_GROWING_OPTIONS,
  GIVEAWAY_SOCIAL_CHANNELS,
  GIVEAWAY_SOURCE,
  areGiveawayEntriesOpen,
  giveawayEntryRow,
  processGiveawayEntry,
  saveGiveawayEntry,
  validateGiveawayEntry,
} from '../shared/giveawayEntries.js';

const validBody = {
  fullName: 'Jordan Grower',
  email: 'jordan@example.com',
  phone: '(623) 555-0199',
  zipCode: '85009',
  customerTypes: ['homeowner', 'specialty-farmer'],
  gardenStatus: 'brand-new',
  growing: ['food-garden', 'citrus-avocado'],
  growingOther: 'figs',
  notes: 'South-facing beds',
  emailConsent: true,
  rulesConsent: true,
  followed: { ig: true, fb: false, yt: false },
  source: 'win-giveaway',
  website: '',
  attributionSource: 'instagram-bio',
  utmSource: 'instagram',
  utmMedium: 'organic_social',
  utmCampaign: 'september_garden_giveaway_2026',
  utmContent: 'big_garden_giveaway',
};

function createGiveawayDb({ existing = null, failInsert = false } = {}) {
  const inserts = [];
  return {
    inserts,
    from(table) {
      assert.equal(table, 'sp_giveaway_entries');
      const state = { op: 'select', filters: {}, payload: null };
      const api = {
        select() { return api; },
        eq(col, val) { state.filters[col] = val; return api; },
        insert(row) {
          state.op = 'insert';
          state.payload = row;
          inserts.push(row);
          return api;
        },
        maybeSingle: async () => ({ data: existing, error: null }),
        single: async () => {
          if (failInsert) return { data: null, error: { message: 'insert failed' } };
          return { data: { id: 'entry-1', created_at: '2026-09-01T00:00:00.000Z' }, error: null };
        },
      };
      return api;
    },
  };
}

test('giveaway questions match the /win spec and reject incomplete entries', () => {
  assert.deepEqual(GIVEAWAY_CUSTOMER_TYPES.map(([, label]) => label), [
    'Homeowner',
    'Landscaper',
    'Farmer / agriculture',
    'Garden professional',
  ]);
  assert.deepEqual(GIVEAWAY_GROWING_OPTIONS.map(([, label]) => label), [
    'Food garden',
    'Turf/grass',
    'Ornamentals',
    'Trees',
    'Citrus/avocado',
    'Palms',
    'Roses',
    'Succulents',
    'Indoor plants',
  ]);
  assert.equal(validateGiveawayEntry(validBody).ok, true);
  assert.equal(validateGiveawayEntry({ ...validBody, fullName: 'J' }).ok, false);
  assert.equal(validateGiveawayEntry({ ...validBody, zipCode: '8500' }).ok, false);
  assert.equal(validateGiveawayEntry({ ...validBody, customerTypes: ['home-gardener'] }).ok, false);
  assert.equal(validateGiveawayEntry({ ...validBody, growing: [] }).ok, false);
  assert.equal(validateGiveawayEntry({ ...validBody, emailConsent: false }).ok, false);
  assert.equal(validateGiveawayEntry({ ...validBody, rulesConsent: false }).ok, false);
  assert.equal(validateGiveawayEntry({ ...validBody, followed: { ig: false, fb: false, yt: false } }).ok, false);
  assert.equal(validateGiveawayEntry({ ...validBody, website: 'https://spam.test' }).bot, true);
});

test('social follow URLs and copy match the approved channels', () => {
  assert.equal(GIVEAWAY_FOLLOW_COPY, 'Follow at least one account — tap Follow, then check the box.');
  assert.deepEqual(GIVEAWAY_SOCIAL_CHANNELS.map((channel) => [channel.key, channel.url]), [
    ['ig', 'https://www.instagram.com/soilseedandwater/'],
    ['fb', 'https://www.facebook.com/soilseedandwater'],
    ['yt', 'https://www.youtube.com/@soilseedwater'],
  ]);
});

test('completed giveaway stays closed even with a stale open environment flag', () => {
  for (const value of [undefined, '', 'true', 'false', '1']) {
    assert.equal(areGiveawayEntriesOpen({ GIVEAWAY_ENTRIES_OPEN: value }), false);
  }
});

test('closed flag rejects before any database write', async () => {
  const db = createGiveawayDb();
  const result = await processGiveawayEntry({
    db,
    body: validBody,
    env: { GIVEAWAY_ENTRIES_OPEN: 'false' },
  });
  assert.equal(result.status, 403);
  assert.equal(result.json.error, GIVEAWAY_ENTRIES_CLOSED_MESSAGE);
  assert.equal(result.json.entriesOpen, false);
  assert.equal(db.inserts.length, 0);
});

test('honeypot succeeds without saving after campaign closure', async () => {
  const db = createGiveawayDb();
  const result = await processGiveawayEntry({
    db,
    body: { ...validBody, website: 'https://bot.test' },
  });
  assert.equal(result.status, 200);
  assert.equal(result.json.success, true);
  assert.equal(db.inserts.length, 0);
});

test('a previously loaded form cannot insert an entry after the drawing', async () => {
  const db = createGiveawayDb();
  for (const env of [{}, { GIVEAWAY_ENTRIES_OPEN: 'true' }]) {
    const result = await processGiveawayEntry({ db, body: validBody, env });
    assert.equal(result.status, 403);
    assert.equal(result.json.entriesOpen, false);
    assert.match(result.json.error, /has ended/);
  }
  assert.equal(db.inserts.length, 0);
});

test('one live entry per email does not insert a second row', async () => {
  const db = createGiveawayDb({ existing: { id: 'already', created_at: '2026-08-01T00:00:00.000Z' } });
  const saved = await saveGiveawayEntry({
    db,
    entry: validateGiveawayEntry(validBody).entry,
  });
  assert.equal(saved.created, false);
  assert.equal(db.inserts.length, 0);
});

test('live row helper never marks preview true', () => {
  const row = giveawayEntryRow(validateGiveawayEntry(validBody).entry);
  assert.equal(row.is_preview, false);
  assert.equal(row.source, 'win-giveaway');
});

test('old giveaway URLs offer community updates, not new entries', async () => {
  const page = await readFile(new URL('../client/src/pages/BigGardenGiveaway.tsx', import.meta.url), 'utf8');
  const app = await readFile(new URL('../client/src/App.tsx', import.meta.url), 'utf8');
  const form = await readFile(new URL('../client/src/pages/NewsletterSignup.tsx', import.meta.url), 'utf8');
  const social = await readFile(new URL('../client/src/pages/InstagramLinks.tsx', import.meta.url), 'utf8');
  assert.match(page, /<NewsletterSignup giveawayEnded/);
  assert.doesNotMatch(page, /api\/giveaway\/enter/);
  for (const path of ['/win', '/big-garden-giveaway', '/keep-growing', '/newsletter']) {
    assert.ok(app.includes(`path="${path}"`));
  }
  assert.match(form, /api\/newsletter\/subscribe/);
  assert.match(form, /entries are closed/);
  assert.match(form, /Keep Growing With Us/);
  assert.match(social, /"\/keep-growing"/);
  assert.doesNotMatch(social, /Enter now|Enter the Big Garden Giveaway|Free entry/);
});
