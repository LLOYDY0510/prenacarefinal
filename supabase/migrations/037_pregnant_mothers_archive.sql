-- Migration 037: Add archiving support to pregnant_mothers.
-- Only the midwife (admin role) can archive/unarchive records.
-- Archived records are hidden from the normal list but never deleted.

alter table public.pregnant_mothers
  add column if not exists archived_at timestamptz default null;

comment on column public.pregnant_mothers.archived_at is
  'Set by the midwife (admin) to hide this record from the active list. NULL = active. Non-null = archived.';

create index if not exists pregnant_mothers_archived_at_idx
  on public.pregnant_mothers(archived_at)
  where archived_at is not null;
