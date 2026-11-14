// Pure helpers for the outreach desk. No database, no email, no messaging.

export const OUTREACH_AUDIENCE = "osw-outreach";

const SENT_STATUSES = new Set([
  "sent",
  "followed-up",
  "followed_up",
  "followup",
  "followedup",
  "replied",
  "reply",
  "cold_no_reply",
  "cold",
  "bounced",
  "bounce",
  "sample",
  "sample_requested",
  "quoted",
  "quote",
  "quote_requested",
  "positive",
  "interested",
]);

const NOT_SENT_STATUSES = new Set([
  "new",
  "draft",
  "unsent",
  "queued",
  "pending",
  "suppressed",
  "do_not_contact",
  "do-not-contact",
  "skipped",
  "unsubscribed",
]);

const REPLIED_STATUSES = new Set([
  "replied",
  "reply",
  "positive",
  "interested",
  "sample",
  "sample_requested",
  "quoted",
  "quote",
  "quote_requested",
]);

const BOUNCED_STATUSES = new Set(["bounced", "bounce"]);

const EDITABLE_NAMES = new Set([
  "status",
  "category",
  "stage",
  "notes",
  "note",
  "next_action",
  "close_reason",
  "outcome",
  "last_outcome",
  "priority",
  "tags",
  "osw_status",
  "contact_category",
  "intake_notes",
  "newsletter_notes",
]);

const BLOCKED_NAME = /password|secret|token|hash|stripe|payment|amount|cents|bytea/i;

export function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

export function safeOutreachRedirect(value) {
  if (!value || typeof value !== "string") return null;
  let url;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  const host = url.hostname;
  const local = host === "localhost" || host === "127.0.0.1";
  const hosted =
    host === "organicsoilwholesale.com" ||
    host === "www.organicsoilwholesale.com" ||
    host.endsWith(".vercel.app");
  if (url.pathname !== "/admin/outreach") return null;
  if (local && url.protocol === "http:") return `${url.origin}/admin/outreach`;
  if ((local || hosted) && url.protocol === "https:") return `${url.origin}/admin/outreach`;
  return null;
}

export function columnIsEditable(name, dataType) {
  const column = String(name || "");
  if (!EDITABLE_NAMES.has(column) && !/note/i.test(column)) return false;
  if (BLOCKED_NAME.test(column)) return false;
  const type = String(dataType || "").toLowerCase();
  return (
    type === "text" ||
    type === "character varying" ||
    type === "boolean" ||
    type === "integer" ||
    type === "bigint" ||
    type === "smallint" ||
    type === "numeric" ||
    type === "uuid"
  );
}

export function quoteIdent(name) {
  const text = String(name || "");
  if (!/^[a-z_][a-z0-9_]*$/i.test(text)) {
    throw new Error("Unsafe column name");
  }
  return `"${text}"`;
}

function columnNames(columns) {
  return new Set(
    (columns || []).map((column) => (typeof column === "string" ? column : column.column_name || column.name)),
  );
}

function firstColumn(names, candidates) {
  return candidates.find((name) => names.has(name)) || null;
}

export function classifyStatus(status) {
  const value = String(status || "").trim().toLowerCase();
  if (!value) return "blank";
  if (BOUNCED_STATUSES.has(value)) return "bounced";
  if (REPLIED_STATUSES.has(value)) return "replied";
  if (SENT_STATUSES.has(value)) return "sent";
  if (NOT_SENT_STATUSES.has(value)) return "not_sent";
  return "unclassified";
}

function rate(replied, sent) {
  if (sent == null || replied == null || sent <= 0) return null;
  return Math.round((replied / sent) * 1000) / 10;
}

function emptyBucket(key) {
  return { key, sent: 0, bounced: 0, replied: 0, replyRate: null };
}

function finishBucket(bucket) {
  return { ...bucket, replyRate: rate(bucket.replied, bucket.sent) };
}

/**
 * Totals from real status / send-timestamp columns.
 * Daily buckets are returned only when a send timestamp exists.
 * Unclassified statuses are counted aside and are not treated as sends.
 */
