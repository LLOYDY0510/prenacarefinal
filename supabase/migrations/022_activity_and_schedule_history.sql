-- Retain actor and schedule snapshots independently of live accounts and rows.
create table public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(), actor_id uuid,
  actor_name text not null default 'System', actor_role text,
  action text not null, description text not null, target_type text, target_id text,
  outcome text not null default 'success', ip_address inet, browser text,
  user_agent text, request_id uuid
);
create index activity_logs_date_idx on public.activity_logs(occurred_at desc,id);
create index activity_logs_actor_idx on public.activity_logs(actor_id,occurred_at desc);
alter table public.activity_logs enable row level security;
create policy activity_admin_read on public.activity_logs for select to authenticated using(public.is_admin());
revoke all on public.activity_logs from anon,authenticated;
grant select on public.activity_logs to authenticated;
grant all on public.activity_logs to service_role;

create table public.schedule_events (
  id uuid primary key default gen_random_uuid(), schedule_id uuid not null,
  pregnant_mother_id uuid, patient_name text not null, purok text,
  visit_date date not null, notes text, status text not null, action text not null,
  occurred_at timestamptz not null default now(), created_at timestamptz not null,
  actor_id uuid
);
create index schedule_events_schedule_idx on public.schedule_events(schedule_id,occurred_at desc);
create index schedule_events_mother_idx on public.schedule_events(pregnant_mother_id,occurred_at desc);
alter table public.schedule_events enable row level security;
create policy schedule_events_read on public.schedule_events for select to authenticated using(
  public.current_user_role()='nurse' or (public.current_user_role()='bhw' and exists(
    select 1 from public.profiles p where p.id=(select auth.uid())
    and (p.access_all_zones or (p.purok is not null and p.purok=schedule_events.purok))))
  or(public.current_user_role()='patient' and pregnant_mother_id=public.current_mother_id()));
revoke all on public.schedule_events from anon,authenticated;
grant select on public.schedule_events to authenticated;
grant all on public.schedule_events to service_role;

create or replace function public.capture_activity() returns trigger
language plpgsql security definer set search_path=public as $$
declare row_data jsonb; identity_row public.profiles; target text; actor uuid; client_headers jsonb; agent text; browser_name text;
begin
  if tg_op='DELETE' then row_data:=to_jsonb(old); else row_data:=to_jsonb(new); end if;
  client_headers:=coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb;
  actor:=auth.uid();
  if auth.role()='service_role' and (client_headers->>'x-prenatrack-actor') ~ '^[0-9a-f-]{36}$' then actor:=(client_headers->>'x-prenatrack-actor')::uuid; end if;
  agent:=left(client_headers->>'user-agent',512);
  browser_name:=case when agent like '%Edg/%' then 'Edge' when agent like '%Firefox/%' then 'Firefox' when agent like '%Chrome/%' then 'Chrome' when agent like '%Safari/%' then 'Safari' when agent is null then 'Unknown' else 'Other' end;
  select * into identity_row from public.profiles where id=actor;
  target:=coalesce(row_data->>'id',row_data->>'dedupe_key');
  insert into public.activity_logs(actor_id,actor_name,actor_role,action,description,target_type,target_id,user_agent,browser)
  values(actor,coalesce(identity_row.full_name,'System'),identity_row.role,lower(tg_op),
    initcap(lower(tg_op)) || ' ' || replace(tg_table_name,'_',' '),tg_table_name,target,agent,browser_name);
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function public.capture_activity() from public,anon,authenticated;

do $$
declare item text;
begin
  foreach item in array array['profiles','pregnant_mothers','prenatal_checkups','prenatal_schedules',
    'maternal_health_history','maternal_referrals','risk_indicators','monthly_tips',
    'tip_broadcasts','sms_logs'] loop
    execute format('create trigger capture_activity after insert or update or delete on public.%I for each row execute function public.capture_activity()',item);
  end loop;
end;
$$;

create or replace function public.capture_schedule_event() returns trigger
language plpgsql security definer set search_path=public as $$
declare schedule_row public.prenatal_schedules; mother_row record; entry record;
begin
  if tg_table_name='prenatal_schedule_recipients' then
    if tg_op='DELETE' then entry:=old; else entry:=new; end if;
    select * into schedule_row from public.prenatal_schedules where id=entry.schedule_id;
    if not found then return null; end if;
    select full_name,purok into mother_row from public.pregnant_mothers where id=entry.pregnant_mother_id;
    insert into public.schedule_events(schedule_id,pregnant_mother_id,patient_name,purok,visit_date,notes,status,action,created_at,actor_id)
    values(schedule_row.id,entry.pregnant_mother_id,coalesce(mother_row.full_name,'Deleted patient'),mother_row.purok,
      schedule_row.visit_date,schedule_row.notes,case when tg_op='DELETE' then 'removed' else schedule_row.status end,
      case when tg_op='DELETE' then 'recipient_removed' else 'created' end,schedule_row.created_at,coalesce(auth.uid(),schedule_row.set_by));
  else
    if tg_op='DELETE' then schedule_row:=old; else schedule_row:=new; end if;
    for mother_row in select m.id,m.full_name,m.purok from public.prenatal_schedule_recipients r
      join public.pregnant_mothers m on m.id=r.pregnant_mother_id where r.schedule_id=schedule_row.id loop
      insert into public.schedule_events(schedule_id,pregnant_mother_id,patient_name,purok,visit_date,notes,status,action,created_at,actor_id)
      values(schedule_row.id,mother_row.id,mother_row.full_name,mother_row.purok,schedule_row.visit_date,schedule_row.notes,
        case when tg_op='DELETE' then 'deleted' else schedule_row.status end,lower(tg_op),schedule_row.created_at,coalesce(auth.uid(),schedule_row.set_by));
    end loop;
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function public.capture_schedule_event() from public,anon,authenticated;
create trigger capture_schedule_event before delete or update of visit_date,trimester,status,notes on public.prenatal_schedules
for each row execute function public.capture_schedule_event();
create trigger capture_schedule_recipient after insert or delete on public.prenatal_schedule_recipients
for each row execute function public.capture_schedule_event();
insert into public.schedule_events(schedule_id,pregnant_mother_id,patient_name,purok,visit_date,notes,status,action,created_at,actor_id)
select s.id,m.id,m.full_name,m.purok,s.visit_date,s.notes,s.status,'baseline',s.created_at,s.set_by
from public.prenatal_schedules s join public.prenatal_schedule_recipients r on r.schedule_id=s.id
join public.pregnant_mothers m on m.id=r.pregnant_mother_id;
notify pgrst,'reload schema';

-- Expose the latest snapshot while keeping all events behind the same row policies.
create view public.schedule_log_latest with(security_invoker=true) as
select distinct on(schedule_id,pregnant_mother_id) * from public.schedule_events
order by schedule_id,pregnant_mother_id,occurred_at desc,id desc;
revoke all on public.schedule_log_latest from anon;
grant select on public.schedule_log_latest to authenticated,service_role;
