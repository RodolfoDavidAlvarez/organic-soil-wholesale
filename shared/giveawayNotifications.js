import sharp from 'sharp';
import zipcodes from 'zipcodes';

import {
  GIVEAWAY_CAMPAIGN_KEY,
  GIVEAWAY_GROWING_OPTIONS,
} from './giveawayEntries.js';
import {
  staffAlertThreadingHeaders,
} from './newsletterNotifications.js';
import {
  PHOENIX_METRO_BASEMAP_BASE64,
  PHOENIX_METRO_MAP_VIEWPORT,
} from './giveawayLeadReportBasemap.js';
import { sswFrom } from './sswEmailFrom.js';

export const GIVEAWAY_LEAD_REPORT_BATCH_SIZE = 30;
export const GIVEAWAY_LEAD_REPORT_FROM = sswFrom('SSW Lead Report');
export const GIVEAWAY_LEAD_REPORT_REPLY_TO = 'ralvarez@soilseedandwater.com';
export const GIVEAWAY_LEAD_REPORT_THREAD_ID = '<ssw-giveaway-lead-report@bettersystems.ai>';
export const GIVEAWAY_LEAD_REPORT_TABLE = 'sp_giveaway_lead_reports';
export const GIVEAWAY_LEAD_REPORT_FIRST_AUTOMATED_BATCH = 2;
export const GIVEAWAY_LEAD_REPORT_RECIPIENTS = Object.freeze([
  { name: 'Rodolfo Alvarez', email: 'ralvarez@soilseedandwater.com' },
  { name: 'Sabrina Moses', email: 'sabrina@soilseedandwater.com' },
  { name: 'Mike McMahon', email: 'mike.mcmahon@agave-inc.com' },
]);

const CATEGORY_LABELS = Object.fromEntries(GIVEAWAY_GROWING_OPTIONS);
const CATEGORY_KEYS = GIVEAWAY_GROWING_OPTIONS.map(([key]) => key);
const MAP_CONTENT_ID = 'giveaway-lead-map';
const LOGO_URL = 'https://www.organicsoilwholesale.com/email-assets/ssw-logo-white.png';
const AUGUST_LEAD_START = '2026-08-01T07:00:00.000Z';
const SEPTEMBER_GIVEAWAY_START = '2026-09-01T07:00:00.000Z';

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeXml(value) {
  return escapeHtml(value);
}

function normalizeZip(value) {
  return String(value || '').replace(/\D/g, '').slice(0, 5) || 'Unknown';
}

function uniqueLeadCount(rows, since = AUGUST_LEAD_START) {
  const emails = new Set();
  for (const row of rows || []) {
    const email = String(row?.email || '').trim().toLowerCase();
    const createdAt = new Date(row?.created_at || 0);
    if (!email || email.endsWith('@example.com') || Number.isNaN(createdAt.getTime()) || createdAt < new Date(since)) continue;
    emails.add(email);
  }
  return emails.size;
}

export function isGiveawayLeadReportEligible(entry) {
  const email = String(entry?.email || entry?.email_normalized || '').trim().toLowerCase();
  return Boolean(email) && !email.endsWith('@example.com');
}

export function getGiveawayLeadReportRecipients() {
  return GIVEAWAY_LEAD_REPORT_RECIPIENTS.map((recipient) => ({ ...recipient }));
}

function percent(count, total) {
  return total ? count / total * 100 : 0;
}

function deltaLabel(value) {
  if (Math.abs(value) < 0.05) return '—';
  return `${value > 0 ? '+' : ''}${value.toFixed(1)} pts`;
}

function phoenixTime(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Phoenix',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function categoryCounts(rows) {
  const counts = Object.fromEntries(CATEGORY_KEYS.map((key) => [key, 0]));
  for (const row of rows) {
    const growing = Array.isArray(row?.growing) ? [...new Set(row.growing)] : [];
    for (const key of growing) {
      if (Object.hasOwn(counts, key)) counts[key] += 1;
    }
  }
  return counts;
}

function statusCounts(rows) {
  return rows.reduce((counts, row) => {
    const key = row?.garden_status;
    if (key === 'brand-new' || key === 'existing') counts[key] += 1;
    return counts;
  }, { 'brand-new': 0, existing: 0 });
}

function validWormProfiles(rows) {
  return (rows || []).filter((row) => {
    const growing = Array.isArray(row?.growing) ? row.growing : [];
    return normalizeZip(row?.zip_code) !== 'Unknown'
      && (row?.garden_status === 'brand-new' || row?.garden_status === 'existing')
      && growing.some((key) => CATEGORY_KEYS.includes(key));
  });
}

function mergeCounts(left, right) {
  return Object.fromEntries(CATEGORY_KEYS.map((key) => [key, (left[key] || 0) + (right[key] || 0)]));
}

function mergeStatus(left, right) {
  return {
    'brand-new': (left['brand-new'] || 0) + (right['brand-new'] || 0),
    existing: (left.existing || 0) + (right.existing || 0),
  };
}

function leadReportSubject(batchNumber) {
  return `SSW Lead Report #${batchNumber} — Big Garden Giveaway`;
}

