begin;
create schema if not exists osw_reporting;
create table if not exists osw_reporting.improvement_log (
  improvement text not null,
  window_start date not null,
  window_end_exclusive date not null,
  baseline jsonb not null,
  deployed_at timestamptz,
  review_notes text not null,
  primary key (improvement, window_start),
  check (window_end_exclusive > window_start)
);
insert into osw_reporting.improvement_log
  (improvement, window_start, window_end_exclusive, baseline, review_notes)
values ('Checkout navigation and saved cart', '2026-10-20', '2026-11-19',
  '{"monitored_sessions":63,"abandoned_sessions":47,"last_seen_at_timing":24,"monitor_completed":14,"website_paid_orders":12,"timezone":"America/Phoenix"}',
  'Local redesign. After release record the deployment time and compare the first 30 complete Phoenix days with this baseline. Report abandoned / monitored and last seen at timing / monitored. Reconcile monitor completions to paid orders separately. Timing identifies the last observed step, not cause.')
on conflict (improvement, window_start) do nothing;
commit;
