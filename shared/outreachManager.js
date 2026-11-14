// Outreach desk API. Reads and updates sales records. Does not send email,
// text, or calls, and does not import a messaging provider.
// sp_outbound_ready is read as-is. This module never creates, replaces, or alters it.

import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import pg from "pg";
import { createClient } from "@supabase/supabase-js";
import {
  OUTREACH_AUDIENCE,
  allowedCheckValues,
  classifyStatus,
  columnIsEditable,
  deriveColdMetrics,
  normalizeEmail,
  pickColumnName,
  planSuppressionInsert,
  quoteIdent,
  readyMembership,
  rowIsReady,
  safeOutreachRedirect,
  suppressionIndex,
} from "./outreachMetrics.js";

const RELATIONS = [
  "sp_outbound_leads",
  "sp_outbound_ready",
  "sp_email_suppression",
  "sp_send_permissions",
  "sp_leads",
  "sp_customers",
  "sp_nurseries",
  "sp_sales_followups",
  "sp_sales_followup_events",
  "sp_sales_opportunities",
  "sp_orders",
  "sp_rodo_notes",
  "sp_outreach_saved_views",
  "email_events",
];

const EDITABLE_TABLES = new Set([
  "sp_outbound_leads",
  "sp_leads",
  "sp_customers",
  "sp_nurseries",
  "sp_sales_followups",
]);

const ENTITY_TYPES = new Set(["outbound_lead", "lead", "customer", "nursery", "followup", "opportunity"]);
const TABS = new Set(["waiting", "leads", "replies", "metrics"]);
const SKIP_COLUMNS = new Set(["source_data", "raw", "payload", "html", "body", "message_html", "password_hash"]);
const PREFERRED = [
  "full_name",
  "name",
  "contact_name",
  "company",
  "company_name",
  "business_name",
  "email",
  "category",
  "contact_category",
  "status",
  "stage",
  "source",
  "phone",
  "city",
  "state",
  "next_action",
  "notes",
];

const hits = new Map();

function bad(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function bodyOf(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string" && req.body.trim()) {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  return {};
}

function looksLikeEmail(email) {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) && email.length <= 320;
}

function rateLimit(key, limit, windowMs) {
  const now = Date.now();
  const recent = (hits.get(key) || []).filter((time) => now - time < windowMs);
  if (recent.length >= limit) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);
  return true;
}

function databaseUrl() {
  return process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || "";
}

async function withDb(fn) {
  const connectionString = databaseUrl();
  if (!connectionString) throw bad(503, "The outreach desk is not connected to the database.");
  const client = new pg.Client({
    connectionString,
    ssl: /localhost|127\.0\.0\.1/.test(connectionString) ? undefined : { rejectUnauthorized: false },
  });
  try {
    await client.connect();
  } catch (error) {
    console.error("[outreach] database", error.message);
    throw bad(503, "The outreach desk could not reach the database.");
  }
  try {
    await client.query("select set_config('statement_timeout', '20000', false)");
    return await fn(client);
  } finally {
    await client.end().catch(() => {});
  }
}

function signToken(email, name) {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw bad(503, "Sign-in is not configured.");
  return jwt.sign({ email, name: name || null }, secret, {
    expiresIn: "12h",
    audience: OUTREACH_AUDIENCE,
    issuer: "osw-outreach",
  });
}

function readToken(req) {
  const header = req.headers.authorization || "";
  const match = String(header).match(/^Bearer\s+(\S+)$/i);
  if (!match || !process.env.JWT_SECRET) return null;
  try {
    const decoded = jwt.verify(match[1], process.env.JWT_SECRET, {
      audience: OUTREACH_AUDIENCE,
      issuer: "osw-outreach",
    });
    if (!decoded?.email || decoded.id) return null;
    return decoded;
  } catch {
    return null;
  }
}

function supabaseAdmin() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function allowlistRow(client, email) {
  try {
    const { rows } = await client.query(
      `select email, full_name
       from public.sp_outreach_allowlist
       where active = true and lower(email) = $1
       limit 1`,
      [email],
    );
    return rows[0] || null;
  } catch (error) {
    if (error.code === "42P01") throw bad(503, "Outreach access is not installed yet.");
    throw error;
  }
}

async function actorFromToken(client, token) {
  const email = normalizeEmail(token?.email);
  if (!looksLikeEmail(email)) throw bad(401, "Sign in required.");
  const row = await allowlistRow(client, email);
  if (!row) throw bad(403, "This account is not on the outreach desk.");
  return { email: row.email, name: row.full_name || null };
}

async function authed(req, res, fn) {
  const token = readToken(req);
  if (!token) return res.status(401).json({ error: "Sign in required." });
  if (!rateLimit(`api:${normalizeEmail(token.email)}`, 180, 60_000)) {
    return res.status(429).json({ error: "Too many requests. Wait a moment and try again." });
  }
  await withDb(async (client) => {
    const actor = await actorFromToken(client, token);
    await fn({ client, actor });
  });
}

async function login(req, res) {
  const body = bodyOf(req);
  const email = normalizeEmail(body.email);
  const password = String(body.password || "");
  if (!looksLikeEmail(email) || !password || password.length > 200) {
    return res.status(401).json({ error: "Email or password is incorrect." });
  }
  if (!rateLimit(`login:${email}`, 8, 10 * 60_000)) {
    return res.status(429).json({ error: "Too many sign-in attempts. Wait a few minutes and try again." });
  }
  await withDb(async (client) => {
    const allowed = await allowlistRow(client, email);
    if (!allowed) return res.status(401).json({ error: "Email or password is incorrect." });
    let user;
    try {
      const result = await client.query(
        `select email, password_hash, is_active
         from public.admin_users
         where lower(email) = $1
         limit 1`,
        [email],
      );
      user = result.rows[0];
    } catch (error) {
      if (error.code === "42703") {
        const result = await client.query(
          `select email, password_hash from public.admin_users where lower(email) = $1 limit 1`,
          [email],
        );
        user = result.rows[0];
      } else if (error.code === "42P01") {
        return res.status(401).json({ error: "Email or password is incorrect." });
      } else {
        throw error;
      }
    }
    const active = user?.is_active !== false;
    const ok = active && user?.password_hash && (await bcrypt.compare(password, user.password_hash));
    if (!ok) return res.status(401).json({ error: "Email or password is incorrect." });
    return res.json({
      token: signToken(allowed.email, allowed.full_name),
      actor: { email: allowed.email, name: allowed.full_name || null },
    });
  });
}