export function giveawayLeadReportsEnabled(env = process.env) {
  return String(env?.GIVEAWAY_LEAD_REPORTS_ACTIVE || '').trim().toLowerCase() === 'true';
}

export function shouldEvaluateGiveawayLeadReport(result) {
  return result?.status === 201 && result?.json?.success === true && result?.json?.alreadyEntered !== true;
}

export function buildGiveawayLeadReportModel({
  batchNumber,
  batchSize = GIVEAWAY_LEAD_REPORT_BATCH_SIZE,
  giveawayEntries,
  wormProfiles,
  entryStart = (batchNumber - 1) * batchSize + 1,
  entryEnd = entryStart + batchSize - 1,
  giveawayTotalCount = giveawayEntries?.length || 0,
  allLeadRows = giveawayEntries || [],
  allGiveawayRows = giveawayEntries || [],
}) {
  const eligibleEntries = (giveawayEntries || []).filter(isGiveawayLeadReportEligible);
  const start = entryStart - 1;
  const end = entryEnd;
  if (!Number.isInteger(batchNumber) || batchNumber < 1) throw new Error('A positive batch number is required.');
  if (!Number.isInteger(entryStart) || entryStart < 1 || entryEnd - entryStart + 1 !== batchSize) {
    throw new Error(`Lead Report windows must contain exactly ${batchSize} valid entries.`);
  }
  if (eligibleEntries.length < end) throw new Error(`Batch ${batchNumber} needs ${end} valid giveaway entries.`);

  const baseline = validWormProfiles(wormProfiles);
  const beforeGiveaway = eligibleEntries.slice(0, start);
  const afterGiveaway = eligibleEntries.slice(0, end);
  const batch = eligibleEntries.slice(start, end);
  const baselineCategories = categoryCounts(baseline);
  const beforeCategories = mergeCounts(baselineCategories, categoryCounts(beforeGiveaway));
  const afterCategories = mergeCounts(baselineCategories, categoryCounts(afterGiveaway));
  const baselineStatus = statusCounts(baseline);
  const beforeStatus = mergeStatus(baselineStatus, statusCounts(beforeGiveaway));
  const afterStatus = mergeStatus(baselineStatus, statusCounts(afterGiveaway));
  const beforeTotal = baseline.length + beforeGiveaway.length;
  const afterTotal = baseline.length + afterGiveaway.length;
  const categories = CATEGORY_KEYS.map((key) => {
    const beforePercent = percent(beforeCategories[key], beforeTotal);
    const afterPercent = percent(afterCategories[key], afterTotal);
    return {
      key,
      label: CATEGORY_LABELS[key],
      beforePercent,
      afterPercent,
      delta: afterPercent - beforePercent,
    };
  }).sort((a, b) => b.afterPercent - a.afterPercent || a.label.localeCompare(b.label));
  const uniqueZips = new Set(batch.map((entry) => normalizeZip(entry.zip_code))).size;

  return {
    campaignKey: GIVEAWAY_CAMPAIGN_KEY,
    batchNumber,
    batchSize,
    startOrdinal: entryStart,
    endOrdinal: end,
    giveawayTotalCount: Math.max(Number(giveawayTotalCount || 0), end),
    totalLeadsSinceAugust: uniqueLeadCount(allLeadRows),
    giveawayLeadsSinceSeptember: uniqueLeadCount(allGiveawayRows, SEPTEMBER_GIVEAWAY_START),
    batch,
    baselineCount: baseline.length,
    beforeTotal,
    afterTotal,
    uniqueZips,
    categories,
    beforeStatus,
    afterStatus,
  };
}

function projectZip(zip) {
  const location = zipcodes.lookup(normalizeZip(zip));
  if (!location || !Number.isFinite(location.latitude) || !Number.isFinite(location.longitude)) return null;
  const { zoom, left, top } = PHOENIX_METRO_MAP_VIEWPORT;
  const world = 256 * (2 ** zoom);
  const x = ((location.longitude + 180) / 360) * world - left;
  const latRadians = location.latitude * Math.PI / 180;
  const y = ((1 - Math.asinh(Math.tan(latRadians)) / Math.PI) / 2) * world - top;
  if (x < 0 || x > PHOENIX_METRO_MAP_VIEWPORT.width || y < 0 || y > PHOENIX_METRO_MAP_VIEWPORT.height) return null;
  return { x, y, city: location.city, state: location.state };
}

function clusterMapPoints(points) {
  const clusters = [];
  for (const item of points) {
    let cluster = clusters.find((candidate) => Math.hypot(candidate.x - item.x, candidate.y - item.y) < 27);
    if (!cluster) {
      cluster = { x: item.x, y: item.y, count: 0, zips: [], names: [] };
      clusters.push(cluster);
    }
    const nextCount = cluster.count + item.count;
    cluster.x = (cluster.x * cluster.count + item.x * item.count) / nextCount;
    cluster.y = (cluster.y * cluster.count + item.y * item.count) / nextCount;
    cluster.count = nextCount;
    cluster.zips.push(item.zip);
    cluster.names.push(...item.names);
  }
  return clusters;
}

