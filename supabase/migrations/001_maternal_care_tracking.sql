-- Additive migration for prenatal care tracking and access control.

alter table public.prenatal_checkups
  add column if not exists status text not null default 'completed',
  add column if not exists scheduled_for date;

alter table public.prenatal_checkups
  drop constraint if exists prenatal_checkups_status_check;
alter table public.prenatal_checkups
  add constraint prenatal_checkups_status_check
  check (status in ('scheduled', 'completed', 'missed', 'cancelled'));

alter table public.prenatal_schedules
  add column if not exists status text not null default 'scheduled',
  add column if not exists missed_follow_up_sent boolean not null default false;

alter table public.prenatal_schedules
  drop constraint if exists prenatal_schedules_status_check;
alter table public.prenatal_schedules
  add constraint prenatal_schedules_status_check
  check (status in ('scheduled', 'completed', 'missed', 'cancelled'));

create table if not exists public.maternal_health_history (
  id uuid primary key default gen_random_uuid(),
  pregnant_mother_id uuid not null references public.pregnant_mothers(id) on delete cascade,
  condition text not null,
  details text,
  diagnosed_date date,
  resolved_date date,
  recorded_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.maternal_referrals (
  id uuid primary key default gen_random_uuid(),
  pregnant_mother_id uuid not null references public.pregnant_mothers(id) on delete cascade,
  referred_to text not null,
  reason text not null,
  status text not null default 'pending',
  referred_at date not null default current_date,
  follow_up_date date,
  outcome text,
  created_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  constraint maternal_referrals_status_check check (status in ('pending', 'in_progress', 'completed', 'cancelled'))
);

create table if not exists public.prenatal_follow_ups (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references public.prenatal_schedules(id) on delete cascade,
  pregnant_mother_id uuid not null references public.pregnant_mothers(id) on delete cascade,
  reason text not null default 'Missed prenatal visit',
  status text not null default 'pending',
  sms_status text not null default 'not_sent',
  follow_up_sent_at timestamptz,
  next_contact_date date,
  created_at timestamptz not null default now(),
  constraint prenatal_follow_ups_status_check check (status in ('pending', 'contacted', 'resolved', 'unreachable')),
  constraint prenatal_follow_ups_sms_status_check check (sms_status in ('not_sent', 'queued', 'sent', 'failed'))
);

create unique index if not exists prenatal_follow_ups_schedule_mother_idx
  on public.prenatal_follow_ups(schedule_id, pregnant_mother_id);

create table if not exists public.maternal_notifications (
  id uuid primary key default gen_random_uuid(),
  pregnant_mother_id uuid not null references public.pregnant_mothers(id) on delete cascade,
  event_key text not null,
  category text not null,
  title text not null,
  message text not null,
  email text,
  email_status text not null default 'pending',
  email_sent_at timestamptz,
  email_error text,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  constraint maternal_notifications_email_status_check check (email_status in ('pending', 'sent', 'failed', 'skipped'))
);

create unique index if not exists maternal_notifications_event_key_idx
  on public.maternal_notifications(event_key);

alter table public.maternal_notifications enable row level security;

alter table public.maternal_notifications
  alter column pregnant_mother_id drop not null,
  add column if not exists recipient_user_id uuid references auth.users(id) on delete cascade,
  add column if not exists recipient_role text,
  add column if not exists recipient_purok text;

create index if not exists maternal_notifications_recipient_user_idx
  on public.maternal_notifications(recipient_user_id, created_at desc);
create index if not exists maternal_notifications_recipient_role_idx
  on public.maternal_notifications(recipient_role, recipient_purok, created_at desc);

create policy "mothers can read their notifications"
  on public.maternal_notifications for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.pregnant_mother_id = maternal_notifications.pregnant_mother_id));
create policy "staff can read notifications"
  on public.maternal_notifications for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'nurse', 'bhw_head', 'bhw_purok')));
create policy "staff can create notifications"
  on public.maternal_notifications for insert to authenticated
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'nurse', 'bhw_head', 'bhw_purok')));
create policy "mothers can mark notifications read"
  on public.maternal_notifications for update to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.pregnant_mother_id = maternal_notifications.pregnant_mother_id))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.pregnant_mother_id = maternal_notifications.pregnant_mother_id));
create policy "users can mark their notifications read"
  on public.maternal_notifications for update to authenticated
  using (recipient_user_id = auth.uid())
  with check (recipient_user_id = auth.uid());
create policy "roles can mark their notifications read"
  on public.maternal_notifications for update to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and (p.role = maternal_notifications.recipient_role or (p.role = 'bhw_purok' and p.purok = maternal_notifications.recipient_purok))))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and (p.role = maternal_notifications.recipient_role or (p.role = 'bhw_purok' and p.purok = maternal_notifications.recipient_purok))));

alter table public.sms_logs
  add column if not exists delivery_status text not null default 'unknown',
  add column if not exists provider_message_id text,
  add column if not exists delivered_at timestamptz,
  add column if not exists message_type text not null default 'general',
  add column if not exists recipient_mother_ids uuid[];

alter table public.sms_logs
  drop constraint if exists sms_logs_message_type_check;
alter table public.sms_logs
  add constraint sms_logs_message_type_check
  check (message_type in ('general', 'prenatal_reminder', 'missed_visit_follow_up', 'risk_alert', 'health_tip', 'nutrition_tip', 'care_message'));

alter table public.sms_logs
  drop constraint if exists sms_logs_delivery_status_check;
alter table public.sms_logs
  add constraint sms_logs_delivery_status_check
  check (delivery_status in ('unknown', 'queued', 'sent', 'delivered', 'failed'));

alter table public.maternal_health_history enable row level security;
alter table public.maternal_referrals enable row level security;
alter table public.prenatal_follow_ups enable row level security;

create policy "authenticated users can read maternal history"
  on public.maternal_health_history for select to authenticated using (true);
create policy "care staff can manage maternal history"
  on public.maternal_health_history for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'nurse', 'bhw_head', 'bhw_purok')))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'nurse', 'bhw_head', 'bhw_purok')));

create policy "authenticated users can read referrals"
  on public.maternal_referrals for select to authenticated using (true);
create policy "care staff can manage referrals"
  on public.maternal_referrals for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'nurse', 'bhw_head', 'bhw_purok')))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'nurse', 'bhw_head', 'bhw_purok')));

create policy "authenticated users can read follow ups"
  on public.prenatal_follow_ups for select to authenticated using (true);
create policy "care staff can manage follow ups"
  on public.prenatal_follow_ups for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'nurse', 'bhw_head', 'bhw_purok')))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'nurse', 'bhw_head', 'bhw_purok')));
