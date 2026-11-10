-- Add schedule metadata and provider audit receipts.
alter table public.prenatal_schedules
  add column if not exists updated_at timestamptz default now(),
  add column if not exists reminder_attempted_at timestamptz,
  add column if not exists notes text;

comment on column public.prenatal_schedules.updated_at is
  'Last time the schedule was created or edited. Editing resets reminder_sent so the new date gets a fresh reminder.';
comment on column public.prenatal_schedules.reminder_attempted_at is
  'Last time the automatic reminder job tried to send for this schedule. The job backs off for an hour after an attempt, so a provider-side failure (e.g. no registered sender name) cannot write a new failure row on every page view.';

create or replace function public.touch_prenatal_schedules_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists prenatal_schedules_touch_updated_at on public.prenatal_schedules;
create trigger prenatal_schedules_touch_updated_at
  before update on public.prenatal_schedules
  for each row
  execute function public.touch_prenatal_schedules_updated_at();
-- 2. Duplicate-proof the schedule -> mother links
-- Without this a double click, or a retry after a partial failure, can add
-- the same mother to a schedule twice and she then receives two reminders.
delete from public.prenatal_schedule_recipients a
using public.prenatal_schedule_recipients b
where a.ctid < b.ctid
  and a.schedule_id = b.schedule_id
  and a.pregnant_mother_id = b.pregnant_mother_id;

create unique index if not exists prenatal_schedule_recipients_unique_mother
  on public.prenatal_schedule_recipients(schedule_id, pregnant_mother_id);
-- 3. Duplicate-proof the reminder history
-- Same reasoning, and it is the table the automatic job reads back.
delete from public.prenatal_schedule_reminders a
using public.prenatal_schedule_reminders b
where a.ctid < b.ctid
  and a.schedule_id = b.schedule_id
  and a.pregnant_mother_id = b.pregnant_mother_id;

create unique index if not exists prenatal_schedule_reminders_unique_mother
  on public.prenatal_schedule_reminders(schedule_id, pregnant_mother_id);

alter table public.prenatal_schedule_reminders
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists send_kind text not null default 'auto';

create index if not exists prenatal_schedule_reminders_schedule_idx
  on public.prenatal_schedule_reminders(schedule_id);
-- 4. sms_logs: record the provider's real answer
alter table public.sms_logs
  add column if not exists semaphore_response jsonb,
  add column if not exists schedule_id uuid references public.prenatal_schedules(id) on delete set null,
  add column if not exists send_kind text not null default 'manual',
  add column if not exists credits_before integer,
  add column if not exists credits_after integer;

comment on column public.sms_logs.semaphore_response is
  'Verbatim body returned by Semaphore for this batch. Kept so a delivery can be audited without guessing.';
comment on column public.sms_logs.send_kind is
  'auto = scheduled one-day-before job, manual = a person pressed Send.';

create index if not exists sms_logs_schedule_idx on public.sms_logs(schedule_id);
create index if not exists sms_logs_created_at_idx on public.sms_logs(created_at desc);
-- 5. sms_recipient_receipts: one row per recipient, holding what Semaphore
create table if not exists public.sms_recipient_receipts (
  id uuid primary key default gen_random_uuid(),
  sms_log_id uuid not null references public.sms_logs(id) on delete cascade,
  schedule_id uuid references public.prenatal_schedules(id) on delete cascade,
  pregnant_mother_id uuid references public.pregnant_mothers(id) on delete set null,
  contact_number text not null,
  dedupe_key text not null unique,
  send_kind text not null default 'manual',
  provider_message_id text,
  provider_status text not null default 'unknown',
  error_message text,
  sent_by uuid references public.profiles(id) on delete set null,
  sent_at timestamptz not null default now()
);

comment on table public.sms_recipient_receipts is
  'Per-recipient record of what Semaphore returned. The unique dedupe_key is what prevents the same reminder being sent twice.';

create index if not exists sms_recipient_receipts_schedule_idx
  on public.sms_recipient_receipts(schedule_id);
create index if not exists sms_recipient_receipts_mother_idx
  on public.sms_recipient_receipts(pregnant_mother_id);
create index if not exists sms_recipient_receipts_sent_at_idx
  on public.sms_recipient_receipts(sent_at desc);

alter table public.sms_recipient_receipts enable row level security;
-- Staff read the receipts so the SMS Log can show the real per-number result.
-- A BHW (purok) sees receipts for mothers in her own purok, and never another.
create or replace function public.sms_receipt_visible_to(uid uuid, mother_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_clinical_staff()
      or (mother_id is not null and public.can_access_mother(mother_id));
$$;

drop policy if exists "sms_recipient_receipts_read" on public.sms_recipient_receipts;
create policy "sms_recipient_receipts_read"
  on public.sms_recipient_receipts for select to authenticated
  using (public.sms_receipt_visible_to(auth.uid(), pregnant_mother_id));
-- Only the service role (the app's server-side sender) writes receipts.
-- A browser session must never be able to forge a receipt.
drop policy if exists "sms_recipient_receipts_insert" on public.sms_recipient_receipts;
drop policy if exists "sms_recipient_receipts_update" on public.sms_recipient_receipts;
drop policy if exists "sms_recipient_receipts_delete" on public.sms_recipient_receipts;

revoke all on function public.sms_receipt_visible_to(uid uuid, mother_id uuid) from public;
-- 6. Keep the pregnancy calendar correct after a schedule is edited
-- (replaces nothing; 003/004 only added the columns)
create or replace function public.invalidate_schedule_reminders(schedule_uuid uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
-- The reminder text embeds the visit date, so a changed date invalidates
-- every message already produced for this schedule.
  update public.prenatal_schedules
     set reminder_sent = false,
         reminder_sent_at = null,
         reminder_attempted_at = null,
         missed_follow_up_sent = false
   where id = schedule_uuid
     and status = 'scheduled';

  delete from public.prenatal_schedule_reminders where schedule_id = schedule_uuid;

  delete from public.sms_recipient_receipts
   where schedule_id = schedule_uuid
     and send_kind = 'auto';

  delete from public.maternal_notifications
   where event_key like 'prenatal-reminder:' || schedule_uuid::text || ':%';
end;
$$;

revoke all on function public.invalidate_schedule_reminders(schedule_uuid uuid) from public;
-- 7. Automatic reminder due-date view
-- A schedule is "due" when its visit is tomorrow (or today and not yet
-- reminded), has not been reminded, and is still open.
create or replace view public.prenatal_schedules_due
with (security_invoker = true)
as
select s.id,
       s.visit_date,
       s.trimester,
       s.reminder_sent,
       (s.visit_date <= (now() at time zone 'Asia/Manila')::date) as due_today
  from public.prenatal_schedules s
 where s.status = 'scheduled'
   and s.reminder_sent = false
   and s.visit_date <= ((now() at time zone 'Asia/Manila')::date + 1);

notify pgrst, 'reload schema';