export async function buildGiveawayLeadMap(batch) {
  const grouped = new Map();
  for (const entry of batch) {
    const zip = normalizeZip(entry.zip_code);
    const point = projectZip(zip);
    if (!point) continue;
    const current = grouped.get(zip) || { zip, count: 0, names: [], ...point };
    current.count += 1;
    current.names.push(entry.full_name || 'Unknown');
    grouped.set(zip, current);
  }
  const points = [...grouped.values()];
  const clusters = clusterMapPoints(points);
  const mappedPeople = points.reduce((sum, item) => sum + item.count, 0);
  const unmappedPeople = batch.length - mappedPeople;
  const markerSvg = clusters.map((cluster) => `
    <g aria-label="${escapeXml(`${cluster.count} people near ZIP ${cluster.zips.join(', ')}`)}">
      <circle cx="${cluster.x.toFixed(1)}" cy="${cluster.y.toFixed(1)}" r="14" fill="#ffffff" fill-opacity=".95"/>
      <circle cx="${cluster.x.toFixed(1)}" cy="${cluster.y.toFixed(1)}" r="11" fill="#efc269"/>
      <text x="${cluster.x.toFixed(1)}" y="${(cluster.y + 4).toFixed(1)}" fill="#171916" font-family="Arial,Helvetica,sans-serif" font-size="12" font-weight="700" text-anchor="middle">${cluster.count}</text>
    </g>`).join('');
  const overlay = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="560" height="320" viewBox="0 0 560 320">
    <rect width="560" height="320" fill="#202320" fill-opacity=".36"/>
    ${markerSvg}
    <rect x="352" y="294" width="208" height="26" fill="#191b19" fill-opacity=".9"/>
    <text x="550" y="312" fill="#ffffff" font-family="Arial,Helvetica,sans-serif" font-size="11" text-anchor="end">© OpenStreetMap contributors</text>
  </svg>`);
  const buffer = await sharp(Buffer.from(PHOENIX_METRO_BASEMAP_BASE64, 'base64'))
    .composite([{ input: overlay, blend: 'over' }])
    .png()
    .toBuffer();
  return { buffer, mappedPeople, unmappedPeople, mappedZipCount: points.length, clusterCount: clusters.length };
}

function categoryRows(model) {
  return model.categories.map((category) => {
    const beforeWidth = Math.max(1, category.beforePercent).toFixed(2);
    const afterWidth = Math.max(1, category.afterPercent).toFixed(2);
    return `<tr>
      <td class="theme-text" style="padding:7px 10px 7px 0;color:#20221f;-webkit-text-fill-color:#20221f;font-size:12px;width:22%;">${escapeHtml(category.label)}</td>
      <td style="padding:7px 10px;width:56%;">
        <div class="theme-track" style="height:7px;background:#d7d4cc;background-image:linear-gradient(#d7d4cc,#d7d4cc);border-radius:999px;width:${beforeWidth}%;margin-bottom:4px;"></div>
        <div style="height:10px;background:#d5a143;background-image:linear-gradient(#d5a143,#d5a143);border-radius:999px;width:${afterWidth}%;"></div>
      </td>
      <td class="theme-muted" align="right" style="padding:7px 0;color:#686b65;-webkit-text-fill-color:#686b65;font-size:12px;white-space:nowrap;width:22%;"><strong class="theme-accent" style="color:#8a5a12;-webkit-text-fill-color:#8a5a12;">${category.afterPercent.toFixed(0)}%</strong> ${deltaLabel(category.delta)}</td>
    </tr>`;
  }).join('');
}

function stageBlock(label, status, total) {
  const newPercent = percent(status['brand-new'], total);
  const existingPercent = 100 - newPercent;
  return `<td valign="top" width="50%" style="padding:0 8px;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
      <tr><td class="theme-muted" style="padding-bottom:7px;color:#686b65;-webkit-text-fill-color:#686b65;font-size:12px;">${escapeHtml(label)}</td><td class="theme-muted" align="right" style="padding-bottom:7px;color:#686b65;-webkit-text-fill-color:#686b65;font-size:12px;">${total} profiles</td></tr>
      <tr><td colspan="2"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr>
        <td align="center" bgcolor="#d5a143" style="width:${newPercent.toFixed(2)}%;padding:9px 2px;color:#171916;-webkit-text-fill-color:#171916;font-size:11px;font-weight:700;">${newPercent.toFixed(0)}%</td>
        <td align="center" bgcolor="#aeb1aa" style="width:${existingPercent.toFixed(2)}%;padding:9px 2px;color:#171916;-webkit-text-fill-color:#171916;font-size:11px;font-weight:700;">${existingPercent.toFixed(0)}%</td>
      </tr></table></td></tr>
    </table>
  </td>`;
}

function quickView(entry) {
  const status = entry.garden_status === 'brand-new' ? 'New gardener' : 'Existing garden';
  const crops = (Array.isArray(entry.growing) ? entry.growing : [])
    .slice(0, 3)
    .map((key) => CATEGORY_LABELS[key] || key)
    .join(', ');
  return `${status} · ${crops || 'Not specified'}`;
}

function peopleRows(batch) {
  return batch.map((entry) => `<tr class="person-row">
    <td class="person-cell theme-border" valign="top" style="padding:11px 7px;border-top:1px solid #dedbd3;width:37%;overflow-wrap:anywhere;"><strong class="theme-text" style="display:block;color:#20221f;-webkit-text-fill-color:#20221f;font-size:13px;">${escapeHtml(entry.full_name)}</strong><span class="theme-muted" style="display:block;margin-top:3px;color:#686b65;-webkit-text-fill-color:#686b65;font-size:11px;">${escapeHtml(entry.email)}</span></td>
    <td class="person-cell theme-muted theme-border" valign="top" style="padding:11px 7px;border-top:1px solid #dedbd3;color:#686b65;-webkit-text-fill-color:#686b65;font-size:11px;width:20%;white-space:nowrap;">${escapeHtml(entry.phone || 'Not provided')}</td>
    <td class="person-cell theme-muted theme-border" valign="top" style="padding:11px 7px;border-top:1px solid #dedbd3;color:#686b65;-webkit-text-fill-color:#686b65;font-size:11px;width:10%;">${escapeHtml(normalizeZip(entry.zip_code))}</td>
    <td class="person-cell theme-muted theme-border" valign="top" style="padding:11px 7px;border-top:1px solid #dedbd3;color:#686b65;-webkit-text-fill-color:#686b65;font-size:11px;width:33%;">${escapeHtml(quickView(entry))}</td>
  </tr>`).join('');
}

export async function buildGiveawayLeadReportEmail({ model, testing = false, generatedAt = new Date() }) {
  const map = await buildGiveawayLeadMap(model.batch);
  const mapCaption = `${map.mappedPeople} people mapped across ${map.mappedZipCount} ZIP codes${map.unmappedPeople ? ` · ${map.unmappedPeople} ZIP ${map.unmappedPeople === 1 ? 'needs' : 'need'} review` : ''}`;
  const nextTotal = model.endOrdinal + model.batchSize;
  const subject = `${testing ? '[TEST] ' : ''}${leadReportSubject(model.batchNumber)}`;
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark"><title>${escapeHtml(subject)}</title>
<style>:root{color-scheme:light dark;supported-color-schemes:light dark}@media(max-width:560px){.email-pad{padding-left:16px!important;padding-right:16px!important}.kpi{display:block!important;width:100%!important;border-right:0!important;border-bottom:1px solid #dedbd3!important}.stage-cell{display:block!important;width:100%!important;padding:7px 0!important}.people-head{display:none!important}.person-row,.person-cell{display:block!important;width:100%!important}.person-row{padding:10px 0;border-top:1px solid #dedbd3}.person-cell{padding:3px 0!important;border:0!important;white-space:normal!important}}@media(prefers-color-scheme:dark){.theme-page{background:#141514!important;background-image:linear-gradient(#141514,#141514)!important}.theme-card,.theme-section{background:#202220!important;background-image:linear-gradient(#202220,#202220)!important}.theme-section-alt,.theme-footer{background:#282a28!important;background-image:linear-gradient(#282a28,#282a28)!important}.theme-hero{background:#2d2a24!important;background-image:linear-gradient(#2d2a24,#2d2a24)!important}.theme-text{color:#f4f4f0!important;-webkit-text-fill-color:#f4f4f0!important}.theme-muted{color:#c7c9c4!important;-webkit-text-fill-color:#c7c9c4!important}.theme-accent{color:#efc269!important;-webkit-text-fill-color:#efc269!important}.theme-border{border-color:#424541!important}.theme-track{background:#535650!important;background-image:linear-gradient(#535650,#535650)!important}.theme-test{background:#3a321f!important;background-image:linear-gradient(#3a321f,#3a321f)!important;color:#ffe1a3!important;-webkit-text-fill-color:#ffe1a3!important}}[data-ogsc] .theme-page{background:#141514!important;background-image:linear-gradient(#141514,#141514)!important}[data-ogsc] .theme-card,[data-ogsc] .theme-section{background:#202220!important;background-image:linear-gradient(#202220,#202220)!important}[data-ogsc] .theme-section-alt,[data-ogsc] .theme-footer{background:#282a28!important;background-image:linear-gradient(#282a28,#282a28)!important}[data-ogsc] .theme-hero{background:#2d2a24!important;background-image:linear-gradient(#2d2a24,#2d2a24)!important}[data-ogsc] .theme-text{color:#f4f4f0!important;-webkit-text-fill-color:#f4f4f0!important}[data-ogsc] .theme-muted{color:#c7c9c4!important;-webkit-text-fill-color:#c7c9c4!important}[data-ogsc] .theme-accent{color:#efc269!important;-webkit-text-fill-color:#efc269!important}[data-ogsc] .theme-border{border-color:#424541!important}[data-ogsc] .theme-track{background:#535650!important;background-image:linear-gradient(#535650,#535650)!important}</style></head>
<body class="theme-page theme-text" bgcolor="#efede8" style="margin:0;background:#efede8;background-image:linear-gradient(#efede8,#efede8);font-family:Arial,Helvetica,sans-serif;color:#20221f;-webkit-text-fill-color:#20221f;">
<div style="display:none;max-height:0;overflow:hidden;">Latest ${model.batchSize} giveaway leads. ${model.totalLeadsSinceAugust} total leads since August; ${model.giveawayLeadsSinceSeptember} Big Garden Giveaway leads since September.</div>
<table class="theme-page" role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#efede8" style="background:#efede8;background-image:linear-gradient(#efede8,#efede8);"><tr><td align="center" style="padding:24px 10px;">
<table class="theme-card theme-border" role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#ffffff" style="width:100%;max-width:680px;background:#ffffff;background-image:linear-gradient(#ffffff,#ffffff);border:1px solid #d8d5cd;border-radius:16px;overflow:hidden;">
  <tr><td class="email-pad" bgcolor="#171916" style="padding:18px 24px;background:#171916;background-image:linear-gradient(#171916,#171916);border-bottom:1px solid #343632;"><table role="presentation" width="100%"><tr><td><img src="${LOGO_URL}" width="190" alt="Soil Seed &amp; Water" style="display:block;width:190px;max-width:100%;height:auto;border:0;"></td><td align="right" style="color:#f1f1ed;-webkit-text-fill-color:#f1f1ed;font-size:12px;">SSW Lead Report</td></tr></table></td></tr>
  ${testing ? '<tr><td class="email-pad theme-test" style="padding:11px 24px;background:#fff8e7;background-image:linear-gradient(#fff8e7,#fff8e7);color:#684e12;-webkit-text-fill-color:#684e12;font-size:12px;"><strong>Internal production test:</strong> delivered only to Rodolfo. Live batching is not triggered by this test.</td></tr>' : ''}
  <tr><td class="email-pad theme-hero theme-text" bgcolor="#f4eee2" style="padding:27px 24px 23px;background:#f4eee2;background-image:linear-gradient(#f4eee2,#f4eee2);color:#20221f;-webkit-text-fill-color:#20221f;"><div class="theme-accent" style="color:#8a5a12;-webkit-text-fill-color:#8a5a12;font-size:12px;font-weight:700;letter-spacing:1.3px;text-transform:uppercase;">Big Garden Giveaway</div><h1 class="theme-text" style="margin:7px 0 7px;color:#171916;-webkit-text-fill-color:#171916;font-size:29px;line-height:1.2;">SSW Lead Report #${model.batchNumber}</h1><p class="theme-muted" style="margin:0;color:#555852;-webkit-text-fill-color:#555852;font-size:15px;line-height:1.5;"><strong class="theme-text" style="color:#20221f;-webkit-text-fill-color:#20221f;">This report covers the latest ${model.batchSize} giveaway lead submissions.</strong><br>Total leads since August: ${model.totalLeadsSinceAugust}.<br>Big Garden Giveaway leads since September: ${model.giveawayLeadsSinceSeptember}.</p></td></tr>
  <tr><td class="theme-section" bgcolor="#ffffff" style="padding:0;background:#ffffff;background-image:linear-gradient(#ffffff,#ffffff);"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr>
    <td class="kpi theme-border" width="33.33%" style="padding:17px 20px;border-right:1px solid #dedbd3;"><span class="theme-muted" style="display:block;color:#686b65;-webkit-text-fill-color:#686b65;font-size:11px;">Leads in this report</span><strong class="theme-accent" style="display:block;margin-top:4px;color:#8a5a12;-webkit-text-fill-color:#8a5a12;font-size:18px;">${model.batchSize}</strong></td>
    <td class="kpi theme-border" width="33.33%" style="padding:17px 20px;border-right:1px solid #dedbd3;"><span class="theme-muted" style="display:block;color:#686b65;-webkit-text-fill-color:#686b65;font-size:11px;">Total leads since August</span><strong class="theme-accent" style="display:block;margin-top:4px;color:#8a5a12;-webkit-text-fill-color:#8a5a12;font-size:18px;">${model.totalLeadsSinceAugust}</strong></td>
    <td class="kpi" width="33.33%" style="padding:17px 20px;"><span class="theme-muted" style="display:block;color:#686b65;-webkit-text-fill-color:#686b65;font-size:11px;">Giveaway since September</span><strong class="theme-accent" style="display:block;margin-top:4px;color:#8a5a12;-webkit-text-fill-color:#8a5a12;font-size:18px;">${model.giveawayLeadsSinceSeptember}</strong></td>
  </tr></table></td></tr>
  <tr><td class="email-pad theme-section theme-border" bgcolor="#ffffff" style="padding:24px;background:#ffffff;background-image:linear-gradient(#ffffff,#ffffff);border-top:1px solid #dedbd3;"><table role="presentation" width="100%"><tr><td><h2 class="theme-text" style="margin:0;color:#20221f;-webkit-text-fill-color:#20221f;font-size:20px;">What profiled leads are growing</h2></td><td class="theme-muted" align="right" style="color:#686b65;-webkit-text-fill-color:#686b65;font-size:11px;">${model.afterTotal} categorized profiles · all 9 categories</td></tr></table><p class="theme-muted" style="margin:8px 0 0;color:#686b65;-webkit-text-fill-color:#686b65;font-size:11px;line-height:1.45;">Category insights use only leads who answered the growing questions; earlier leads are included in the headline total but not assumed here.</p><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top:13px;">${categoryRows(model)}</table></td></tr>
  <tr><td class="email-pad theme-section-alt theme-border" bgcolor="#f8f7f3" style="padding:24px;background:#f8f7f3;background-image:linear-gradient(#f8f7f3,#f8f7f3);border-top:1px solid #dedbd3;"><table role="presentation" width="100%"><tr><td><h2 class="theme-text" style="margin:0;color:#20221f;-webkit-text-fill-color:#20221f;font-size:20px;">Gardening journey</h2></td><td class="theme-muted" align="right" style="color:#686b65;-webkit-text-fill-color:#686b65;font-size:11px;">${model.baselineCount} prior profiles + ${model.endOrdinal} giveaway entrants</td></tr></table><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top:14px;"><tr>${stageBlock('Before', model.beforeStatus, model.beforeTotal).replace('<td ', '<td class="stage-cell" ')}${stageBlock('Now', model.afterStatus, model.afterTotal).replace('<td ', '<td class="stage-cell" ')}</tr></table><p class="theme-muted" style="margin:11px 0 0;color:#686b65;-webkit-text-fill-color:#686b65;font-size:11px;"><span style="color:#d5a143;-webkit-text-fill-color:#d5a143;">●</span> New or starting &nbsp;&nbsp; <span style="color:#898d86;-webkit-text-fill-color:#898d86;">●</span> Improving an existing garden</p></td></tr>
  <tr><td class="email-pad theme-section theme-border" bgcolor="#ffffff" style="padding:24px;background:#ffffff;background-image:linear-gradient(#ffffff,#ffffff);border-top:1px solid #dedbd3;"><table role="presentation" width="100%"><tr><td><h2 class="theme-text" style="margin:0;color:#20221f;-webkit-text-fill-color:#20221f;font-size:20px;">Where the latest 30 leads are</h2></td><td class="theme-muted" align="right" style="color:#686b65;-webkit-text-fill-color:#686b65;font-size:11px;">${escapeHtml(mapCaption)}</td></tr></table><img src="cid:${MAP_CONTENT_ID}" width="560" alt="Phoenix metro map showing the ${map.mappedPeople} leads in this report." style="display:block;width:100%;max-width:560px;height:auto;margin:15px auto 0;border:0;border-radius:12px;"></td></tr>
  <tr><td class="email-pad theme-section theme-border" bgcolor="#ffffff" style="padding:24px;background:#ffffff;background-image:linear-gradient(#ffffff,#ffffff);border-top:1px solid #dedbd3;"><table role="presentation" width="100%"><tr><td><h2 class="theme-text" style="margin:0;color:#20221f;-webkit-text-fill-color:#20221f;font-size:20px;">Latest ${model.batchSize} lead submissions</h2></td><td class="theme-muted" align="right" style="color:#686b65;-webkit-text-fill-color:#686b65;font-size:11px;">Contact details + quick context</td></tr></table><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top:14px;table-layout:fixed;"><thead class="people-head"><tr><th class="theme-muted" align="left" style="padding:0 7px 9px;color:#686b65;-webkit-text-fill-color:#686b65;font-size:11px;width:37%;">Person</th><th class="theme-muted" align="left" style="padding:0 7px 9px;color:#686b65;-webkit-text-fill-color:#686b65;font-size:11px;width:20%;">Phone</th><th class="theme-muted" align="left" style="padding:0 7px 9px;color:#686b65;-webkit-text-fill-color:#686b65;font-size:11px;width:10%;">ZIP</th><th class="theme-muted" align="left" style="padding:0 7px 9px;color:#686b65;-webkit-text-fill-color:#686b65;font-size:11px;width:33%;">Quick view</th></tr></thead><tbody>${peopleRows(model.batch)}</tbody></table></td></tr>
  <tr><td class="email-pad theme-footer theme-muted theme-border" align="center" bgcolor="#f4f2ec" style="padding:17px 24px;background:#f4f2ec;background-image:linear-gradient(#f4f2ec,#f4f2ec);border-top:1px solid #dedbd3;color:#686b65;-webkit-text-fill-color:#686b65;font-size:11px;line-height:1.5;">Generated ${escapeHtml(phoenixTime(generatedAt))} AZ · ${model.baselineCount} profiled worm-castings signups included · Next report after lead ${nextTotal}</td></tr>
</table></td></tr></table></body></html>`;
  const text = `${subject}\n\nThis report covers the latest ${model.batchSize} giveaway lead submissions. Total leads since August: ${model.totalLeadsSinceAugust}. Big Garden Giveaway leads since September: ${model.giveawayLeadsSinceSeptember}. Category insights use ${model.afterTotal} profiled responses. ZIPs in this report: ${model.uniqueZips}.\n\n${model.batch.map((entry, index) => `${index + 1}. ${entry.full_name} — ${entry.email} — ${entry.phone || 'No phone'} — ZIP ${normalizeZip(entry.zip_code)} — ${quickView(entry)}`).join('\n')}\n\nNext report after lead ${nextTotal}.`;
  return {
    subject,
    html,
    text,
    attachment: {
      content: map.buffer,
      filename: `giveaway-lead-report-${model.batchNumber}-map.png`,
      contentId: MAP_CONTENT_ID,
    },
    map,
  };
}

