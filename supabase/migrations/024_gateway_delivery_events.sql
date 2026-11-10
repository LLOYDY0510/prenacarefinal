-- Persist authenticated delivery events once, including multipart evidence.
create table public.sms_gateway_events (
  event_id text primary key, device_id text not null, message_id text not null,
  recipient text not null, event_type text not null, parts_count integer,
  received_at timestamptz not null default now()
);
alter table public.sms_gateway_events enable row level security;
revoke all on public.sms_gateway_events from anon,authenticated;
grant all on public.sms_gateway_events to service_role;
create index sms_gateway_events_message_idx on public.sms_gateway_events(device_id,message_id,recipient);
alter table public.sms_logs add column provider_response jsonb;

create or replace function public.record_gateway_event(event_key text,device text,message text,phone text,kind text,parts integer default null)
returns boolean language plpgsql security definer set search_path=public as $$
declare inserted text; expected integer; delivered integer; next_state text; log_uuid uuid;
begin
  if kind not in ('sms:sent','sms:delivered','sms:failed') or length(event_key)>128
    or (parts is not null and (parts<1 or parts>100)) then raise exception 'Invalid gateway event'; end if;
  perform pg_advisory_xact_lock(hashtextextended(device || message || phone,0));
  if not exists(select 1 from public.sms_recipient_receipts where provider='android_sms_gateway'
    and device_id=device and provider_message_id=message and contact_number=phone) then return false; end if;
  insert into public.sms_gateway_events(event_id,device_id,message_id,recipient,event_type,parts_count)
  values(event_key,device,message,phone,kind,parts) on conflict do nothing returning event_id into inserted;
  if inserted is null then return true; end if;
  select max(parts_count) filter(where event_type='sms:sent'),count(*) filter(where event_type='sms:delivered')
    into expected,delivered from public.sms_gateway_events where device_id=device and message_id=message and recipient=phone;
  next_state:=case when expected is not null and delivered>=expected then 'delivered'
    when exists(select 1 from public.sms_gateway_events where device_id=device and message_id=message and recipient=phone and event_type='sms:failed') then 'failed'
    when expected is not null then 'sent' else 'queued' end;
  update public.sms_recipient_receipts set provider_status=next_state where provider='android_sms_gateway'
    and device_id=device and provider_message_id=message and contact_number=phone and provider_status<>'delivered';
  for log_uuid in select distinct sms_log_id from public.sms_recipient_receipts where provider='android_sms_gateway'
    and device_id=device and provider_message_id=message and contact_number=phone loop
    update public.sms_logs set delivery_status=case
      when not exists(select 1 from public.sms_recipient_receipts r where r.sms_log_id=log_uuid and r.provider_status<>'delivered') then 'delivered'
      when exists(select 1 from public.sms_recipient_receipts r where r.sms_log_id=log_uuid and r.provider_status='failed') then 'failed'
      when exists(select 1 from public.sms_recipient_receipts r where r.sms_log_id=log_uuid and r.provider_status in ('queued','pending')) then 'queued'
      else 'sent' end where id=log_uuid and delivery_status<>'delivered';
  end loop;
  return true;
end;
$$;
revoke all on function public.record_gateway_event(text,text,text,text,text,integer) from public,anon,authenticated;
grant execute on function public.record_gateway_event(text,text,text,text,text,integer) to service_role;
notify pgrst,'reload schema';
