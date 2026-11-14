/**
 * Read live outreach counts from the OSW database and, with --apply,
 * install the additive outreach migration. Prints counts and column names only.
 *
 *   DATABASE_URL=... node scripts/outreach-live-check.mjs
 *   DATABASE_URL=... node scripts/outreach-live-check.mjs --apply
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const apply = process.argv.includes("--apply");
const connectionString = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
if (!connectionString) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const client = new pg.Client({
  connectionString,
  ssl: /localhost|127\.0\.0\.1/.test(connectionString) ? undefined : { rejectUnauthorized: false },
});

function quote(name) {
  if (!/^[a-z_][a-z0-9_]*$/i.test(name)) throw new Error(`Unsafe identifier ${name}`);
  return `"${name}"`;
}

await client.connect();
try {
  if (apply) {
    const sql = readFileSync(join(root, "supabase/migrations/20261114053000_outreach_manager.sql"), "utf8");
    await client.query(sql);
    console.log("Applied 20261114053000_outreach_manager.sql");
  }

  const { rows: relations } = await client.query(
    `select c.relname as name, c.relkind as kind
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relname = any($1::text[])`,
    ["sp_outbound_leads,sp_outbound_ready,sp_email_suppression,sp_rodo_notes,sp_outreach_allowlist,sp_outreach_sandy_notes".split(",")],
  );
  console.log("relations", relations);

  const { rows: columns } = await client.query(
    `select table_name, column_name, data_type, is_nullable
     from information_schema.columns
     where table_schema = 'public'
       and table_name = any($1::text[])
     order by table_name, ordinal_position`,
    [["sp_outbound_leads", "sp_outbound_ready", "sp_email_suppression"]],
  );
  console.log("columns", columns.map((column) => `${column.table_name}.${column.column_name}:${column.data_type}:${column.is_nullable}`).join("\n"));

  async function count(table, whereSql = "") {
    const { rows } = await client.query(`select count(*)::int as n from public.${quote(table)} ${whereSql}`);
    return rows[0].n;
  }

  const leadColumns = columns.filter((column) => column.table_name === "sp_outbound_leads").map((column) => column.column_name);
  const emailCol = ["email", "email_address", "recipient_email", "recipient"].find((name) => leadColumns.includes(name));
  const statusCol = ["status", "outreach_status", "lead_status"].find((name) => leadColumns.includes(name));
  const report = {
    leads: relations.some((row) => row.name === "sp_outbound_leads") ? await count("sp_outbound_leads") : null,
    withEmail: emailCol ? await count("sp_outbound_leads", `where nullif(btrim(${quote(emailCol)}::text), '') is not null`) : null,
    statusNew: statusCol ? await count("sp_outbound_leads", `where lower(btrim(${quote(statusCol)}::text)) = 'new'`) : null,
    ready: relations.some((row) => row.name === "sp_outbound_ready") ? await count("sp_outbound_ready") : null,
    suppressed: relations.some((row) => row.name === "sp_email_suppression") ? await count("sp_email_suppression") : null,
  };
  console.log("counts", report);

  if (relations.some((row) => row.name === "sp_outreach_allowlist")) {
    const { rows: security } = await client.query(
      `select c.relname, c.relrowsecurity, c.reloptions
       from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public'
         and c.relname = any($1::text[])`,
      [["sp_outreach_allowlist", "sp_rodo_notes", "sp_outreach_saved_views", "sp_outreach_sandy_notes"]],
    );
    console.log("security", security);

    await client.query("begin");
    try {
      await client.query("select set_config('request.jwt.claims', $1, true)", [
        JSON.stringify({ email: "intruder@example.com", role: "authenticated" }),
      ]);
      await client.query("set local role authenticated");
      const intruder = await client.query("select count(*)::int as n from public.sp_rodo_notes");
      console.log("intruder_notes", intruder.rows[0].n);
      let intruderDenied = false;
      try {
        await client.query("select count(*)::int as n from public.sp_outbound_leads");
        console.log("intruder_leads", "readable");
      } catch (error) {
        intruderDenied = error.code === "42501";
        console.log("intruder_leads", intruderDenied ? "denied" : error.code);
      }
    } finally {
      await client.query("rollback");
    }
  }
} finally {
  await client.end();
}