export async function loadGiveawayLeadReportData({
  db,
  batchNumber,
  batchSize = GIVEAWAY_LEAD_REPORT_BATCH_SIZE,
  entryStart = (batchNumber - 1) * batchSize + 1,
  entryEnd = entryStart + batchSize - 1,
}) {
  const [giveawayResult, wormResult, countResult, customerResult, allGiveawayResult, eventResult, leadResult] = await Promise.all([
    db.from('sp_giveaway_entries')
      .select('id,full_name,email,phone,zip_code,garden_status,growing,growing_other,created_at')
      .eq('campaign_key', GIVEAWAY_CAMPAIGN_KEY)
      .eq('is_preview', false)
      .not('email', 'ilike', '%@example.com')
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(0, entryEnd - 1),
    db.from('sp_worm_castings_redemptions')
      .select('email,created_at,zip_code,garden_status,growing'),
    db.from('sp_giveaway_entries')
      .select('id', { count: 'exact', head: true })
      .eq('campaign_key', GIVEAWAY_CAMPAIGN_KEY)
      .eq('is_preview', false)
      .not('email', 'ilike', '%@example.com'),
    db.from('sp_customers').select('email,created_at').gte('created_at', AUGUST_LEAD_START),
    db.from('sp_giveaway_entries').select('email,created_at').eq('is_preview', false).gte('created_at', AUGUST_LEAD_START).not('email', 'ilike', '%@example.com'),
    db.from('sp_event_registrations').select('email,created_at').gte('created_at', AUGUST_LEAD_START).not('email', 'ilike', '%@example.com'),
    db.from('sp_leads').select('email,created_at').gte('created_at', AUGUST_LEAD_START).not('email', 'ilike', '%@example.com'),
  ]);
  if (giveawayResult.error) throw giveawayResult.error;
  if (wormResult.error) throw wormResult.error;
  if (countResult.error) throw countResult.error;
  if (customerResult.error) throw customerResult.error;
  if (allGiveawayResult.error) throw allGiveawayResult.error;
  if (eventResult.error) throw eventResult.error;
  if (leadResult.error) throw leadResult.error;
  if ((giveawayResult.data || []).length < entryEnd) throw new Error(`Batch ${batchNumber} is not complete yet.`);
  return {
    giveawayEntries: giveawayResult.data,
    wormProfiles: wormResult.data || [],
    entryStart,
    entryEnd,
    giveawayTotalCount: Number(countResult.count || 0),
    allGiveawayRows: allGiveawayResult.data || [],
    allLeadRows: [
      ...(customerResult.data || []),
      ...(wormResult.data || []),
      ...(allGiveawayResult.data || []),
      ...(eventResult.data || []),
      ...(leadResult.data || []),
    ],
  };
}