async function requestLink(req, res) {
  const body = bodyOf(req);
  const email = normalizeEmail(body.email);
  const redirect = safeOutreachRedirect(body.redirectTo);
  const generic = { ok: true, message: "If this address is on the outreach desk, a sign-in link is on its way." };
  if (!looksLikeEmail(email) || !redirect) return res.json(generic);
  if (!rateLimit(`link:${email}`, 5, 15 * 60_000)) {
    return res.status(429).json({ error: "Too many sign-in emails. Wait a few minutes and try again." });
  }
  await withDb(async (client) => {
    const allowed = await allowlistRow(client, email);
    if (!allowed) return res.json(generic);
    const supabase = supabaseAdmin();
    if (!supabase) {
      return res.status(503).json({ error: "Email sign-in is not configured. Use the desk password instead." });
    }
    const { error } = await supabase.auth.signInWithOtp({
      email: allowed.email,
      options: { emailRedirectTo: redirect, shouldCreateUser: true },
    });
    if (error) {
      console.error("[outreach] sign-in link", error.message);
      return res.status(503).json({ error: "The sign-in email could not be sent. Use the desk password instead." });
    }
    return res.json(generic);
  });
}

async function exchangeSession(req, res) {
  const accessToken = String(bodyOf(req).accessToken || "");
  if (!accessToken || accessToken.length > 12000) {
    return res.status(401).json({ error: "That sign-in link was not accepted." });
  }
  const supabase = supabaseAdmin();
  if (!supabase) return res.status(503).json({ error: "Email sign-in is not configured." });
  const { data, error } = await supabase.auth.getUser(accessToken);
  const email = normalizeEmail(data?.user?.email);
  if (error || !looksLikeEmail(email)) return res.status(401).json({ error: "That sign-in link was not accepted." });
  await withDb(async (client) => {
    const allowed = await allowlistRow(client, email);
    if (!allowed) return res.status(403).json({ error: "This account is not on the outreach desk." });
    return res.json({
      token: signToken(allowed.email, allowed.full_name),
      actor: { email: allowed.email, name: allowed.full_name || null },
    });
  });
}

function serialize(row) {
  const out = {};
  for (const [key, value] of Object.entries(row || {})) {
    if (value instanceof Date) out[key] = value.toISOString();
    else if (typeof value === "bigint") out[key] = value.toString();
    else out[key] = value;
  }
  return out;
}

function columnList(catalog, table) {
  return catalog.columns.get(table) || [];
}

function hasRelation(catalog, name) {
  return catalog.present.has(name);
}

function selectable(columns) {
  return (columns || []).filter((column) => {
    const name = column.column_name;
    const type = String(column.data_type || "").toLowerCase();
    if (!/^[a-z_][a-z0-9_]*$/i.test(name)) return false;
    if (SKIP_COLUMNS.has(name)) return false;
    if (type === "bytea" || type === "json" || type === "jsonb" || type === "array") return false;
    if (/password|secret|token|hash|stripe/i.test(name)) return false;
    return true;
  });
}

function orderedColumns(columns) {
  const chosen = selectable(columns);
  const rank = new Map(PREFERRED.map((name, index) => [name, index]));
  return chosen.sort((a, b) => {
    const ar = rank.has(a.column_name) ? rank.get(a.column_name) : 1000 + a.ordinal_position;
    const br = rank.has(b.column_name) ? rank.get(b.column_name) : 1000 + b.ordinal_position;
    return ar - br;
  });
}

async function loadCatalog(client) {
  const { rows: relations } = await client.query(
    `select c.relname as name, c.relkind as kind
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relname = any($1::text[])
       and c.relkind in ('r', 'v', 'p', 'm')`,
    [RELATIONS],
  );
  const present = new Map(relations.map((row) => [row.name, row.kind]));
  const names = [...present.keys()];
  const columns = new Map();
  const checks = new Map();
  const primaryKeys = new Map();
  if (!names.length) return { present, columns, checks, primaryKeys };

  const { rows: columnRows } = await client.query(
    `select table_name, column_name, data_type, is_nullable, column_default, ordinal_position
     from information_schema.columns
     where table_schema = 'public' and table_name = any($1::text[])
     order by table_name, ordinal_position`,
    [names],
  );
  for (const column of columnRows) {
    const list = columns.get(column.table_name) || [];
    list.push(column);
    columns.set(column.table_name, list);
  }

  const { rows: checkRows } = await client.query(
    `select rel.relname as table_name, pg_get_constraintdef(con.oid) as definition
     from pg_constraint con
     join pg_class rel on rel.oid = con.conrelid
     join pg_namespace nsp on nsp.oid = rel.relnamespace
     where nsp.nspname = 'public' and rel.relname = any($1::text[]) and con.contype = 'c'`,
    [names],
  );
  for (const check of checkRows) {
    const list = checks.get(check.table_name) || [];
    list.push(check.definition);
    checks.set(check.table_name, list);
  }

  const { rows: keys } = await client.query(
    `select tc.table_name, kcu.column_name
     from information_schema.table_constraints tc
     join information_schema.key_column_usage kcu
       on tc.constraint_name = kcu.constraint_name
      and tc.table_schema = kcu.table_schema
     where tc.table_schema = 'public'
       and tc.constraint_type = 'PRIMARY KEY'
       and tc.table_name = any($1::text[])`,
    [names],
  );
  const counts = new Map();
  const namesByTable = new Map();
  for (const key of keys) {
    counts.set(key.table_name, (counts.get(key.table_name) || 0) + 1);
    namesByTable.set(key.table_name, key.column_name);
  }
  for (const [table, count] of counts) {
    if (count === 1) primaryKeys.set(table, namesByTable.get(table));
  }
  return { present, columns, checks, primaryKeys };
}

async function countRelation(client, table, whereSql = "") {
  const { rows } = await client.query(`select count(*)::int as n from public.${quoteIdent(table)} ${whereSql}`);
  return rows[0].n;
}

async function openFollowups(client, catalog) {
  if (!hasRelation(catalog, "sp_sales_followups")) return [];
  const columns = orderedColumns(columnList(catalog, "sp_sales_followups"));
  if (!columns.some((column) => column.column_name === "status")) return [];
  const list = columns.map((column) => quoteIdent(column.column_name)).join(", ");
  const order = columns.some((column) => column.column_name === "next_due_at")
    ? "order by next_due_at nulls last"
    : "";
  const { rows } = await client.query(
    `select ${list} from public.sp_sales_followups where status = 'open' ${order} limit 400`,
  );
  return rows;
}

