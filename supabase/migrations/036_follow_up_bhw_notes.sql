-- Migration 036: Add BHW field-visit notes and resolved timestamp to prenatal_follow_ups.
-- These fields let a BHW record what happened during the follow-up visit and when
-- the case was resolved, without requiring a separate table.

alter table public.prenatal_follow_ups
  add column if not exists bhw_notes  text,
  add column if not exists resolved_at timestamptz;

comment on column public.prenatal_follow_ups.bhw_notes is
  'Free-text notes recorded by the BHW after visiting the mother (e.g. reason for absence, rescheduled date agreed).';
comment on column public.prenatal_follow_ups.resolved_at is
  'Timestamp when the BHW marked this follow-up as resolved or contacted. NULL = still pending.';