function providerKey(email) {
  return String(email || '').trim().toLowerCase();
}

export async function sendGiveawayLeadReport({
  resend,
  report,
  model,
  recipients,
  scheduledAt = null,
  priorProviderIds = {},
  idempotencySuffix = '',
}) {
  const providerIds = { ...priorProviderIds };
  const jobs = recipients
    .filter((recipient) => !providerIds[providerKey(recipient.email)])
    .map((recipient) => ({
      recipient,
      promise: resend.emails.send({
        from: GIVEAWAY_LEAD_REPORT_FROM,
        replyTo: GIVEAWAY_LEAD_REPORT_REPLY_TO,
        to: recipient.email,
        subject: report.subject,
        html: report.html,
        text: report.text,
        attachments: [report.attachment],
        headers: staffAlertThreadingHeaders(GIVEAWAY_LEAD_REPORT_THREAD_ID),
        tags: [
          { name: 'campaign', value: 'giveaway_lead_report' },
          { name: 'batch', value: String(model.batchNumber) },
        ],
        ...(scheduledAt ? { scheduledAt } : {}),
      }, {
        idempotencyKey: `giveaway-lead-${model.batchNumber}-${providerKey(recipient.email).replace(/[^a-z0-9]+/g, '-')}${idempotencySuffix}`,
      }),
    }));
  const settled = await Promise.allSettled(jobs.map((job) => job.promise));
  const errors = [];
  settled.forEach((result, index) => {
    const email = providerKey(jobs[index].recipient.email);
    if (result.status === 'fulfilled' && result.value?.data?.id) providerIds[email] = result.value.data.id;
    else errors.push(`${email}: ${result.status === 'rejected' ? result.reason?.message : result.value?.error?.message || 'Provider did not return an id'}`);
  });
  return {
    providerIds,
    errors,
    complete: recipients.every((recipient) => Boolean(providerIds[providerKey(recipient.email)])),
  };
}

