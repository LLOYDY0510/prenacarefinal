-- Comprehensive RLS policies for BHW purok-based access control
-- This ensures BHW users can only access mothers and data within their assigned purok
-- Enable RLS on pregnant_mothers table if not already enabled
alter table public.pregnant_mothers enable row level security;
-- Drop existing policies to avoid conflicts
drop policy if exists "bhw_purok can read mothers in their purok" on public.pregnant_mothers;
drop policy if exists "bhw_purok can insert mothers in their purok" on public.pregnant_mothers;
drop policy if exists "bhw_purok can update mothers in their purok" on public.pregnant_mothers;
drop policy if exists "authenticated users can read mothers" on public.pregnant_mothers;
drop policy if exists "care staff can manage mothers" on public.pregnant_mothers;
-- Create comprehensive RLS policies for pregnant_mothers
create policy "admins and nurses can read all mothers"
  on public.pregnant_mothers for select to authenticated
  using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role in ('admin', 'nurse', 'bhw_head')
  ));

create policy "bhw_purok can read mothers in their purok"
  on public.pregnant_mothers for select to authenticated
  using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'bhw_purok' and p.purok = pregnant_mothers.purok
  ));

create policy "pregnant_mothers can read their own record"
  on public.pregnant_mothers for select to authenticated
  using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.pregnant_mother_id = pregnant_mothers.id
  ));

create policy "admins and nurses can manage all mothers"
  on public.pregnant_mothers for all to authenticated
  using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role in ('admin', 'nurse', 'bhw_head')
  ))
  with check (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role in ('admin', 'nurse', 'bhw_head')
  ));

create policy "bhw_purok can insert mothers in their purok"
  on public.pregnant_mothers for insert to authenticated
  with check (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'bhw_purok' and p.purok = pregnant_mothers.purok
  ));

create policy "bhw_purok can update mothers in their purok"
  on public.pregnant_mothers for update to authenticated
  using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'bhw_purok' and p.purok = pregnant_mothers.purok
  ))
  with check (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'bhw_purok' and p.purok = pregnant_mothers.purok
  ));
-- RLS policies for prenatal_schedules
alter table public.prenatal_schedules enable row level security;

drop policy if exists "bhw_purok can read schedules in their purok" on public.prenatal_schedules;
drop policy if exists "bhw_purok can manage schedules in their purok" on public.prenatal_schedules;

create policy "admins and nurses can read all schedules"
  on public.prenatal_schedules for select to authenticated
  using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role in ('admin', 'nurse', 'bhw_head')
  ));

create policy "bhw_purok can read schedules in their purok"
  on public.prenatal_schedules for select to authenticated
  using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'bhw_purok' and exists (
      select 1 from public.prenatal_schedule_recipients r
      join public.pregnant_mothers pm on pm.id = r.pregnant_mother_id
      where r.schedule_id = prenatal_schedules.id and pm.purok = p.purok
    )
  ));

create policy "admins and nurses can manage all schedules"
  on public.prenatal_schedules for all to authenticated
  using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role in ('admin', 'nurse', 'bhw_head')
  ))
  with check (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role in ('admin', 'nurse', 'bhw_head')
  ));

create policy "bhw_purok can manage schedules in their purok"
  on public.prenatal_schedules for all to authenticated
  using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'bhw_purok' and exists (
      select 1 from public.prenatal_schedule_recipients r
      join public.pregnant_mothers pm on pm.id = r.pregnant_mother_id
      where r.schedule_id = prenatal_schedules.id and pm.purok = p.purok
    )
  ))
  with check (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'bhw_purok' and exists (
      select 1 from public.prenatal_schedule_recipients r
      join public.pregnant_mothers pm on pm.id = r.pregnant_mother_id
      where r.schedule_id = prenatal_schedules.id and pm.purok = p.purok
    )
  ));
-- Update maternal_health_history RLS policies
drop policy if exists "care staff can manage maternal history" on public.maternal_health_history;
drop policy if exists "authenticated users can read maternal history" on public.maternal_health_history;

create policy "admins and nurses can read all maternal history"
  on public.maternal_health_history for select to authenticated
  using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role in ('admin', 'nurse', 'bhw_head')
  ));

create policy "bhw_purok can read maternal history in their purok"
  on public.maternal_health_history for select to authenticated
  using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'bhw_purok' and p.purok = (
      select pm.purok from public.pregnant_mothers pm
      where pm.id = maternal_health_history.pregnant_mother_id
    )
  ));

