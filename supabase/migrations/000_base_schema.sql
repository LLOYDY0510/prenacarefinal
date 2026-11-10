-- Create core tables for an empty Supabase project.
create table if not exists public.pregnant_mothers (
  id uuid primary key default gen_random_uuid(),
  serial_no text unique,
  date_registered date,
  first_name text not null,
  middle_name text,
  last_name text not null,
  full_name text not null,
  address text,
  purok text,
  age integer,
  contact_number text,
  lmp date,
  gravida_para text,
  edd date,
  blood_pressure text,
  height_cm numeric,
  weight_kg numeric,
  latitude double precision,
  longitude double precision,
  risk_level text check (risk_level in ('low', 'high')),
  registered_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  role text not null default 'pending' check (role in ('pending', 'admin', 'nurse', 'bhw_head', 'bhw_purok', 'pregnant_mother')),
  purok text,
  pregnant_mother_id uuid references public.pregnant_mothers(id) on delete set null,
  created_at timestamptz not null default now()
);
create table if not exists public.prenatal_checkups (
  id uuid primary key default gen_random_uuid(),
  pregnant_mother_id uuid not null references public.pregnant_mothers(id) on delete cascade,
  trimester text not null check (trimester in ('1st', '2nd', '3rd')),
  checkup_date date not null,
  blood_pressure text,
  weight_kg numeric,
  notes text,
  recorded_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create table if not exists public.prenatal_schedules (
  id uuid primary key default gen_random_uuid(),
  visit_date date not null,
  reminder_sent boolean not null default false,
  reminder_sent_at timestamptz,
  set_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create table if not exists public.prenatal_schedule_recipients (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references public.prenatal_schedules(id) on delete cascade,
  pregnant_mother_id uuid not null references public.pregnant_mothers(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (schedule_id, pregnant_mother_id)
);
create table if not exists public.prenatal_schedule_reminders (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references public.prenatal_schedules(id) on delete cascade,
  pregnant_mother_id uuid not null references public.pregnant_mothers(id) on delete cascade,
  message text not null,
  sent_at timestamptz not null default now()
);
create table if not exists public.sms_logs (
  id uuid primary key default gen_random_uuid(),
  recipient_count integer not null,
  recipient_numbers text[],
  recipient_mother_ids uuid[],
  message text not null,
  status text not null,
  delivery_status text not null default 'unknown',
  message_type text not null default 'general',
  provider_message_id text,
  delivered_at timestamptz,
  error_message text,
  sent_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