async function selectRows(client, table, columns, orderColumn, limit = 5000) {
  const cols = orderedColumns(columns);
  if (!cols.length) return [];
  const list = cols.map((column) => quoteIdent(column.column_name)).join(", ");
  const order = orderColumn && cols.some((column) => column.column_name === orderColumn)
    ? `order by ${quoteIdent(orderColumn)} desc nulls last`
    : "";
  const { rows } = await client.query(`select ${list} from public.${quoteIdent(table)} ${order} limit ${limit}`);
  return rows;
}

function gridColumns(catalog, table) {
  const columns = columnList(catalog, table);
  const pk = catalog.primaryKeys.get(table);
  const choicesFor = (name) => allowedCheckValues(catalog.checks.get(table), name);
  return orderedColumns(columns).map((column) => ({
    key: column.column_name,
    label: column.column_name.replace(/_/g, " "),
    editable: Boolean(pk) && column.column_name !== pk && columnIsEditable(column.column_name, column.data_type),
    choices: choicesFor(column.column_name),
  }));
}

function uniqueValues(rows, column) {
  if (!column) return [];
  const values = new Set();
  for (const row of rows) {
    const value = row[column];
    if (value != null && String(value).trim() !== "") values.add(String(value));
  }
  return [...values].sort((a, b) => a.localeCompare(b));
}

async function safeRead(client, table, columns, orderColumn) {
  try {
    return await selectRows(client, table, columns, orderColumn);
  } catch (error) {
    if (error.code === "42501" || error.code === "42P01") return null;
    throw error;
  }
}

async function noteSummary(client, catalog, entityType) {
  if (!hasRelation(catalog, "sp_rodo_notes")) return new Map();
  const { rows } = await client.query(
    `select entity_id,
            bool_or(note_for_sandy and not done) as sandy,
            (array_agg(note order by created_at desc))[1] as latest
     from public.sp_rodo_notes
     where entity_type = $1
     group by entity_id`,
    [entityType],
  );
  return new Map(rows.map((row) => [String(row.entity_id), row]));
}

async function loadLeads(client, catalog) {
  if (!hasRelation(catalog, "sp_outbound_leads")) {
    return {
      tab: "leads",
      live: true,
      unavailable: "sp_outbound_leads is not in this database, so the cold-lead grid is unavailable.",
      columns: [],
      rows: [],
      counts: null,
    };
  }
  const columns = columnList(catalog, "sp_outbound_leads");
  const emailCol = pickColumnName(columns, ["email", "email_address", "recipient_email", "recipient"]);
  const statusCol = pickColumnName(columns, ["status", "outreach_status", "lead_status"]);
  const categoryCol = pickColumnName(columns, ["category", "contact_category", "segment"]);
  const orderCol = pickColumnName(columns, ["updated_at", "created_at", "id"]);
  const idCol = catalog.primaryKeys.get("sp_outbound_leads") || pickColumnName(columns, ["id", "lead_id"]);
  const leads = await selectRows(client, "sp_outbound_leads", columns, orderCol, 5000);
  const total = await countRelation(client, "sp_outbound_leads");

  let readyRows = [];
  let readyColumns = [];
  let readyViewCount = null;
  let readyNotice = null;
  if (hasRelation(catalog, "sp_outbound_ready")) {
    readyColumns = columnList(catalog, "sp_outbound_ready");
    const loaded = await safeRead(client, "sp_outbound_ready", readyColumns, null);
    if (loaded) {
      readyRows = loaded;
      readyViewCount = await countRelation(client, "sp_outbound_ready");
    } else {
      readyNotice = "sp_outbound_ready could not be read, so Ready to send is unavailable.";
    }
  } else {
    readyNotice = "sp_outbound_ready is not in this database, so Ready to send is unavailable.";
  }

  let suppressionRows = [];
  let suppressionColumns = [];
  let suppressionCount = null;
  let suppressionNotice = null;
  if (hasRelation(catalog, "sp_email_suppression")) {
    suppressionColumns = columnList(catalog, "sp_email_suppression");
    const loaded = await safeRead(client, "sp_email_suppression", suppressionColumns, null);
    if (loaded) {
      suppressionRows = loaded;
      suppressionCount = await countRelation(client, "sp_email_suppression");
    } else {
      suppressionNotice = "sp_email_suppression could not be read, so bounce flags are unavailable.";
    }
  } else {
    suppressionNotice = "sp_email_suppression is not in this database, so bounce flags are unavailable.";
  }

  const membership = readyMembership(readyRows, readyColumns);
  const suppression = suppressionIndex(suppressionRows, suppressionColumns);
  const notes = await noteSummary(client, catalog, "outbound_lead");
  const leadEmails = new Set();
  const leadIds = new Set();

  const rows = leads.map((lead) => {
    const id = idCol && lead[idCol] != null ? String(lead[idCol]) : null;
    const email = emailCol ? normalizeEmail(lead[emailCol]) : "";
    if (email) leadEmails.add(email);
    if (id) leadIds.add(id);
    const hit = email ? suppression.byEmail.get(email) : null;
    const note = id ? notes.get(id) : null;
    return {
      id,
      table: "sp_outbound_leads",
      entityType: "outbound_lead",
      readOnly: false,
      cells: serialize(lead),
      ready: rowIsReady(lead, columns, membership),
      suppressed: Boolean(hit),
      badge: hit ? hit.label : null,
      suppressionReason: hit?.reason || null,
      latestNote: note?.latest || "",
      sandy: Boolean(note?.sandy),
    };
  });

  const suppressedExtras = [];
  for (const [email, hit] of suppression.byEmail) {
    if (leadEmails.has(email)) continue;
    suppressedExtras.push({
      id: null,
      table: null,
      entityType: "outbound_lead",
      readOnly: true,
      cells: { [emailCol || "email"]: email },
      ready: membership.emails.has(email),
      suppressed: true,
      badge: hit.label,
      suppressionReason: hit.reason || null,
      latestNote: "",
      sandy: false,
      unmatchedKey: `suppressed-${email}`,
    });
  }

  const extras = [];
  readyRows.forEach((readyRow, index) => {
    const email = membership.emailCol ? normalizeEmail(readyRow[membership.emailCol]) : "";
    const readyId = membership.idCol && readyRow[membership.idCol] != null ? String(readyRow[membership.idCol]) : "";
    const matched = (email && leadEmails.has(email)) || (readyId && leadIds.has(readyId));
    if (matched) return;
    const hit = email ? suppression.byEmail.get(email) : null;
    extras.push({
      id: null,
      table: null,
      entityType: "outbound_lead",
      readOnly: true,
      cells: serialize(readyRow),
      ready: true,
      suppressed: Boolean(hit),
      badge: hit ? hit.label : null,
      suppressionReason: hit?.reason || null,
      latestNote: "",
      sandy: false,
      unmatchedKey: `ready-${index}`,
    });
  });

  const withEmail = emailCol
    ? await countRelation(
      client,
      "sp_outbound_leads",
      `where nullif(btrim(${quoteIdent(emailCol)}::text), '') is not null`,
    )
    : null;
  const statusNew = statusCol
    ? await countRelation(client, "sp_outbound_leads", `where lower(btrim(${quoteIdent(statusCol)}::text)) = 'new'`)
    : null;

  return {
    tab: "leads",
    live: true,
    source: "sp_outbound_leads",
    readyView: hasRelation(catalog, "sp_outbound_ready") ? "sp_outbound_ready" : null,
    readyViewModified: false,
    columns: gridColumns(catalog, "sp_outbound_leads"),
    rows: rows.concat(extras, suppressedExtras),
    statuses: uniqueValues(leads, statusCol),
    categories: uniqueValues(leads, categoryCol),
    statusColumn: statusCol,
    categoryColumn: categoryCol,
    emailColumn: emailCol,
    statusChoices: statusCol ? allowedCheckValues(catalog.checks.get("sp_outbound_leads"), statusCol) : null,
    categoryChoices: categoryCol ? allowedCheckValues(catalog.checks.get("sp_outbound_leads"), categoryCol) : null,
    counts: {
      leads: total,
      loaded: leads.length,
      withEmail,
      missingEmail: withEmail == null ? null : total - withEmail,
      statusNew,
      readyView: readyViewCount,
      readyMatched: rows.filter((row) => row.ready).length,
      readyUnmatched: extras.length,
      suppressed: suppressionCount,
      suppressedMatched: rows.filter((row) => row.suppressed).length,
      suppressedUnmatched: suppressedExtras.length,
    },
    truncated: leads.length < total,
    notesAvailable: hasRelation(catalog, "sp_rodo_notes"),
    notices: [readyNotice, suppressionNotice].filter(Boolean),
  };
}

