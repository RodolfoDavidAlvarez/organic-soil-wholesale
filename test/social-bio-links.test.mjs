import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('social bio routes exist for all four channels', async () => {
  const app = await readFile(new URL('../client/src/App.tsx', import.meta.url), 'utf8');
  for (const route of ['/ig', '/links/instagram', '/fb', '/facebook', '/links/facebook', '/tt', '/tiktok', '/links/tiktok', '/yt', '/youtube', '/links/youtube']) {
    assert.match(app, new RegExp(`path="${route}"`));
  }
});

test('every social bio destination carries standard campaign attribution', async () => {
  const page = await readFile(new URL('../client/src/pages/InstagramLinks.tsx', import.meta.url), 'utf8');
  assert.match(page, /utm_source/);
  assert.match(page, /utm_medium/);
  assert.match(page, /utm_campaign/);
  assert.match(page, /utm_content/);
  assert.match(page, /organic_social/);
  assert.match(page, /garden_bed_bundle_2026/);
  for (const channel of ['instagram', 'facebook', 'tiktok', 'youtube']) {
    assert.match(page, new RegExp(`${channel}:`));
  }
});

test('retired giveaway links show the community signup and preserve historical attribution storage', async () => {
  const page = await readFile(new URL('../client/src/pages/BigGardenGiveaway.tsx', import.meta.url), 'utf8');
  const shared = await readFile(new URL('../shared/giveawayEntries.js', import.meta.url), 'utf8');
  const migration = await readFile(new URL('../supabase/migrations/20260902_giveaway_attribution.sql', import.meta.url), 'utf8');
  assert.match(page, /<NewsletterSignup giveawayEnded\s*\/>/);
  assert.match(shared, /attribution_source/);
  assert.match(shared, /utm_campaign/);
  assert.match(migration, /sp_giveaway_entries_attribution_idx/);
});
