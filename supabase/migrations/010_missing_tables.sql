-- Create missing database tables referenced in the codebase
-- Risk indicators table for risk assessment
create table if not exists public.risk_indicators (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  indicator_type text not null,
  threshold_value numeric,
  active boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  constraint risk_indicators_type_check check (indicator_type in ('checklist', 'age_below', 'first_pregnancy_age_above'))
);
-- Monthly tips templates table
create table if not exists public.monthly_tips (
  id uuid primary key default gen_random_uuid(),
  month integer not null check (month >= 1 and month <= 9),
  risk_level text not null,
  title text not null,
  content text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint monthly_tips_risk_level_check check (risk_level in ('low', 'high')),
  constraint monthly_tips_unique_month_risk unique (month, risk_level)
);
-- Tip broadcasts table
create table if not exists public.tip_broadcasts (
  id uuid primary key default gen_random_uuid(),
  month integer not null check (month >= 1 and month <= 9),
  risk_level text not null,
  period text not null,
  title text not null,
  content text not null,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  approved_by uuid references auth.users(id),
  sent_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint tip_broadcasts_risk_level_check check (risk_level in ('low', 'high')),
  constraint tip_broadcasts_status_check check (status in ('pending', 'approved', 'sent'))
);
-- Tip broadcast recipients junction table
create table if not exists public.tip_broadcast_recipients (
  id uuid primary key default gen_random_uuid(),
  broadcast_id uuid not null references public.tip_broadcasts(id) on delete cascade,
  pregnant_mother_id uuid not null references public.pregnant_mothers(id) on delete cascade,
  sent boolean not null default false,
  sent_at timestamptz,
  constraint tip_broadcast_recipients_unique unique (broadcast_id, pregnant_mother_id)
);
-- Pregnant mother indicators junction table
create table if not exists public.pregnant_mother_indicators (
  id uuid primary key default gen_random_uuid(),
  pregnant_mother_id uuid not null references public.pregnant_mothers(id) on delete cascade,
  indicator_id uuid not null references public.risk_indicators(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  assigned_by uuid references auth.users(id),
  constraint pregnant_mother_indicators_unique unique (pregnant_mother_id, indicator_id)
);
-- Prenatal schedule recipients junction table
create table if not exists public.prenatal_schedule_recipients (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references public.prenatal_schedules(id) on delete cascade,
  pregnant_mother_id uuid not null references public.pregnant_mothers(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint prenatal_schedule_recipients_unique unique (schedule_id, pregnant_mother_id)
);
-- Create indexes for performance
create index if not exists risk_indicators_active_idx on public.risk_indicators(active);
create index if not exists risk_indicators_type_idx on public.risk_indicators(indicator_type);
create index if not exists monthly_tips_month_idx on public.monthly_tips(month);
create index if not exists monthly_tips_risk_level_idx on public.monthly_tips(risk_level);
create index if not exists tip_broadcasts_status_idx on public.tip_broadcasts(status);
create index if not exists tip_broadcasts_period_idx on public.tip_broadcasts(period);
create index if not exists tip_broadcast_recipients_broadcast_idx on public.tip_broadcast_recipients(broadcast_id);
create index if not exists tip_broadcast_recipients_mother_idx on public.tip_broadcast_recipients(pregnant_mother_id);
create index if not exists pregnant_mother_indicators_mother_idx on public.pregnant_mother_indicators(pregnant_mother_id);
create index if not exists pregnant_mother_indicators_indicator_idx on public.pregnant_mother_indicators(indicator_id);
create index if not exists prenatal_schedule_recipients_schedule_idx on public.prenatal_schedule_recipients(schedule_id);
create index if not exists prenatal_schedule_recipients_mother_idx on public.prenatal_schedule_recipients(pregnant_mother_id);
-- Enable RLS on new tables
alter table public.risk_indicators enable row level security;
alter table public.monthly_tips enable row level security;
alter table public.tip_broadcasts enable row level security;
alter table public.tip_broadcast_recipients enable row level security;
alter table public.pregnant_mother_indicators enable row level security;
alter table public.prenatal_schedule_recipients enable row level security;
-- RLS policies for risk_indicators
create policy "staff can read risk indicators"
  on public.risk_indicators for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'nurse', 'bhw_head', 'bhw_purok')));

create policy "admin and nurse can manage risk indicators"
  on public.risk_indicators for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'nurse')))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'nurse')));
-- RLS policies for monthly_tips
create policy "staff can read monthly tips"
  on public.monthly_tips for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'nurse', 'bhw_head', 'bhw_purok')));

create policy "nurse can manage monthly tips"
  on public.monthly_tips for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'nurse'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'nurse'));
-- RLS policies for tip_broadcasts
create policy "staff can read tip broadcasts"
  on public.tip_broadcasts for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'nurse', 'bhw_head', 'bhw_purok')));

create policy "nurse can manage tip broadcasts"
  on public.tip_broadcasts for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'nurse'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'nurse'));
-- RLS policies for tip_broadcast_recipients
create policy "staff can read tip broadcast recipients"
  on public.tip_broadcast_recipients for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'nurse', 'bhw_head', 'bhw_purok')));

