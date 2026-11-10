create table public.sms_gateway_settings (
  id smallint primary key check(id=1),
  settings_ciphertext text not null,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.sms_gateway_settings enable row level security;
revoke all on public.sms_gateway_settings from public,anon,authenticated;
grant select,insert,update,delete on public.sms_gateway_settings to service_role;
