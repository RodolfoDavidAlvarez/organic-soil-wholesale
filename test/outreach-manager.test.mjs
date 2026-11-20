import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import handler from "../api/outreach-desk.js";
import {
  classifyStatus,
  deriveColdMetrics,
  normalizeEmail,
  planSuppressionInsert,
  quoteIdent,
  readyMembership,
  resolveOutreachTarget,
  rowIsReady,
  safeOutreachRedirect,
  suppressionIndex,
} from "../shared/outreachMetrics.js";

const leadColumns = [
  { column_name: "id" },
  { column_name: "email" },
  { column_name: "status" },
  { column_name: "category" },
  { column_name: "created_at" },
];

const ready = readyMembership(
  [
    { id: "1", email: "Ready@Example.com" },
    { email: "second@example.com" },
  ],
  [{ column_name: "id" }, { column_name: "email" }],
);

assert.equal(ready.emails.has("ready@example.com"), true);
assert.equal(ready.ids.has("1"), true);
assert.equal(rowIsReady({ id: "9", email: "second@example.com" }, leadColumns, ready), true);
assert.equal(rowIsReady({ id: "1", email: "other@example.com" }, leadColumns, ready), true);
assert.equal(rowIsReady({ id: "3", email: "nope@example.com" }, leadColumns, ready), false);

const suppression = suppressionIndex(
  [
    { email: "Bounce@Example.com", reason: "hard bounce" },
    { email: "later@example.com", reason: "unsubscribe" },
    { email: "plain@example.com" },
  ],
  [{ column_name: "email" }, { column_name: "reason" }],
);
assert.equal(suppression.byEmail.get("bounce@example.com").label, "Bounced");
assert.equal(suppression.byEmail.get("later@example.com").label, "Do not email");
assert.equal(suppression.byEmail.get("plain@example.com").label, "Bounced");
assert.equal(suppression.count, 3);

assert.equal(classifyStatus("new"), "not_sent");
assert.equal(classifyStatus("replied"), "replied");

const metrics = deriveColdMetrics(
  ["status", "category", "source", "created_at"],
  [
    { status: "new", category: "nursery", source: "yard", created_at: "2026-11-01T12:00:00Z" },
    { status: "sent", category: "nursery", source: "yard", created_at: "2026-11-02T12:00:00Z" },
    { status: "bounced", category: "nursery", source: "yard", created_at: "2026-11-03T12:00:00Z" },
    { status: "replied", category: "farm", source: "form", created_at: "2026-11-04T12:00:00Z" },
    { status: "mystery", category: "farm", source: "form", created_at: "2026-11-05T12:00:00Z" },
  ],
);
assert.equal(metrics.totals.sent, 3);
assert.equal(metrics.totals.bounced, 1);
assert.equal(metrics.totals.replied, 1);
assert.equal(metrics.byDay.length, 0);
assert.equal(metrics.dayBasis, null);
assert.equal(metrics.unclassifiedStatuses[0].status, "mystery");

const dated = deriveColdMetrics(
  ["status", "sent_at"],
  [{ status: "sent", sent_at: "2026-11-02T18:30:00Z" }],
);
assert.equal(dated.byDay.length, 1);
assert.equal(dated.byDay[0].key, "2026-11-02");

assert.equal(safeOutreachRedirect("https://organicsoilwholesale.com/admin/outreach"), "https://organicsoilwholesale.com/admin/outreach");
assert.equal(safeOutreachRedirect("http://localhost:3000/admin/outreach"), "http://localhost:3000/admin/outreach");
assert.equal(safeOutreachRedirect("https://evil.example/admin/outreach"), null);
assert.equal(safeOutreachRedirect("https://organicsoilwholesale.com/admin/outreach/extra"), null);
assert.equal(safeOutreachRedirect("javascript:alert(1)"), null);

assert.throws(() => quoteIdent("email;drop"), /Unsafe/);
assert.equal(quoteIdent("email"), '"email"');

const plan = planSuppressionInsert(
  [
    { column_name: "email", is_nullable: "NO", column_default: null },
    { column_name: "reason", is_nullable: "YES", column_default: null },
  ],
  "  Person@Example.com ",
  "ralvarez@soilseedandwater.com",
);
assert.equal(plan.ok, true);
assert.equal(plan.row.email, "person@example.com");

const blocked = planSuppressionInsert(
  [
    { column_name: "email", is_nullable: "NO", column_default: null },
    { column_name: "provider_id", is_nullable: "NO", column_default: null },
  ],
  "person@example.com",
  "ralvarez@soilseedandwater.com",
);
assert.equal(blocked.ok, false);
assert.match(blocked.reason, /provider_id/);

const manager = readFileSync(new URL("../shared/outreachManager.js", import.meta.url), "utf8");
const page = readFileSync(new URL("../client/src/pages/admin/OutreachDesk.tsx", import.meta.url), "utf8");
for (const source of [manager, page]) {
  assert.doesNotMatch(source, /\b(resend|twilio|quo)\b/i);
  assert.doesNotMatch(source, /\.csv\b/i);
  assert.doesNotMatch(source, /create\s+or\s+replace\s+view[\s\S]{0,80}sp_outbound_ready/i);
  assert.doesNotMatch(source, /drop\s+view[\s\S]{0,40}sp_outbound_ready/i);
  assert.doesNotMatch(source, /alter\s+view[\s\S]{0,40}sp_outbound_ready/i);
  assert.doesNotMatch(source, /tel:/i);
}
assert.match(manager, /from public\.sp_outbound_ready|from public\.\$\{quoteIdent\(table\)\}/);
assert.match(page, /Ready to send/);
assert.match(page, /Bounced/);

