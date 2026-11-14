-- Outreach desk (additive).
-- Sandy, the outreach bot, reads public.sp_rodo_notes with the service role
-- before daily runs. Service role bypasses RLS. Everyone else is denied unless
-- their Supabase Auth email is an active row in sp_outreach_allowlist.
-- This file does not alter, rename, or drop existing tables or columns,
-- and it does not touch the public.orders -> sp_orders sync functions.
-- sp_outbound_ready is an existing view. This migration does not create,
-- replace, alter, or drop it. The desk only reads it.

begin;

create table if not exists public.sp_outreach_allowlist (
  email text primary key,
  full_name text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint sp_outreach_allowlist_email_chk check (email = lower(email) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')
);

comment on table public.sp_outreach_allowlist is
  'Emails allowed to use the OSW sales outreach desk. Checked by RLS and by the API.';

insert into public.sp_outreach_allowlist (email, full_name)
values
  ('ralvarez@soilseedandwater.com', 'Rodolfo Alvarez'),
  ('vanessa@soilseedandwater.com', 'Vanessa')
on conflict (email) do nothing;

create table if not exists public.sp_rodo_notes (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id text not null,
  note text not null default '',
  note_for_sandy boolean not null default false,
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  done boolean not null default false,
  done_at timestamptz,
  constraint sp_rodo_notes_entity_type_chk check (char_length(entity_type) between 1 and 64),
  constraint sp_rodo_notes_entity_id_chk check (char_length(entity_id) between 1 and 128),
  constraint sp_rodo_notes_note_chk check (char_length(note) <= 8000),
  constraint sp_rodo_notes_created_by_chk check (char_length(created_by) between 3 and 320)
);

comment on table public.sp_rodo_notes is
  'Notes written from the outreach desk. Sandy should select rows where note_for_sandy is true. Columns: id, entity_type, entity_id, note, note_for_sandy, created_by, created_at, updated_at, done, done_at.';

comment on column public.sp_rodo_notes.entity_type is
  'Record family, such as outbound_lead, lead, customer, nursery, followup, opportunity.';
comment on column public.sp_rodo_notes.entity_id is
  'Primary key of the related record, stored as text.';
comment on column public.sp_rodo_notes.note_for_sandy is
  'True when the outreach bot (Sandy) should read this note before a daily run.';
comment on column public.sp_rodo_notes.done is
  'True when Rodo has finished the note. done_at is set at the same time.';

create index if not exists sp_rodo_notes_entity_idx
  on public.sp_rodo_notes (entity_type, entity_id, created_at desc);

create index if not exists sp_rodo_notes_sandy_open_idx
  on public.sp_rodo_notes (created_at desc)
  where note_for_sandy = true and done = false;

create table if not exists public.sp_outreach_saved_views (
  id uuid primary key default gen_random_uuid(),
  owner_email text not null,
  name text not null,
  tab text not null,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sp_outreach_saved_views_owner_chk check (owner_email = lower(owner_email)),
  constraint sp_outreach_saved_views_name_chk check (char_length(name) between 1 and 80),
  constraint sp_outreach_saved_views_tab_chk check (tab in ('waiting', 'leads', 'replies', 'metrics'))
);

create index if not exists sp_outreach_saved_views_owner_idx
  on public.sp_outreach_saved_views (owner_email, tab, updated_at desc);

-- Open notes Sandy should read. security_invoker so the view follows
-- sp_rodo_notes RLS instead of running as the view owner.
create or replace view public.sp_outreach_sandy_notes
with (security_invoker = true) as
select
  id,
  entity_type,
  entity_id,
  note,
  note_for_sandy,
  created_by,
  created_at,
  updated_at,
  done,
  done_at
from public.sp_rodo_notes
where note_for_sandy = true
  and done = false;

comment on view public.sp_outreach_sandy_notes is
  'Open notes flagged for Sandy. security_invoker = true. Same columns as sp_rodo_notes, filtered to note_for_sandy and not done.';

alter table public.sp_outreach_allowlist enable row level security;
alter table public.sp_rodo_notes enable row level security;
alter table public.sp_outreach_saved_views enable row level security;

revoke all on table public.sp_outreach_allowlist from public, anon;
revoke all on table public.sp_rodo_notes from public, anon;
revoke all on table public.sp_outreach_saved_views from public, anon;
revoke all on table public.sp_outreach_sandy_notes from public, anon;

grant select on table public.sp_outreach_allowlist to authenticated;
grant select, insert, update on table public.sp_rodo_notes to authenticated;
grant select, insert, update, delete on table public.sp_outreach_saved_views to authenticated;
grant select on table public.sp_outreach_sandy_notes to authenticated;

-- Row check only. Do not subquery this same table from its own policy (that recurses).
drop policy if exists sp_outreach_allowlist_select on public.sp_outreach_allowlist;
create policy sp_outreach_allowlist_select
  on public.sp_outreach_allowlist
  for select
  to authenticated
  using (lower(email) = lower(coalesce((select auth.jwt() ->> 'email'), '')));

drop policy if exists sp_rodo_notes_select on public.sp_rodo_notes;
create policy sp_rodo_notes_select
  on public.sp_rodo_notes
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.sp_outreach_allowlist a
      where a.active = true
        and lower(a.email) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
    )
  );

drop policy if exists sp_rodo_notes_insert on public.sp_rodo_notes;
create policy sp_rodo_notes_insert
  on public.sp_rodo_notes
  for insert
  to authenticated
  with check (
    lower(created_by) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
    and exists (
      select 1
      from public.sp_outreach_allowlist a
      where a.active = true
        and lower(a.email) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
    )
  );

drop policy if exists sp_rodo_notes_update on public.sp_rodo_notes;
create policy sp_rodo_notes_update
  on public.sp_rodo_notes
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.sp_outreach_allowlist a
      where a.active = true
        and lower(a.email) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
    )
  )
  with check (
    exists (
      select 1
      from public.sp_outreach_allowlist a
      where a.active = true
        and lower(a.email) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
    )
  );

drop policy if exists sp_outreach_saved_views_all on public.sp_outreach_saved_views;
create policy sp_outreach_saved_views_all
  on public.sp_outreach_saved_views
  for all
  to authenticated
  using (
    lower(owner_email) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
    and exists (
      select 1
      from public.sp_outreach_allowlist a
      where a.active = true
        and lower(a.email) = lower(owner_email)
    )
  )
  with check (
    lower(owner_email) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
    and exists (
      select 1
      from public.sp_outreach_allowlist a
      where a.active = true
        and lower(a.email) = lower(owner_email)
    )
  );

commit;
