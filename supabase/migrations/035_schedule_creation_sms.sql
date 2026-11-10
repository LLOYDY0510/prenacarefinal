-- Schedule creation confirmations: link SMS intents to schedules and recover saves by request UUID.
alter table public.maternal_sms_events
  add column schedule_id uuid references public.prenatal_schedules(id) on delete set null;
create index maternal_sms_events_schedule on public.maternal_sms_events(schedule_id);

-- Retried saves share a request key and cannot create duplicate schedules.
create table public.schedule_creation_requests (
  id uuid primary key, actor_id uuid not null,
  schedule_id uuid not null references public.prenatal_schedules(id) on delete cascade,
  fingerprint text not null, created_at timestamptz not null default now()
);
alter table public.schedule_creation_requests enable row level security;
revoke all on public.schedule_creation_requests from public,anon,authenticated;
grant all on public.schedule_creation_requests to service_role;
create index schedule_creation_schedule_idx on public.schedule_creation_requests(schedule_id);

create function public.schedule_confirmation_text(visit_day date,trimester_value text,visit_value integer)
returns text language sql immutable set search_path=public as $$
  select 'Nakatakda po ang inyong prenatal checkup sa '||visit_day::text
    ||' sa Barangay Health Center ('||trimester_value||' Trimester, '
    ||case visit_value when 1 then '1st Visit' when 2 then '2nd Visit' else '3rd Visit' end
    ||'). Mangyaring pumunta sa nakatakdang araw. Salamat!';
$$;
revoke all on function public.schedule_confirmation_text(date,text,integer) from public,anon,authenticated;
grant execute on function public.schedule_confirmation_text(date,text,integer) to service_role;

-- Saves through the retained entry point, then queues one confirmation intent per assigned mother.
create function public.save_schedule_with_confirmation(
  request_uuid uuid,visit_day date,trimester_value text,visit_value integer,
  recipient_ids uuid[],notes_value text,actor_uuid uuid
) returns uuid language plpgsql security definer set search_path=public as $$
declare target uuid; prior public.schedule_creation_requests; fingerprint_value text; recipients uuid[];
begin
  if request_uuid is null then raise exception 'A schedule request identity is required'; end if;
  select array_agg(distinct id order by id) into recipients from unnest(recipient_ids) id;
  fingerprint_value:=md5(coalesce(visit_day::text,'')||'|'||coalesce(trimester_value,'')||'|'
    ||coalesce(visit_value::text,'')||'|'||coalesce(recipients::text,'')||'|'||coalesce(notes_value,''));
  perform pg_advisory_xact_lock(hashtextextended(request_uuid::text,0));
  select * into prior from public.schedule_creation_requests where id=request_uuid;
  if found then
    if prior.fingerprint<>fingerprint_value then
      raise exception 'This request was already saved with different details. Reload the schedules before saving again.';
    end if;
    return prior.schedule_id;
  end if;
  target:=public.save_prenatal_schedule_visit(null,visit_day,trimester_value,visit_value,recipient_ids,notes_value,actor_uuid,'scheduled');
  insert into public.schedule_creation_requests(id,actor_id,schedule_id,fingerprint)
  values(request_uuid,actor_uuid,target,fingerprint_value);
  insert into public.maternal_sms_events(event_key,pregnant_mother_id,schedule_id,message,message_type,created_by)
  select 'schedule-created:'||target,id,target,
    public.schedule_confirmation_text(visit_day,trimester_value,visit_value),'care_message',actor_uuid
  from unnest(recipients) id
  on conflict(event_key,pregnant_mother_id) do nothing;
  return target;
end;
$$;
revoke all on function public.save_schedule_with_confirmation(uuid,date,text,integer,uuid[],text,uuid) from public,anon,authenticated;
grant execute on function public.save_schedule_with_confirmation(uuid,date,text,integer,uuid[],text,uuid) to service_role;
notify pgrst,'reload schema';