const migration = readFileSync(new URL("../supabase/migrations/20261114053000_outreach_manager.sql", import.meta.url), "utf8");
const executable = migration.replace(/--.*$/gm, "");
assert.equal(executable.includes("sp_outbound_ready"), false);
assert.match(migration, /security_invoker = true/);
assert.match(migration, /enable row level security/i);
assert.doesNotMatch(executable, /security definer/i);
assert.match(migration, /sp_rodo_notes/);
assert.match(migration, /ralvarez@soilseedandwater.com/);
assert.match(migration, /vanessa@soilseedandwater.com/);

assert.equal(normalizeEmail("  A@B.com "), "a@b.com");

assert.equal(resolveOutreachTarget({ url: "/api/admin/outreach/me" }).path, "/api/admin/outreach/me");
assert.equal(resolveOutreachTarget({ url: "/api/outreach-desk?route=rows&tab=leads" }).path, "/api/admin/outreach/rows");
assert.equal(resolveOutreachTarget({ url: "/api/outreach-desk?route=rows&tab=leads" }).url.searchParams.get("tab"), "leads");
assert.equal(resolveOutreachTarget({ url: "/api/outreach-desk?route=views/delete" }).path, "/api/admin/outreach/views/delete");
assert.equal(
  resolveOutreachTarget({
    url: "/api/outreach-desk",
    headers: { "x-forwarded-uri": "/api/admin/outreach/notes?entityType=outbound_lead&entityId=1" },
  }).path,
  "/api/admin/outreach/notes",
);

function mockRes() {
  return {
    statusCode: 200,
    headers: {},
    body: undefined,
    setHeader(name, value) { this.headers[String(name).toLowerCase()] = value; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
    end() { return this; },
  };
}

function rewritten(fullPath) {
  const url = new URL(fullPath, "https://desk.local");
  const route = url.pathname.replace(/^\/api\/admin\/outreach\/?/, "");
  const next = new URL("/api/outreach-desk", "https://desk.local");
  if (route) next.searchParams.set("route", route);
  url.searchParams.forEach((value, key) => next.searchParams.append(key, value));
  return `${next.pathname}${next.search}`;
}

const routed = [
  ["GET", "/api/admin/outreach/me", 401],
  ["POST", "/api/admin/outreach/login", 401],
  ["POST", "/api/admin/outreach/request-link", 200],
  ["POST", "/api/admin/outreach/session", 401],
  ["GET", "/api/admin/outreach/rows?tab=leads", 401],
  ["GET", "/api/admin/outreach/rows?tab=waiting", 401],
  ["GET", "/api/admin/outreach/rows?tab=replies", 401],
  ["GET", "/api/admin/outreach/rows?tab=metrics", 401],
  ["POST", "/api/admin/outreach/cell", 401],
  ["POST", "/api/admin/outreach/bulk", 401],
  ["POST", "/api/admin/outreach/note", 401],
  ["GET", "/api/admin/outreach/notes?entityType=outbound_lead&entityId=1", 401],
  ["GET", "/api/admin/outreach/views", 401],
  ["POST", "/api/admin/outreach/views", 401],
  ["POST", "/api/admin/outreach/views/delete", 401],
  ["POST", "/api/admin/outreach/decision", 401],
];

for (const [method, fullPath, status] of routed) {
  for (const url of [fullPath, rewritten(fullPath)]) {
    const res = mockRes();
    await handler({ method, url, headers: { host: "www.organicsoilwholesale.com" }, body: {} }, res);
    assert.equal(res.statusCode, status, `${method} ${url} -> ${res.statusCode} ${JSON.stringify(res.body)}`);
    assert.notEqual(res.body?.error, "API endpoint not found");
  }
}

const missing = mockRes();
await handler({ method: "GET", url: "/api/outreach-desk?route=nope", headers: {}, body: {} }, missing);
assert.equal(missing.statusCode, 404);
assert.equal(missing.body.error, "Not found");

const preflight = mockRes();
await handler({ method: "OPTIONS", url: "/api/outreach-desk?route=me", headers: {} }, preflight);
assert.equal(preflight.statusCode, 200);
assert.match(preflight.headers["access-control-allow-headers"], /Authorization/);

const vercel = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));
const sources = vercel.rewrites.map((rule) => rule.source);
const catchAll = sources.indexOf("/api/:path*");
assert.ok(sources.indexOf("/api/admin/outreach") < catchAll);
assert.ok(sources.indexOf("/api/admin/outreach/:path*") < catchAll);
assert.equal(vercel.rewrites.find((rule) => rule.source === "/api/admin/outreach/:path*").destination, "/api/outreach-desk?route=:path*");
const api = readFileSync(new URL("../api/index.js", import.meta.url), "utf8");
assert.match(api, /path === '\/api\/admin\/outreach' \|\| path\.startsWith\('\/api\/admin\/outreach\/'\)/);

console.log("outreach manager checks: ok");
