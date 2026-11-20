# Outreach desk

Internal page: `/admin/outreach`.

It manages cold outreach. It does not send email, text, or calls.

`/api/admin/outreach` and `/api/admin/outreach/*` are rewritten to the Vercel function `api/outreach-desk.js` before the `/api` catch-all. That function is what answers the desk. `api/index.js` still has the same dispatch as a fallback.

Apply `supabase/migrations/20261114053000_outreach_manager.sql` before the first sign-in. The migration only adds `sp_outreach_allowlist`, `sp_rodo_notes`, `sp_outreach_saved_views`, and the read-only view `sp_outreach_sandy_notes`. It does not change `sp_outbound_ready` or the `public.orders` to `sp_orders` sync.

## Sign-in

Only active rows in `sp_outreach_allowlist` can open the desk. The seed rows are:

- `ralvarez@soilseedandwater.com`
- `vanessa@soilseedandwater.com`

Two ways in:

1. The same password already stored on `admin_users`, if that email is on the allowlist. This does not send mail.
2. Email me a sign-in link. That uses Supabase Auth only. The link must land on `/admin/outreach`.

First time for a person who is not in `admin_users`: use the sign-in link. Supabase has to allow that redirect URL (`https://organicsoilwholesale.com/admin/outreach`, plus the Vercel preview origin). If the project blocks new Auth users, create the Auth user for that allowlisted email first, or set a password on `admin_users`.

The desk session is separate from the main admin session.

## Notes for Sandy

Table: `public.sp_rodo_notes`.

Sandy reads it with the service role before a daily run. Service role bypasses row level security.

Columns:

| Column | Type | Meaning |
| --- | --- | --- |
| `id` | uuid | Primary key |
| `entity_type` | text | `outbound_lead`, `lead`, `customer`, `nursery`, `followup`, or `opportunity` |
| `entity_id` | text | Primary key of that record |
| `note` | text | The note |
| `note_for_sandy` | boolean | True when Sandy should read it |
| `created_by` | text | Allowlisted email that wrote it |
| `created_at` | timestamptz | Written at |
| `updated_at` | timestamptz | Last change |
| `done` | boolean | True when the note is finished |
| `done_at` | timestamptz | When it was marked done, otherwise null |

Open notes for Sandy:

```sql
select id, entity_type, entity_id, note, note_for_sandy, created_by, created_at, updated_at, done, done_at
from public.sp_outreach_sandy_notes
order by created_at;
```

`sp_outreach_sandy_notes` is `security_invoker = true` and is just `sp_rodo_notes` where `note_for_sandy` is true and `done` is false. The same rows are:

```sql
select *
from public.sp_rodo_notes
where note_for_sandy = true
  and done = false
order by created_at;
```

## Live lead data

The Leads tab reads `sp_outbound_leads` from the database.

- **Ready to send** is a filter over the existing view `sp_outbound_ready`. The desk only selects from that view. It does not create, replace, or alter it.
- **Bounced** is a filter over `sp_email_suppression`. Matching addresses show a red badge. The desk does not delete suppression rows.

Saved views store filter settings for the signed-in person in `sp_outreach_saved_views`. They do not change `sp_outbound_ready`.

## Metrics

Sent, bounced, and reply rate come from lead status, and from a real send timestamp when one exists (`sent_at`, `emailed_at`, `last_sent_at`, or `email_sent_at`). Daily buckets are omitted when no send timestamp exists. `created_at` is not treated as a send day. The suppression list is shown separately and is not folded into the reply rate. `sp_send_permissions` is a permission list, not a send log.