function daysSince(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return Math.max(0, Math.floor((Date.now() - date.getTime()) / 86400000));
}

function personLabel(row, columns) {
  if (!row) return null;
  const name = pickColumnName(columns, ["full_name", "name", "customer_name", "contact_name"]);
  const company = pickColumnName(columns, ["company", "company_name", "customer_company", "business_name"]);
  const email = pickColumnName(columns, ["email", "customer_email"]);
  return (name && row[name]) || (company && row[company]) || (email && row[email]) || null;
}

async function ordersById(client, catalog, ids) {
  if (!hasRelation(catalog, "sp_orders") || !ids.length) return new Map();
  const wanted = ["id", "customer_name", "customer_company", "customer_email", "order_number"].filter((name) =>
    columnList(catalog, "sp_orders").some((column) => column.column_name === name),
  );
  if (!wanted.includes("id")) return new Map();
  const { rows } = await client.query(
    `select ${wanted.map((name) => quoteIdent(name)).join(", ")}
     from public.sp_orders
     where id::text = any($1::text[])`,
    [ids],
  );
  return new Map(rows.map((row) => [String(row.id), row]));
}

async function loadWaiting(client, catalog) {
  const items = [];
  if (hasRelation(catalog, "sp_sales_followups")) {
    const columns = columnList(catalog, "sp_sales_followups");
    const open = await openFollowups(client, catalog);
    const orders = await ordersById(client, catalog, open.map((row) => String(row.order_id)));
    const closeChoices = allowedCheckValues(catalog.checks.get("sp_sales_followups"), "close_reason");
    for (const row of open) {
      const order = orders.get(String(row.order_id));
      const opened = row.first_sent_at || row.created_at || null;
      items.push({
        kind: "followup",
        id: String(row.order_id),
        table: "sp_sales_followups",
        customer: (order && (order.customer_company || order.customer_name || order.customer_email || order.order_number)) || null,
        ask: row.next_action || row.last_outcome || row.document_kind || null,
        status: row.status,
        daysOpen: daysSince(opened),
        closeChoices,
        canSnooze: columns.some((column) => column.column_name === "next_due_at"),
        canClose: columns.some((column) => column.column_name === "status"),
      });
    }
  }

  if (hasRelation(catalog, "sp_outbound_leads")) {
    const columns = columnList(catalog, "sp_outbound_leads");
    const statusCol = pickColumnName(columns, ["status", "outreach_status", "lead_status"]);
    const idCol = catalog.primaryKeys.get("sp_outbound_leads") || pickColumnName(columns, ["id"]);
    const sentAt = pickColumnName(columns, ["sent_at", "emailed_at", "last_sent_at", "email_sent_at"]);
    const createdAt = pickColumnName(columns, ["created_at"]);
    const leads = await selectRows(client, "sp_outbound_leads", columns, createdAt, 5000);
    const choices = statusCol ? allowedCheckValues(catalog.checks.get("sp_outbound_leads"), statusCol) : null;
    for (const lead of leads) {
      if (!statusCol || classifyStatus(lead[statusCol]) !== "replied") continue;
      items.push({
        kind: "reply",
        id: idCol ? String(lead[idCol]) : null,
        table: "sp_outbound_leads",
        column: statusCol,
        customer: personLabel(lead, columns),
        ask: String(lead[statusCol]),
        status: lead[statusCol],
        daysOpen: daysSince((sentAt && lead[sentAt]) || (createdAt && lead[createdAt]) || null),
        choices,
      });
    }
  }

  let opportunities = { available: false, reason: "sp_sales_opportunities is not in this database.", count: null, rows: [] };
  if (hasRelation(catalog, "sp_sales_opportunities")) {
    const columns = columnList(catalog, "sp_sales_opportunities");
    const labelCol = pickColumnName(columns, ["name", "title", "customer", "summary", "ask", "status"]);
    const count = await countRelation(client, "sp_sales_opportunities");
    if (!labelCol) {
      opportunities = {
        available: false,
        reason: "sp_sales_opportunities has no customer, title, or status column, so opportunity rows are unavailable.",
        count,
        rows: [],
      };
    } else {
      const loaded = await selectRows(client, "sp_sales_opportunities", columns, "created_at", 200);
      opportunities = {
        available: true,
        reason: null,
        count,
        rows: loaded.map((row) => ({
          id: row.id != null ? String(row.id) : null,
          customer: personLabel(row, columns),
          ask: labelCol ? row[labelCol] : null,
          daysOpen: daysSince(row.created_at),
        })),
      };
    }
  }

  let openNotes = [];
  if (hasRelation(catalog, "sp_rodo_notes")) {
    const { rows } = await client.query(
      `select id, entity_type, entity_id, note, note_for_sandy, created_at
       from public.sp_rodo_notes
       where done = false
       order by created_at desc
       limit 200`,
    );
    openNotes = rows.map((row) => ({
      id: String(row.id),
      entityType: row.entity_type,
      entityId: row.entity_id,
      note: row.note,
      forSandy: row.note_for_sandy,
      daysOpen: daysSince(row.created_at),
    }));
  }

  return { tab: "waiting", live: true, items, opportunities, openNotes };
}

