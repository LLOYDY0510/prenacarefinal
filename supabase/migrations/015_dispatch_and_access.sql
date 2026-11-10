-- Reserve dispatches before contacting the provider.
create table public.sms_dispatch_claims (
  dedupe_key text primary key,
  state text not null default 'reserved' check (state in ('reserved', 'accepted', 'failed', 'unknown')),
  attempted_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.sms_dispatch_claims enable row level security;
-- Preserve successful legacy sends when upgrading the dispatch identity.
insert into public.sms_dispatch_claims(dedupe_key,state)
select distinct r.send_kind || ':' || r.schedule_id::text || ':' || r.pregnant_mother_id::text || ':' ||
  coalesce(l.message_type,'general') || ':' || s.visit_date::text ||
  case when r.send_kind = 'manual' then ':' || (r.sent_at at time zone 'Asia/Manila')::date::text else '' end,
  'accepted'
from public.sms_recipient_receipts r join public.sms_logs l on l.id = r.sms_log_id
join public.prenatal_schedules s on s.id = r.schedule_id
where r.pregnant_mother_id is not null and r.provider_status in ('pending','queued','sent','delivered')
on conflict(dedupe_key) do nothing;

create or replace function public.claim_sms_dispatch(dispatch_key text)
returns boolean language plpgsql security definer set search_path = public as $$
declare claimed text;
begin
  insert into public.sms_dispatch_claims(dedupe_key) values (dispatch_key)
  on conflict (dedupe_key) do update set state = 'reserved', attempted_at = now(), updated_at = now()
  where sms_dispatch_claims.state = 'failed'
  returning dedupe_key into claimed;
  return claimed is not null;
end;
$$;
create or replace function public.finish_sms_dispatch(dispatch_key text, dispatch_state text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if dispatch_state not in ('accepted', 'failed', 'unknown') then raise exception 'Invalid dispatch state'; end if;
  update public.sms_dispatch_claims set state = dispatch_state, updated_at = now()
  where dedupe_key = dispatch_key and state = 'reserved';
end;
$$;
revoke all on function public.claim_sms_dispatch(text) from public, authenticated, anon;
revoke all on function public.finish_sms_dispatch(text,text) from public, authenticated, anon;
grant execute on function public.claim_sms_dispatch(text) to service_role;
grant execute on function public.finish_sms_dispatch(text,text) to service_role;
-- Enforce one account per maternal record without silently removing existing links.
create unique index profiles_unique_mother on public.profiles(pregnant_mother_id)
where pregnant_mother_id is not null;
grant execute on function public.sms_receipt_visible_to(uuid,uuid) to authenticated;
-- Keep the legacy RPC subject to the current notification access rules.
create or replace function public.mark_notification_read(notification_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  update public.maternal_notifications set read_at = now()
  where id = notification_id
    and public.can_access_notification(recipient_user_id, recipient_role, pregnant_mother_id);
  return found;
end;
$$;
revoke all on function public.mark_notification_read(uuid) from public, anon;
grant execute on function public.mark_notification_read(uuid) to authenticated;
-- Allow mothers to read only sent broadcasts addressed to them.
create policy broadcasts_read_recipient on public.tip_broadcasts for select to authenticated
using (status = 'sent' and exists (
  select 1 from public.tip_broadcast_recipients r
  where r.broadcast_id = tip_broadcasts.id and r.pregnant_mother_id = public.current_mother_id()
));
-- Restrict browser notification updates to read state.
revoke update on public.maternal_notifications from authenticated;
grant update (read_at) on public.maternal_notifications to authenticated;
-- Allocate registration serials atomically, independent of RLS-visible counts.
create sequence public.maternal_serial_sequence;
select setval('public.maternal_serial_sequence', greatest(1, coalesce(maximum,0)), coalesce(maximum,0) > 0)
from (select max(substring(serial_no from '[0-9]+$')::bigint) as maximum
  from public.pregnant_mothers where serial_no ~ '^SPM-[0-9]{4}-[0-9]+$') existing;
create or replace function public.assign_maternal_serial()
returns trigger language plpgsql security definer set search_path = public as $$
declare serial_value text;
begin
  serial_value := nextval('public.maternal_serial_sequence')::text;
  new.serial_no = 'SPM-' || extract(year from coalesce(new.date_registered,current_date))::text || '-' ||
    lpad(serial_value, greatest(4,length(serial_value)), '0');
  return new;
end;
$$;
create trigger assign_maternal_serial before insert on public.pregnant_mothers
for each row execute function public.assign_maternal_serial();
-- Create a pending profile when Supabase provisions an account.
create or replace function public.provision_profile()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles(id,email,full_name,role)
  values(new.id,new.email,new.raw_user_meta_data->>'full_name','pending') on conflict(id) do nothing;
  return new;
end;
$$;
create trigger provision_profile after insert on auth.users for each row execute function public.provision_profile();
revoke all on function public.provision_profile() from public;
revoke all on function public.assign_maternal_serial() from public;
notify pgrst, 'reload schema';