export function deriveColdMetrics(columns, rows) {
  const names = columnNames(columns);
  const statusCol = firstColumn(names, ["status", "outreach_status", "lead_status"]);
  const sentAtCol = firstColumn(names, ["sent_at", "emailed_at", "last_sent_at", "email_sent_at"]);
  const categoryCol = firstColumn(names, ["category", "contact_category", "segment"]);
  const sourceCol = firstColumn(names, ["source", "lead_source", "origin"]);

  if (!statusCol && !sentAtCol) {
    return {
      available: false,
      reason: "No status or send-timestamp column was found, so sent, bounced, and reply rate are unavailable.",
      totals: { sent: null, bounced: null, replied: null, replyRate: null },
      byDay: [],
      byCategory: [],
      bySource: [],
      unclassifiedStatuses: [],
      dayBasis: null,
    };
  }

  const totals = emptyBucket("all");
  const byDay = new Map();
  const byCategory = new Map();
  const bySource = new Map();
  const unclassified = new Map();

  for (const row of rows || []) {
    const status = statusCol ? row[statusCol] : sentAtCol && row[sentAtCol] ? "sent" : "new";
    let kind = classifyStatus(status);
    if (sentAtCol && row[sentAtCol] && (kind === "not_sent" || kind === "blank" || kind === "unclassified")) {
      kind = "sent";
    }
    if (kind === "unclassified" || kind === "blank") {
      const label = String(status || "(blank)");
      unclassified.set(label, (unclassified.get(label) || 0) + 1);
      continue;
    }
    if (kind === "not_sent") continue;

    const sent = 1;
    const bounced = kind === "bounced" ? 1 : 0;
    const replied = kind === "replied" ? 1 : 0;
    totals.sent += sent;
    totals.bounced += bounced;
    totals.replied += replied;

    const add = (map, key) => {
      const bucket = map.get(key) || emptyBucket(key);
      bucket.sent += sent;
      bucket.bounced += bounced;
      bucket.replied += replied;
      map.set(key, bucket);
    };
    if (sentAtCol) {
      const raw = row[sentAtCol];
      const day = phoenixDay(raw);
      if (day) add(byDay, day);
    }
    add(byCategory, categoryCol ? String(row[categoryCol] || "Unspecified") : "Unavailable");
    add(bySource, sourceCol ? String(row[sourceCol] || "Unspecified") : "Unavailable");
  }

  const categoryAvailable = Boolean(categoryCol);
  const sourceAvailable = Boolean(sourceCol);

  return {
    available: true,
    reason: null,
    totals: finishBucket(totals),
    byDay: sentAtCol
      ? [...byDay.values()].map(finishBucket).sort((a, b) => a.key.localeCompare(b.key))
      : [],
    byCategory: categoryAvailable ? [...byCategory.values()].map(finishBucket).sort((a, b) => b.sent - a.sent) : [],
    bySource: sourceAvailable ? [...bySource.values()].map(finishBucket).sort((a, b) => b.sent - a.sent) : [],
    unclassifiedStatuses: [...unclassified.entries()].map(([status, count]) => ({ status, count })),
    dayBasis: sentAtCol,
    categoryBasis: categoryAvailable ? categoryCol : null,
    sourceBasis: sourceAvailable ? sourceCol : null,
    statusBasis: statusCol,
  };
}

export function phoenixDay(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Phoenix",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function isBounceReason(value) {
  return /bounce|undeliver|invalid mailbox|mailbox unavailable/i.test(String(value || ""));
}