create policy "nurse can manage tip broadcast recipients"
  on public.tip_broadcast_recipients for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'nurse'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'nurse'));
-- RLS policies for pregnant_mother_indicators
create policy "staff can read pregnant mother indicators"
  on public.pregnant_mother_indicators for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'nurse', 'bhw_head', 'bhw_purok')));

create policy "care staff can manage pregnant mother indicators"
  on public.pregnant_mother_indicators for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'nurse', 'bhw_head', 'bhw_purok')))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'nurse', 'bhw_head', 'bhw_purok')));
-- RLS policies for prenatal_schedule_recipients
create policy "staff can read prenatal schedule recipients"
  on public.prenatal_schedule_recipients for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'nurse', 'bhw_head', 'bhw_purok')));

create policy "care staff can manage prenatal schedule recipients"
  on public.prenatal_schedule_recipients for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'nurse', 'bhw_head', 'bhw_purok')))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'nurse', 'bhw_head', 'bhw_purok')));
-- Add updated_at trigger for monthly_tips
create or replace function public.handle_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists handle_monthly_tips_updated_at on public.monthly_tips;
create trigger handle_monthly_tips_updated_at
before update on public.monthly_tips
for each row execute function public.handle_updated_at();

drop trigger if exists handle_tip_broadcasts_updated_at on public.tip_broadcasts;
create trigger handle_tip_broadcasts_updated_at
before update on public.tip_broadcasts
for each row execute function public.handle_updated_at();
-- Insert sample monthly tips if they don't exist
insert into public.monthly_tips (month, risk_level, title, content)
values
  (1, 'low', 'Month 1: Early Pregnancy Care', 'Congratulations on your pregnancy! Start taking folic acid supplements and schedule your first prenatal checkup. Eat small, frequent meals to manage morning sickness.'),
  (1, 'high', 'Month 1: High-Risk Care', 'Your pregnancy requires special attention. Please attend all scheduled checkups and take prescribed medications regularly. Contact your healthcare provider immediately if you experience severe symptoms.'),
  (2, 'low', 'Month 2: Continued Nutrition', 'Continue taking prenatal vitamins. Include iron-rich foods like spinach and lean meats in your diet. Stay hydrated and get plenty of rest.'),
  (2, 'high', 'Month 2: Monitor Your Health', 'Regular monitoring is crucial. Keep track of your blood pressure and any unusual symptoms. Your healthcare team will provide specific dietary recommendations.'),
  (3, 'low', 'Month 3: First Trimester Complete', 'You are completing your first trimester! This is a good time to discuss birth plans with your healthcare provider. Continue healthy eating and gentle exercise.'),
  (3, 'high', 'Month 3: Special Care Required', 'Regular monitoring continues to be important. Discuss any concerns with your healthcare provider. Follow all medical recommendations strictly.'),
  (4, 'low', 'Month 4: Second Trimester Begins', 'Welcome to the second trimester! You may feel more energetic. Focus on calcium-rich foods for your baby''s developing bones. Consider prenatal classes.'),
  (4, 'high', 'Month 4: Increased Monitoring', 'Your condition requires continued close monitoring. Attend all scheduled appointments and follow dietary guidelines provided by your healthcare team.'),
  (5, 'low', 'Month 5: Baby Growing Strong', 'Your baby is growing rapidly! Include protein-rich foods in your diet. You may start feeling your baby''s movements - this is called quickening.'),
  (5, 'high', 'Month 5: Watch for Warning Signs', 'Be alert to any warning signs. Report decreased fetal movement, swelling, or headaches immediately. Your healthcare team will provide specific monitoring instructions.'),
  (6, 'low', 'Month 6: Halfway There', 'You are halfway through your pregnancy! Focus on balanced nutrition with fruits, vegetables, whole grains, and lean proteins. Stay active with pregnancy-safe exercises.'),
  (6, 'high', 'Month 6: Preparation for Delivery', 'Begin preparing for delivery planning with your healthcare team. Discuss any concerns about your condition and birth options. Continue all recommended monitoring.'),
  (7, 'low', 'Month 7: Third Trimester Begins', 'Welcome to the final trimester! Rest frequently and sleep on your left side. Prepare your hospital bag and discuss birth preferences with your partner.'),
  (7, 'high', 'Month 7: Intensive Monitoring', 'Monitoring will become more frequent. Prepare for possible early delivery. Discuss birth plans thoroughly with your healthcare team considering your condition.'),
  (8, 'low', 'Month 8: Getting Ready', 'Your baby is almost ready! Finalize your birth plan and hospital preparations. Practice breathing exercises and attend prenatal classes if you haven''t already.'),
  (8, 'high', 'Month 8: Final Preparations', 'Ensure all delivery preparations are complete. Your healthcare team will provide specific instructions for your delivery. Keep emergency contacts readily available.'),
  (9, 'low', 'Month 9: Almost There', 'Your baby could arrive any day now! Rest as much as possible and stay close to home. Know the signs of labor and when to go to the hospital.'),
  (9, 'high', 'Month 9: Ready for Delivery', 'Your delivery plan is in place. Be prepared for immediate medical attention during and after delivery. Your healthcare team will provide specific instructions for your final weeks.')
on conflict (month, risk_level) do nothing;
