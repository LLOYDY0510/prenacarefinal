-- Paste-and-run repair for the hosted Supabase project.
alter table public.prenatal_schedules
  add column if not exists trimester text;

alter table public.prenatal_schedules
  drop constraint if exists prenatal_schedules_trimester_check;
alter table public.prenatal_schedules
  add constraint prenatal_schedules_trimester_check
  check (trimester is null or trimester in ('1st', '2nd', '3rd'));

create index if not exists prenatal_schedules_trimester_date_idx
  on public.prenatal_schedules(trimester, visit_date);
-- 2. Scheduled vs actual checkup dates (from 003_prenatal_trimester_dates.sql)
alter table public.prenatal_checkups
  add column if not exists scheduled_checkup_date date,
  add column if not exists actual_checkup_date date;

update public.prenatal_checkups
set scheduled_checkup_date = coalesce(scheduled_checkup_date, scheduled_for, checkup_date),
    actual_checkup_date = coalesce(
      actual_checkup_date,
      case when status = 'completed' then checkup_date else null end
    )
where scheduled_checkup_date is null
   or (status = 'completed' and actual_checkup_date is null);

create index if not exists prenatal_checkups_trimester_date_idx
  on public.prenatal_checkups(pregnant_mother_id, trimester, scheduled_checkup_date);
-- 3. Has-checkup flag on the mother record (from 003)
alter table public.pregnant_mothers
  add column if not exists checkup_recorded boolean not null default false;

create or replace function public.sync_pregnant_mother_checkup_recorded()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    update public.pregnant_mothers
    set checkup_recorded = exists (
      select 1
      from public.prenatal_checkups pc
      where pc.pregnant_mother_id = old.pregnant_mother_id
        and pc.actual_checkup_date is not null
    )
    where id = old.pregnant_mother_id;
    return old;
  end if;

  update public.pregnant_mothers
  set checkup_recorded = exists (
    select 1
    from public.prenatal_checkups pc
    where pc.pregnant_mother_id = coalesce(new.pregnant_mother_id, old.pregnant_mother_id)
      and pc.actual_checkup_date is not null
  )
  where id = coalesce(new.pregnant_mother_id, old.pregnant_mother_id);
  return new;
end;
$$;

drop trigger if exists sync_pregnant_mother_checkup_recorded
  on public.prenatal_checkups;
create trigger sync_pregnant_mother_checkup_recorded
  after insert or update or delete on public.prenatal_checkups
  for each row execute function public.sync_pregnant_mother_checkup_recorded();

update public.pregnant_mothers pm
set checkup_recorded = exists (
  select 1
  from public.prenatal_checkups pc
  where pc.pregnant_mother_id = pm.id
    and pc.actual_checkup_date is not null
);
-- 4. Recipients junction table timestamp (from 010_missing_tables.sql)
alter table public.prenatal_schedule_recipients
  add column if not exists created_at timestamptz not null default now();
-- 5. Unique keys required by upserts and by the intended schema
-- checkPrenatalReminders.ts upserts on (schedule_id, pregnant_mother_id),
-- which fails with "could not find unique constraint" without this key.
-- Verified 0 duplicate rows before adding them.
delete from public.prenatal_follow_ups a
  using public.prenatal_follow_ups b
  where a.schedule_id = b.schedule_id
    and a.pregnant_mother_id = b.pregnant_mother_id
    and a.ctid > b.ctid;

create unique index if not exists prenatal_follow_ups_schedule_mother_unique
  on public.prenatal_follow_ups(schedule_id, pregnant_mother_id);

delete from public.prenatal_schedule_recipients a
  using public.prenatal_schedule_recipients b
  where a.schedule_id = b.schedule_id
    and a.pregnant_mother_id = b.pregnant_mother_id
    and a.ctid > b.ctid;

create unique index if not exists prenatal_schedule_recipients_unique
  on public.prenatal_schedule_recipients(schedule_id, pregnant_mother_id);

delete from public.monthly_tips a
  using public.monthly_tips b
  where a.month = b.month
    and a.risk_level = b.risk_level
    and a.ctid > b.ctid;

create unique index if not exists monthly_tips_unique_month_risk
  on public.monthly_tips(month, risk_level);
-- 6. sms_logs -> profiles relationship
-- /dashboard/sms-log selects profiles(full_name, email) from sms_logs and
-- currently fails with PGRST200. The FK makes the embed resolvable.
-- Any auth user without a profile row is inserted first so the FK stays valid.
insert into public.profiles (id, email, full_name, role)
select u.id, u.email, coalesce(u.raw_user_meta_data ->> 'full_name', u.email), 'pending'
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id)
on conflict (id) do nothing;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.sms_logs'::regclass
      and contype = 'f'
      and confrelid = 'public.profiles'::regclass
  ) then
    alter table public.sms_logs
      add constraint sms_logs_sent_by_fkey
      foreign key (sent_by) references public.profiles(id) on delete set null;
  end if;
end;
$$;
-- 7. Reload the PostgREST schema cache so the new columns are served at once
notify pgrst, 'reload schema';