async function loadReplies(client, catalog) {
  const rows = [];
  if (hasRelation(catalog, "sp_outbound_leads")) {
    const columns = columnList(catalog, "sp_outbound_leads");
    const statusCol = pickColumnName(columns, ["status", "outreach_status", "lead_status"]);
    const idCol = catalog.primaryKeys.get("sp_outbound_leads") || pickColumnName(columns, ["id"]);
    const leads = await selectRows(client, "sp_outbound_leads", columns, "updated_at", 5000);
    const choices = statusCol ? allowedCheckValues(catalog.checks.get("sp_outbound_leads"), statusCol) : null;
    for (const lead of leads) {
      if (!statusCol || classifyStatus(lead[statusCol]) !== "replied") continue;
      rows.push({
        id: idCol ? String(lead[idCol]) : null,
        table: "sp_outbound_leads",
        column: statusCol,
        source: "Cold outreach",
        customer: personLabel(lead, columns),
        ask: lead[statusCol],
        status: lead[statusCol],
        choices,
        readOnly: !idCol,
      });
    }
  }

  if (hasRelation(catalog, "sp_nurseries")) {
    const columns = columnList(catalog, "sp_nurseries");
    const stageCol = pickColumnName(columns, ["stage"]);
    const idCol = catalog.primaryKeys.get("sp_nurseries") || pickColumnName(columns, ["id"]);
    if (stageCol) {
      const nurseries = await selectRows(client, "sp_nurseries", columns, "updated_at", 1000);
      const choices = allowedCheckValues(catalog.checks.get("sp_nurseries"), stageCol);
      for (const nursery of nurseries) {
        const stage = String(nursery[stageCol] || "").toLowerCase();
        if (!["samples", "quoted", "interested"].includes(stage)) continue;
        rows.push({
          id: idCol ? String(nursery[idCol]) : null,
          table: "sp_nurseries",
          column: stageCol,
          source: "Nursery",
          customer: personLabel(nursery, columns) || (idCol ? nursery[idCol] : null),
          ask: nursery.next_action || nursery[stageCol],
          status: nursery[stageCol],
          choices,
          readOnly: !idCol,
        });
      }
    }
  }

  if (hasRelation(catalog, "sp_leads")) {
    const columns = columnList(catalog, "sp_leads");
    const statusCol = pickColumnName(columns, ["status"]);
    const idCol = catalog.primaryKeys.get("sp_leads") || pickColumnName(columns, ["id"]);
    if (statusCol) {
      const leads = await selectRows(client, "sp_leads", columns, "updated_at", 1000);
      const choices = allowedCheckValues(catalog.checks.get("sp_leads"), statusCol);
      for (const lead of leads) {
        if (String(lead[statusCol] || "").toLowerCase() !== "quoted") continue;
        rows.push({
          id: idCol ? String(lead[idCol]) : null,
          table: "sp_leads",
          column: statusCol,
          source: "Website lead",
          customer: personLabel(lead, columns),
          ask: "quoted",
          status: lead[statusCol],
          choices,
          readOnly: !idCol,
        });
      }
    }
  }

  if (hasRelation(catalog, "sp_sales_followups")) {
    const columns = columnList(catalog, "sp_sales_followups");
    const quotes = (await openFollowups(client, catalog)).filter((row) => String(row.document_kind || "").toLowerCase() === "quote");
    const orders = await ordersById(client, catalog, quotes.map((row) => String(row.order_id)));
    for (const row of quotes) {
      const order = orders.get(String(row.order_id));
      rows.push({
        id: String(row.order_id),
        table: "sp_sales_followups",
        column: columns.some((column) => column.column_name === "status") ? "status" : null,
        source: "Quote follow-up",
        customer: (order && (order.customer_company || order.customer_name || order.customer_email)) || null,
        ask: row.next_action || "quote",
        status: row.status,
        choices: allowedCheckValues(catalog.checks.get("sp_sales_followups"), "status"),
        readOnly: false,
      });
    }
  }

  return { tab: "replies", live: true, rows };
}

async function websiteEmailSeries(client, catalog) {
  if (!hasRelation(catalog, "email_events")) {
    return { available: false, label: "Website email", reason: "email_events is not in this database." };
  }
  const columns = columnList(catalog, "email_events");
  const typeCol = pickColumnName(columns, ["event_type", "type", "event", "name"]);
  const timeCol = pickColumnName(columns, ["created_at", "occurred_at", "timestamp"]);
  if (!typeCol || !timeCol) {
    return {
      available: false,
      label: "Website email",
      reason: "email_events has no event type and timestamp, so this series is unavailable.",
    };
  }
  const { rows } = await client.query(
    `select ${quoteIdent(typeCol)} as event_type, ${quoteIdent(timeCol)} as occurred_at
     from public.email_events
     order by ${quoteIdent(timeCol)} desc
     limit 5000`,
  );
  const byType = new Map();
  for (const row of rows) {
    const key = String(row.event_type || "Unspecified");
    byType.set(key, (byType.get(key) || 0) + 1);
  }
  return {
    available: true,
    label: "Website email (separate from cold outreach)",
    reason: null,
    loaded: rows.length,
    byType: [...byType.entries()].map(([event, count]) => ({ event, count })).sort((a, b) => b.count - a.count),
    replyRate: null,
  };
}