export function planSuppressionInsert(columns, email, actor) {
  const list = columns || [];
  const byName = new Map(list.map((column) => [column.column_name, column]));
  const emailCol = ["email", "destination", "address", "recipient", "recipient_email"].find((name) => byName.has(name));
  if (!emailCol) {
    return { ok: false, reason: "sp_email_suppression has no email column, so do-not-contact was not saved." };
  }
  const row = { [emailCol]: normalizeEmail(email) };
  const reasonCol = ["reason", "cause", "note", "notes", "detail"].find((name) => byName.has(name));
  if (reasonCol) row[reasonCol] = "Do not contact — set from the outreach desk";
  const sourceCol = ["source", "origin", "created_by"].find((name) => byName.has(name));
  if (sourceCol) row[sourceCol] = sourceCol === "created_by" ? actor : "outreach_desk";
  const channelCol = ["channel", "medium"].find((name) => byName.has(name));
  if (channelCol) row[channelCol] = "email";
  const activeCol = ["active", "suppressed"].find((name) => byName.has(name));
  if (activeCol) row[activeCol] = true;

  const missing = list.filter((column) => {
    if (column.is_nullable === "YES" || column.column_default != null) return false;
    if (column.column_name === emailCol) return false;
    return row[column.column_name] == null;
  });
  if (missing.length) {
    return {
      ok: false,
      reason: `sp_email_suppression requires ${missing.map((column) => column.column_name).join(", ")}, which this desk does not invent.`,
    };
  }
  return { ok: true, row };
}

export function allowedCheckValues(definitions, column) {
  const values = new Set();
  let matched = false;
  for (const definition of definitions || []) {
    if (!new RegExp(`\\b${column}\\b`, "i").test(definition)) continue;
    matched = true;
    for (const match of definition.matchAll(/'([^']*)'/g)) values.add(match[1]);
  }
  return matched ? [...values] : null;
}

const EMAIL_COLUMN_CANDIDATES = ["email", "email_address", "recipient_email", "recipient", "destination", "address"];
const ID_COLUMN_CANDIDATES = ["id", "lead_id", "outbound_lead_id"];

export function pickColumnName(columns, candidates) {
  return firstColumn(columnNames(columns), candidates);
}

export function readyMembership(readyRows, readyColumns) {
  const emailCol = pickColumnName(readyColumns, EMAIL_COLUMN_CANDIDATES);
  const idCol = pickColumnName(readyColumns, ID_COLUMN_CANDIDATES);
  const emails = new Set();
  const ids = new Set();
  for (const row of readyRows || []) {
    if (emailCol) {
      const email = normalizeEmail(row[emailCol]);
      if (email) emails.add(email);
    }
    if (idCol && row[idCol] != null && String(row[idCol]) !== "") ids.add(String(row[idCol]));
  }
  return { emailCol, idCol, emails, ids, count: (readyRows || []).length };
}

export function rowIsReady(row, columns, membership) {
  if (!membership) return false;
  const idCol = pickColumnName(columns, ID_COLUMN_CANDIDATES);
  const emailCol = pickColumnName(columns, EMAIL_COLUMN_CANDIDATES);
  if (idCol && row[idCol] != null && membership.ids.has(String(row[idCol]))) return true;
  const email = emailCol ? normalizeEmail(row[emailCol]) : "";
  return Boolean(email && membership.emails.has(email));
}

function suppressionLabel(reason) {
  const text = String(reason || "");
  if (text && /unsub|complaint|opt-?out/i.test(text) && !isBounceReason(text)) return "Do not email";
  return "Bounced";
}

export function suppressionIndex(rows, columns) {
  const emailCol = pickColumnName(columns, EMAIL_COLUMN_CANDIDATES);
  const reasonCol = pickColumnName(columns, ["reason", "bounce_reason", "cause", "detail", "error", "status", "note", "notes"]);
  const byEmail = new Map();
  for (const row of rows || []) {
    const email = emailCol ? normalizeEmail(row[emailCol]) : "";
    if (!email) continue;
    const reason = reasonCol && row[reasonCol] != null ? String(row[reasonCol]) : "";
    const label = suppressionLabel(reason);
    const previous = byEmail.get(email);
    if (!previous || (label === "Bounced" && previous.label !== "Bounced")) {
      byEmail.set(email, { reason, label });
    }
  }
  return { emailCol, reasonCol, byEmail, count: (rows || []).length, matched: byEmail.size };
}