create policy "admins and nurses can manage all maternal history"
  on public.maternal_health_history for all to authenticated
  using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role in ('admin', 'nurse', 'bhw_head')
  ))
  with check (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role in ('admin', 'nurse', 'bhw_head')
  ));

create policy "bhw_purok can manage maternal history in their purok"
  on public.maternal_health_history for all to authenticated
  using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'bhw_purok' and p.purok = (
      select pm.purok from public.pregnant_mothers pm
      where pm.id = maternal_health_history.pregnant_mother_id
    )
  ))
  with check (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'bhw_purok' and p.purok = (
      select pm.purok from public.pregnant_mothers pm
      where pm.id = maternal_health_history.pregnant_mother_id
    )
  ));
-- Update maternal_referrals RLS policies
drop policy if exists "care staff can manage referrals" on public.maternal_referrals;
drop policy if exists "authenticated users can read referrals" on public.maternal_referrals;

create policy "admins and nurses can read all referrals"
  on public.maternal_referrals for select to authenticated
  using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role in ('admin', 'nurse', 'bhw_head')
  ));

create policy "bhw_purok can read referrals in their purok"
  on public.maternal_referrals for select to authenticated
  using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'bhw_purok' and p.purok = (
      select pm.purok from public.pregnant_mothers pm
      where pm.id = maternal_referrals.pregnant_mother_id
    )
  ));

create policy "admins and nurses can manage all referrals"
  on public.maternal_referrals for all to authenticated
  using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role in ('admin', 'nurse', 'bhw_head')
  ))
  with check (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role in ('admin', 'nurse', 'bhw_head')
  ));

create policy "bhw_purok can manage referrals in their purok"
  on public.maternal_referrals for all to authenticated
  using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'bhw_purok' and p.purok = (
      select pm.purok from public.pregnant_mothers pm
      where pm.id = maternal_referrals.pregnant_mother_id
    )
  ))
  with check (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'bhw_purok' and p.purok = (
      select pm.purok from public.pregnant_mothers pm
      where pm.id = maternal_referrals.pregnant_mother_id
    )
  ));
-- Update prenatal_follow_ups RLS policies
drop policy if exists "care staff can manage follow ups" on public.prenatal_follow_ups;
drop policy if exists "authenticated users can read follow ups" on public.prenatal_follow_ups;

create policy "admins and nurses can read all follow ups"
  on public.prenatal_follow_ups for select to authenticated
  using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role in ('admin', 'nurse', 'bhw_head')
  ));

create policy "bhw_purok can read follow ups in their purok"
  on public.prenatal_follow_ups for select to authenticated
  using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'bhw_purok' and p.purok = (
      select pm.purok from public.pregnant_mothers pm
      where pm.id = prenatal_follow_ups.pregnant_mother_id
    )
  ));

create policy "admins and nurses can manage all follow ups"
  on public.prenatal_follow_ups for all to authenticated
  using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role in ('admin', 'nurse', 'bhw_head')
  ))
  with check (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role in ('admin', 'nurse', 'bhw_head')
  ));

create policy "bhw_purok can manage follow ups in their purok"
  on public.prenatal_follow_ups for all to authenticated
  using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'bhw_purok' and p.purok = (
      select pm.purok from public.pregnant_mothers pm
      where pm.id = prenatal_follow_ups.pregnant_mother_id
    )
  ))
  with check (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'bhw_purok' and p.purok = (
      select pm.purok from public.pregnant_mothers pm
      where pm.id = prenatal_follow_ups.pregnant_mother_id
    )
  ));
-- RLS policies for sms_logs
alter table public.sms_logs enable row level security;

drop policy if exists "authenticated users can read sms logs" on public.sms_logs;
drop policy if exists "staff can manage sms logs" on public.sms_logs;

create policy "admins and nurses can read all sms logs"
  on public.sms_logs for select to authenticated
  using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role in ('admin', 'nurse', 'bhw_head')
  ));

create policy "bhw_purok can read sms logs sent by them"
  on public.sms_logs for select to authenticated
  using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'bhw_purok' and sms_logs.sent_by = auth.uid()
  ));

create policy "admins and nurses can manage sms logs"
  on public.sms_logs for all to authenticated
  using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role in ('admin', 'nurse', 'bhw_head')
  ))
  with check (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role in ('admin', 'nurse', 'bhw_head')
  ));

create policy "bhw_purok can insert sms logs"
  on public.sms_logs for insert to authenticated
  with check (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'bhw_purok'
  ));