async function loadMetrics(client, catalog) {
  const leads = hasRelation(catalog, "sp_outbound_leads")
    ? await loadLeads(client, catalog)
    : null;
  const raw = leads
    ? leads.rows.filter((row) => row.table === "sp_outbound_leads").map((row) => row.cells)
    : [];
  const columns = leads ? columnList(catalog, "sp_outbound_leads").map((column) => column.column_name) : [];
  const cold = leads
    ? deriveColdMetrics(columns, raw)
    : {
      available: false,
      reason: "sp_outbound_leads is not in this database, so cold-outreach metrics are unavailable.",
      totals: { sent: null, bounced: null, replied: null, replyRate: null },
      byDay: [],
      byCategory: [],
      bySource: [],
      unclassifiedStatuses: [],
      dayBasis: null,
    };
  let permissions = null;
  if (hasRelation(catalog, "sp_send_permissions")) {
    permissions = {
      count: await countRelation(client, "sp_send_permissions"),
      reason: "sp_send_permissions is a permission list, not a send log, so it is not a reply rate.",
    };
  }
  const suppressionReasons = new Map();
  if (leads?.counts?.suppressed != null) {
    const columnsForSuppression = columnList(catalog, "sp_email_suppression");
    const loaded = await safeRead(client, "sp_email_suppression", columnsForSuppression, null);
    const indexed = suppressionIndex(loaded || [], columnsForSuppression);
    for (const entry of indexed.byEmail.values()) {
      const key = entry.reason || "(no reason recorded)";
      suppressionReasons.set(key, (suppressionReasons.get(key) || 0) + 1);
    }
  }
  return {
    tab: "metrics",
    live: true,
    counts: leads?.counts || null,
    cold,
    suppression: {
      available: leads?.counts?.suppressed != null,
      addresses: leads?.counts?.suppressed ?? null,
      matchedToLeads: leads?.counts?.suppressedMatched ?? null,
      byReason: [...suppressionReasons.entries()].map(([reason, count]) => ({ reason, count })),
      reason: leads?.counts?.suppressed == null ? "sp_email_suppression is unavailable." : null,
    },
    permissions,
    websiteEmail: await websiteEmailSeries(client, catalog),
    notices: leads?.notices || [],
  };
}

async function updateCell(client, catalog, body) {
  const table = String(body.table || "");
  if (table === "sp_outbound_ready") throw bad(400, "sp_outbound_ready is read-only and was not changed.");
  if (!EDITABLE_TABLES.has(table) || !hasRelation(catalog, table) || catalog.present.get(table) === "v") {
    throw bad(400, "That table cannot be edited here.");
  }
  const pk = catalog.primaryKeys.get(table);
  if (!pk) throw bad(400, "This table has no single primary key, so inline edit is unavailable.");
  const column = String(body.column || "");
  const meta = columnList(catalog, table).find((item) => item.column_name === column);
  if (!meta || !columnIsEditable(column, meta.data_type) || column === pk) {
    throw bad(400, "That column is read-only.");
  }
  let value = body.value;
  if (typeof value === "string") value = value.trim();
  if (value === "") value = null;
  if (value != null && String(value).length > 8000) throw bad(400, "That value is too long.");
  const allowed = allowedCheckValues(catalog.checks.get(table), column);
  if (allowed && value != null && !allowed.includes(String(value))) {
    throw bad(400, `Allowed values: ${allowed.join(", ")}`);
  }
  const id = body.id == null ? "" : String(body.id);
  if (!id || id.length > 128) throw bad(400, "Missing row.");
  const sets = [`${quoteIdent(column)} = $1`];
  const columns = columnList(catalog, table);
  if (columns.some((item) => item.column_name === "updated_at") && column !== "updated_at") {
    sets.push(`${quoteIdent("updated_at")} = now()`);
  }
  if (column !== "revision" && columns.some((item) => item.column_name === "revision" && /int/i.test(item.data_type))) {
    sets.push(`${quoteIdent("revision")} = coalesce(${quoteIdent("revision")}, 0) + 1`);
  }
  const { rowCount } = await client.query(
    `update public.${quoteIdent(table)} set ${sets.join(", ")} where ${quoteIdent(pk)}::text = $2`,
    [value, id],
  );
  if (!rowCount) throw bad(404, "That row was not found.");
  return { ok: true };
}

async function addSuppression(client, catalog, email, actor) {
  if (!hasRelation(catalog, "sp_email_suppression")) {
    throw bad(400, "sp_email_suppression is not in this database, so the address was not flagged.");
  }
  const columns = columnList(catalog, "sp_email_suppression");
  const plan = planSuppressionInsert(columns, email, actor.email);
  if (!plan.ok) throw bad(400, plan.reason);
  const emailCol = Object.keys(plan.row).find((name) => ["email", "email_address", "recipient_email", "recipient", "destination", "address"].includes(name));
  const { rows } = await client.query(
    `select 1 from public.sp_email_suppression where lower(${quoteIdent(emailCol)}::text) = $1 limit 1`,
    [plan.row[emailCol]],
  );
  if (rows.length) return { ok: true, already: true };
  const names = Object.keys(plan.row);
  await client.query(
    `insert into public.sp_email_suppression (${names.map((name) => quoteIdent(name)).join(", ")})
     values (${names.map((_, index) => `$${index + 1}`).join(", ")})`,
    names.map((name) => plan.row[name]),
  );
  return { ok: true, already: false };
}