async function readReportRow(db, batchNumber) {
  const { data, error } = await db.from(GIVEAWAY_LEAD_REPORT_TABLE)
    .select('*')
    .eq('campaign_key', GIVEAWAY_CAMPAIGN_KEY)
    .eq('batch_number', batchNumber)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function claimGiveawayLeadReport({
  db,
  batchNumber,
  batchSize = GIVEAWAY_LEAD_REPORT_BATCH_SIZE,
  entryStart = (batchNumber - 1) * batchSize + 1,
  entryEnd = entryStart + batchSize - 1,
}) {
  const now = new Date().toISOString();
  const row = {
    campaign_key: GIVEAWAY_CAMPAIGN_KEY,
    batch_number: batchNumber,
    batch_size: batchSize,
    entry_start: entryStart,
    entry_end: entryEnd,
    status: 'sending',
    updated_at: now,
  };
  const inserted = await db.from(GIVEAWAY_LEAD_REPORT_TABLE).insert(row).select('*').single();
  if (!inserted.error) return { claimed: true, row: inserted.data };
  if (inserted.error.code !== '23505') throw inserted.error;
  const existing = await readReportRow(db, batchNumber);
  if (!existing || !['failed', 'partial'].includes(existing.status)) return { claimed: false, row: existing };
  const retried = await db.from(GIVEAWAY_LEAD_REPORT_TABLE)
    .update({
      batch_size: batchSize,
      entry_start: entryStart,
      entry_end: entryEnd,
      status: 'sending',
      last_error: null,
      updated_at: now,
    })
    .eq('id', existing.id)
    .in('status', ['failed', 'partial'])
    .select('*')
    .maybeSingle();
  if (retried.error) throw retried.error;
  return { claimed: Boolean(retried.data), row: retried.data || existing };
}

async function finishGiveawayLeadReport({ db, row, delivery, scheduledAt = null }) {
  const now = new Date().toISOString();
  const status = delivery.complete ? (scheduledAt ? 'scheduled' : 'sent') : Object.keys(delivery.providerIds).length ? 'partial' : 'failed';
  const updates = {
    status,
    recipient_provider_ids: delivery.providerIds,
    scheduled_at: scheduledAt || null,
    sent_at: delivery.complete && !scheduledAt ? now : null,
    last_error: delivery.errors.length ? delivery.errors.join(' | ').slice(0, 4000) : null,
    updated_at: now,
  };
  const { data, error } = await db.from(GIVEAWAY_LEAD_REPORT_TABLE).update(updates).eq('id', row.id).select('*').single();
  if (error) throw error;
  return data;
}

export async function deliverGiveawayLeadReportBatch({
  db,
  resend,
  batchNumber,
  batchSize = GIVEAWAY_LEAD_REPORT_BATCH_SIZE,
  entryStart = (batchNumber - 1) * batchSize + 1,
  entryEnd = entryStart + batchSize - 1,
  recipients = getGiveawayLeadReportRecipients(),
  scheduledAt = null,
  idempotencySuffix = '',
}) {
  const claim = await claimGiveawayLeadReport({ db, batchNumber, batchSize, entryStart, entryEnd });
  if (!claim.claimed) return { skipped: true, row: claim.row };
  try {
    const data = await loadGiveawayLeadReportData({ db, batchNumber, batchSize, entryStart, entryEnd });
    const model = buildGiveawayLeadReportModel({ batchNumber, batchSize, ...data });
    const report = await buildGiveawayLeadReportEmail({ model });
    const delivery = await sendGiveawayLeadReport({
      resend,
      report,
      model,
      recipients,
      scheduledAt,
      priorProviderIds: claim.row?.recipient_provider_ids || {},
      idempotencySuffix,
    });
    const row = await finishGiveawayLeadReport({ db, row: claim.row, delivery, scheduledAt });
    return { skipped: false, row, model, delivery };
  } catch (error) {
    await db.from(GIVEAWAY_LEAD_REPORT_TABLE).update({
      status: 'failed',
      last_error: String(error?.message || error).slice(0, 4000),
      updated_at: new Date().toISOString(),
    }).eq('id', claim.row.id);
    throw error;
  }
}

export async function maybeSendGiveawayLeadReports({
  db,
  resend,
  recipients = getGiveawayLeadReportRecipients(),
  batchSize = GIVEAWAY_LEAD_REPORT_BATCH_SIZE,
}) {
  const { count, error } = await db.from('sp_giveaway_entries')
    .select('id', { count: 'exact', head: true })
    .eq('campaign_key', GIVEAWAY_CAMPAIGN_KEY)
    .eq('is_preview', false)
    .not('email', 'ilike', '%@example.com');
  if (error) throw error;
  const latestResult = await db.from(GIVEAWAY_LEAD_REPORT_TABLE)
    .select('batch_number,entry_end,status')
    .eq('campaign_key', GIVEAWAY_CAMPAIGN_KEY)
    .in('status', ['sending', 'scheduled', 'sent', 'partial'])
    .order('entry_end', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latestResult.error) throw latestResult.error;
  if (!latestResult.data) return { count: Number(count || 0), completedBatches: 0, results: [], awaitingInitialReport: true };
  let lastEntryEnd = Number(latestResult.data.entry_end);
  let nextBatchNumber = Number(latestResult.data.batch_number) + 1;
  const results = [];
  while (lastEntryEnd + batchSize <= Number(count || 0)) {
    const entryStart = lastEntryEnd + 1;
    const entryEnd = lastEntryEnd + batchSize;
    results.push(await deliverGiveawayLeadReportBatch({
      db,
      resend,
      batchNumber: nextBatchNumber,
      batchSize,
      entryStart,
      entryEnd,
      recipients,
    }));
    lastEntryEnd = entryEnd;
    nextBatchNumber += 1;
  }
  return {
    count: Number(count || 0),
    completedBatches: Number(latestResult.data.batch_number) + results.length,
    results,
    nextReportAt: lastEntryEnd + batchSize,
  };
}