async function bulk(client, actor, catalog, body) {
  const action = String(body.action || "");
  const ids = Array.isArray(body.ids) ? [...new Set(body.ids.map((id) => String(id)))].slice(0, 500) : [];
  if (!ids.length || ids.some((id) => !id || id.length > 128)) throw bad(400, "Select at least one saved row.");
  if (!hasRelation(catalog, "sp_outbound_leads")) throw bad(400, "sp_outbound_leads is not available.");
  const pk = catalog.primaryKeys.get("sp_outbound_leads");
  if (!pk) throw bad(400, "sp_outbound_leads has no single primary key, so bulk edit is unavailable.");
  const columns = columnList(catalog, "sp_outbound_leads");

  if (action === "set_status" || action === "set_category") {
    const column = action === "set_status"
      ? pickColumnName(columns, ["status", "outreach_status", "lead_status"])
      : pickColumnName(columns, ["category", "contact_category", "segment"]);
    if (!column) throw bad(400, "That field is not on sp_outbound_leads.");
    const meta = columns.find((item) => item.column_name === column);
    if (!columnIsEditable(column, meta.data_type)) throw bad(400, "That field is read-only.");
    let value = typeof body.value === "string" ? body.value.trim() : body.value;
    if (value === "") value = null;
    const allowed = allowedCheckValues(catalog.checks.get("sp_outbound_leads"), column);
    if (allowed && value != null && !allowed.includes(String(value))) {
      throw bad(400, `Allowed values: ${allowed.join(", ")}`);
    }
    const sets = [`${quoteIdent(column)} = $1`];
    if (columns.some((item) => item.column_name === "updated_at")) sets.push(`${quoteIdent("updated_at")} = now()`);
    const { rowCount } = await client.query(
      `update public.sp_outbound_leads set ${sets.join(", ")} where ${quoteIdent(pk)}::text = any($2::text[])`,
      [value, ids],
    );
    return { ok: true, updated: rowCount };
  }

  if (action === "add_note") {
    const note = String(body.note || "").trim();
    const forSandy = Boolean(body.noteForSandy);
    if (!note) throw bad(400, "Write a note first.");
    if (note.length > 8000) throw bad(400, "That note is too long.");
    if (!hasRelation(catalog, "sp_rodo_notes")) throw bad(503, "Notes are not installed yet.");
    await client.query("begin");
    try {
      for (const id of ids) {
        await client.query(
          `insert into public.sp_rodo_notes (entity_type, entity_id, note, note_for_sandy, created_by)
           values ('outbound_lead', $1, $2, $3, $4)`,
          [id, note, forSandy, actor.email],
        );
      }
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    }
    return { ok: true, updated: ids.length };
  }

  if (action === "suppress") {
    const emailCol = pickColumnName(columns, ["email", "email_address", "recipient_email", "recipient"]);
    if (!emailCol) throw bad(400, "sp_outbound_leads has no email column, so these rows were not flagged.");
    const { rows } = await client.query(
      `select ${quoteIdent(emailCol)} as email
       from public.sp_outbound_leads
       where ${quoteIdent(pk)}::text = any($1::text[])`,
      [ids],
    );
    let flagged = 0;
    await client.query("begin");
    try {
      for (const row of rows) {
        const email = normalizeEmail(row.email);
        if (!email) continue;
        const result = await addSuppression(client, catalog, email, actor);
        if (!result.already) flagged += 1;
      }
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    }
    return { ok: true, updated: flagged };
  }

  throw bad(400, "That bulk action is not available.");
}

async function insertNote(client, actor, catalog, body) {
  if (!hasRelation(catalog, "sp_rodo_notes")) throw bad(503, "Notes are not installed yet.");
  if (body.done === true && body.id) {
    const id = String(body.id);
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw bad(400, "Missing note.");
    const { rowCount } = await client.query(
      `update public.sp_rodo_notes
       set done = true, done_at = coalesce(done_at, now()), updated_at = now()
       where id = $1`,
      [id],
    );
    if (!rowCount) throw bad(404, "That note was not found.");
    return { ok: true };
  }
  const entityType = String(body.entityType || "");
  const entityId = String(body.entityId || "");
  const note = String(body.note || "").trim();
  if (!ENTITY_TYPES.has(entityType) || !entityId || entityId.length > 128) throw bad(400, "That record cannot take a note.");
  if (!note || note.length > 8000) throw bad(400, "Write a note of 8000 characters or less.");
  const { rows } = await client.query(
    `insert into public.sp_rodo_notes (entity_type, entity_id, note, note_for_sandy, created_by)
     values ($1, $2, $3, $4, $5)
     returning id, entity_type, entity_id, note, note_for_sandy, created_by, created_at, updated_at, done, done_at`,
    [entityType, entityId, note, Boolean(body.noteForSandy), actor.email],
  );
  return { ok: true, note: serialize(rows[0]) };
}

async function listNotes(client, catalog, url) {
  if (!hasRelation(catalog, "sp_rodo_notes")) return { notes: [], available: false };
  const entityType = url.searchParams.get("entityType") || "";
  const entityId = url.searchParams.get("entityId") || "";
  if (!ENTITY_TYPES.has(entityType) || !entityId || entityId.length > 128) return { notes: [], available: true };
  const { rows } = await client.query(
    `select id, entity_type, entity_id, note, note_for_sandy, created_by, created_at, updated_at, done, done_at
     from public.sp_rodo_notes
     where entity_type = $1 and entity_id = $2
     order by created_at desc
     limit 100`,
    [entityType, entityId],
  );
  return { notes: rows.map(serialize), available: true };
}

async function listViews(client, actor) {
  const { rows } = await client.query(
    `select id, name, tab, config, updated_at
     from public.sp_outreach_saved_views
     where owner_email = $1
     order by updated_at desc
     limit 50`,
    [actor.email],
  );
  return { views: rows.map(serialize) };
}

async function saveView(client, actor, body) {
  const name = String(body.name || "").trim();
  const tab = String(body.tab || "");
  const config = body.config && typeof body.config === "object" && !Array.isArray(body.config) ? body.config : null;
  if (!name || name.length > 80 || !TABS.has(tab) || !config) throw bad(400, "Name a view and keep it on one tab.");
  const encoded = JSON.stringify(config);
  if (encoded.length > 4000) throw bad(400, "That view is too large.");
  const { rows } = await client.query(
    `insert into public.sp_outreach_saved_views (owner_email, name, tab, config)
     values ($1, $2, $3, $4::jsonb)
     returning id, name, tab, config, updated_at`,
    [actor.email, name, tab, encoded],
  );
  return { view: serialize(rows[0]) };
}

async function deleteView(client, actor, body) {
  const id = String(body.id || "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw bad(400, "Missing view.");
  const { rowCount } = await client.query(
    `delete from public.sp_outreach_saved_views where id = $1 and owner_email = $2`,
    [id, actor.email],
  );
  if (!rowCount) throw bad(404, "That view was not found.");
  return { ok: true };
}

async function insertFollowupEvent(client, catalog, orderId, outcome) {
  if (!hasRelation(catalog, "sp_sales_followup_events")) return;
  const columns = columnList(catalog, "sp_sales_followup_events");
  const row = {};
  if (columns.some((column) => column.column_name === "order_id")) row.order_id = orderId;
  if (columns.some((column) => column.column_name === "outcome")) row.outcome = outcome || "closed";
  if (columns.some((column) => column.column_name === "note")) row.note = "";
  const missing = columns.filter((column) => column.is_nullable === "NO" && column.column_default == null && row[column.column_name] == null);
  if (missing.length) return;
  const names = Object.keys(row);
  try {
    await client.query(
      `insert into public.sp_sales_followup_events (${names.map((name) => quoteIdent(name)).join(", ")})
       values (${names.map((_, index) => `$${index + 1}`).join(", ")})`,
      names.map((name) => row[name]),
    );
  } catch (error) {
    console.error("[outreach] follow-up event", error.message);
  }
}

async function decide(client, catalog, body) {
  const action = String(body.action || "");
  const id = String(body.id || "");
  if (!id || id.length > 128) throw bad(400, "Missing row.");
  if (action === "close_followup" || action === "snooze_followup") {
    if (!hasRelation(catalog, "sp_sales_followups")) throw bad(400, "Follow-ups are not in this database.");
    const columns = columnList(catalog, "sp_sales_followups");
    if (action === "snooze_followup") {
      const days = Number(body.days);
      if (!Number.isInteger(days) || days < 1 || days > 30) throw bad(400, "Snooze between 1 and 30 days.");
      if (!columns.some((column) => column.column_name === "next_due_at")) {
        throw bad(400, "Follow-ups have no next date, so snooze is unavailable.");
      }
      const sets = [`${quoteIdent("next_due_at")} = now() + ($1::text || ' days')::interval`];
      if (columns.some((column) => column.column_name === "updated_at")) sets.push(`${quoteIdent("updated_at")} = now()`);
      const { rowCount } = await client.query(
        `update public.sp_sales_followups set ${sets.join(", ")} where order_id::text = $2`,
        [String(days), id],
      );
      if (!rowCount) throw bad(404, "That follow-up was not found.");
      return { ok: true };
    }
    if (!columns.some((column) => column.column_name === "status")) {
      throw bad(400, "Follow-ups have no status column, so close is unavailable.");
    }
    const reason = body.reason == null ? null : String(body.reason).trim();
    const allowed = allowedCheckValues(catalog.checks.get("sp_sales_followups"), "close_reason");
    if (allowed && reason && !allowed.includes(reason)) throw bad(400, `Allowed close reasons: ${allowed.join(", ")}`);
    const sets = [`${quoteIdent("status")} = 'closed'`];
    if (columns.some((column) => column.column_name === "close_reason")) sets.push(`${quoteIdent("close_reason")} = $1`);
    if (columns.some((column) => column.column_name === "updated_at")) sets.push(`${quoteIdent("updated_at")} = now()`);
    if (columns.some((column) => column.column_name === "revision" && /int/i.test(column.data_type))) {
      sets.push(`${quoteIdent("revision")} = coalesce(${quoteIdent("revision")}, 0) + 1`);
    }
    const params = columns.some((column) => column.column_name === "close_reason") ? [reason || null, id] : [id];
    const idIndex = params.length;
    const { rowCount } = await client.query(
      `update public.sp_sales_followups set ${sets.join(", ")} where order_id::text = $${idIndex} and status = 'open'`,
      params,
    );
    if (!rowCount) throw bad(404, "That open follow-up was not found.");
    await insertFollowupEvent(client, catalog, id, reason || "closed");
    return { ok: true };
  }
  throw bad(400, "That decision is not available.");
}

async function loadTab(client, tab) {
  const catalog = await loadCatalog(client);
  if (tab === "waiting") return loadWaiting(client, catalog);
  if (tab === "replies") return loadReplies(client, catalog);
  if (tab === "metrics") return loadMetrics(client, catalog);
  if (tab === "leads") return loadLeads(client, catalog);
  throw bad(400, "Unknown tab.");
}

export async function handleOutreachRequest(req, res, ctx) {
  const path = ctx?.path || "";
  const url = ctx?.url || new URL(req.url || "/", "http://localhost");
  const route = path.replace(/^\/api\/admin\/outreach\/?/, "").replace(/\/$/, "");
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Robots-Tag", "noindex");
  try {
    if (req.method === "POST" && route === "login") return await login(req, res);
    if (req.method === "POST" && route === "request-link") return await requestLink(req, res);
    if (req.method === "POST" && route === "session") return await exchangeSession(req, res);
    if (req.method === "GET" && route === "me") {
      return await authed(req, res, async ({ actor }) => {
        res.json({ actor });
      });
    }
    if (req.method === "GET" && route === "rows") {
      return await authed(req, res, async ({ client }) => {
        const tab = url.searchParams.get("tab") || "leads";
        res.json(await loadTab(client, tab));
      });
    }
    if (req.method === "POST" && route === "cell") {
      return await authed(req, res, async ({ client }) => {
        const catalog = await loadCatalog(client);
        res.json(await updateCell(client, catalog, bodyOf(req)));
      });
    }
    if (req.method === "POST" && route === "bulk") {
      return await authed(req, res, async ({ client, actor }) => {
        const catalog = await loadCatalog(client);
        res.json(await bulk(client, actor, catalog, bodyOf(req)));
      });
    }
    if (req.method === "POST" && route === "note") {
      return await authed(req, res, async ({ client, actor }) => {
        const catalog = await loadCatalog(client);
        res.json(await insertNote(client, actor, catalog, bodyOf(req)));
      });
    }
    if (req.method === "GET" && route === "notes") {
      return await authed(req, res, async ({ client }) => {
        const catalog = await loadCatalog(client);
        res.json(await listNotes(client, catalog, url));
      });
    }
    if (req.method === "GET" && route === "views") {
      return await authed(req, res, async ({ client, actor }) => {
        res.json(await listViews(client, actor));
      });
    }
    if (req.method === "POST" && route === "views") {
      return await authed(req, res, async ({ client, actor }) => {
        res.json(await saveView(client, actor, bodyOf(req)));
      });
    }
    if (req.method === "POST" && route === "views/delete") {
      return await authed(req, res, async ({ client, actor }) => {
        res.json(await deleteView(client, actor, bodyOf(req)));
      });
    }
    if (req.method === "POST" && route === "decision") {
      return await authed(req, res, async ({ client }) => {
        const catalog = await loadCatalog(client);
        res.json(await decide(client, catalog, bodyOf(req)));
      });
    }
    return res.status(404).json({ error: "Not found" });
  } catch (error) {
    const status = error.code === "23514" || error.code === "23502" ? 400 : error.status || 500;
    if (status >= 500) console.error("[outreach]", error.message);
    if (!res.headersSent) {
      const check = error.code === "23514"
        ? "That value is not allowed on this column."
        : error.code === "23502"
          ? "A required field was left empty."
          : null;
      const unexpected = status >= 500 && !error.status;
      res.status(status).json({ error: unexpected ? "Outreach request failed" : check || error.message });
    }
  }
}
