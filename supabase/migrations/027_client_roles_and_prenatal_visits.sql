-- Measurements remain unknown on existing records.
alter table public.pregnant_mothers add column waist_cm numeric check(waist_cm>0 and waist_cm<'Infinity'::numeric);
alter table public.prenatal_schedules add column visit_number smallint check(visit_number between 1 and 3);
alter table public.schedule_events add column visit_number smallint check(visit_number between 1 and 3);
alter table public.prenatal_checkups add column schedule_id uuid;
alter table public.prenatal_checkups add column visit_number smallint check(visit_number between 1 and 3);
alter table public.prenatal_checkups add constraint checkup_schedule_assignment_fk
  foreign key(schedule_id,pregnant_mother_id) references public.prenatal_schedule_recipients(schedule_id,pregnant_mother_id);
create unique index checkup_schedule_mother_idx on public.prenatal_checkups(schedule_id,pregnant_mother_id);

-- Recipient slots enforce uniqueness even across concurrent grouped schedules.
alter table public.prenatal_schedule_recipients add column trimester text;
alter table public.prenatal_schedule_recipients add column visit_number smallint;
alter table public.prenatal_schedule_recipients add column assignment_active boolean not null default true;
update public.prenatal_schedule_recipients r set trimester=s.trimester,assignment_active=s.status<>'cancelled'
from public.prenatal_schedules s where s.id=r.schedule_id;
create unique index prenatal_numbered_slot_idx on public.prenatal_schedule_recipients(pregnant_mother_id,trimester,visit_number)
where assignment_active and visit_number is not null;
create function public.sync_visit_assignment() returns trigger language plpgsql security definer set search_path=public as $$
declare schedule public.prenatal_schedules;
begin
  select * into strict schedule from public.prenatal_schedules where id=new.schedule_id;
  new.trimester:=schedule.trimester;new.visit_number:=schedule.visit_number;new.assignment_active:=schedule.status<>'cancelled';
  return new;
end;$$;
revoke all on function public.sync_visit_assignment() from public,anon,authenticated;
create trigger sync_visit_assignment before insert or update on public.prenatal_schedule_recipients for each row execute function public.sync_visit_assignment();
create function public.sync_schedule_visits() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if tg_op='DELETE' then
    if exists(select 1 from public.prenatal_checkups where schedule_id=old.id) then raise exception 'This schedule has attendance records. Cancel it to retain the history.';end if;
    return old;
  end if;
  if tg_when='BEFORE' then
    if (new.visit_date,new.trimester,new.visit_number) is distinct from (old.visit_date,old.trimester,old.visit_number)
      and exists(select 1 from public.prenatal_checkups where schedule_id=old.id) then
      raise exception 'A recorded visit cannot be reassigned or rescheduled. Cancel it and create a replacement if needed.';
    end if;
  else
    update public.prenatal_schedule_recipients set trimester=new.trimester,visit_number=new.visit_number,assignment_active=new.status<>'cancelled' where schedule_id=new.id;
  end if;
  return new;
end;$$;
revoke all on function public.sync_schedule_visits() from public,anon,authenticated;
create trigger protect_recorded_delete before delete on public.prenatal_schedules for each row execute function public.sync_schedule_visits();
create trigger protect_recorded_visit before update on public.prenatal_schedules for each row execute function public.sync_schedule_visits();
create trigger sync_schedule_visits after update of trimester,visit_number,status on public.prenatal_schedules for each row execute function public.sync_schedule_visits();

create function public.validate_checkup_visit() returns trigger language plpgsql security definer set search_path=public as $$
declare schedule public.prenatal_schedules;
begin
  if new.schedule_id is null then
    if auth.role()='authenticated' and (tg_op='INSERT' or old.schedule_id is not null) then
      raise exception 'Select the scheduled visit for this attendance record.';
    end if;
    return new;
  end if;
  if tg_op='UPDATE' and old.schedule_id is not null and (new.schedule_id,new.pregnant_mother_id) is distinct from (old.schedule_id,old.pregnant_mother_id) then
    raise exception 'Recorded attendance cannot be moved to a different visit.';
  end if;
  select * into strict schedule from public.prenatal_schedules where id=new.schedule_id for share;
  if tg_op='INSERT' and schedule.status='cancelled' then raise exception 'This visit is cancelled.';end if;
  if not exists(select 1 from public.prenatal_schedule_recipients where schedule_id=schedule.id and pregnant_mother_id=new.pregnant_mother_id) then
    raise exception 'This patient is not assigned to the selected visit.';
  end if;
  new.trimester:=schedule.trimester;new.visit_number:=schedule.visit_number;
  new.scheduled_checkup_date:=schedule.visit_date;new.scheduled_for:=schedule.visit_date;
  return new;
end;$$;
revoke all on function public.validate_checkup_visit() from public,anon,authenticated;
create trigger validate_checkup_visit before insert or update on public.prenatal_checkups for each row execute function public.validate_checkup_visit();

create function public.save_prenatal_schedule_visit(
 schedule_uuid uuid,visit_day date,trimester_value text,visit_value integer,recipient_ids uuid[],notes_value text,
 actor_uuid uuid,status_value text default 'scheduled'
) returns uuid language plpgsql security definer set search_path=public as $$
declare target uuid;previous public.prenatal_schedules;previous_ids uuid[];
begin
  if not exists(select 1 from public.profiles where id=actor_uuid and account_status='active' and role in('admin','nurse')) then
    raise exception 'Only active midwife/admin or nurse accounts may manage schedules' using errcode='42501';end if;
  if visit_day is null or trimester_value is null or trimester_value not in('1st','2nd','3rd') or visit_value is null or visit_value not between 1 and 3
    or status_value is null or status_value not in('scheduled','completed','missed','cancelled') or coalesce(cardinality(recipient_ids),0)=0 then raise exception 'Select a trimester, visit (1–3), date and patients.';end if;
  if (select count(distinct id) from public.pregnant_mothers where id=any(recipient_ids))<>(select count(distinct id) from unnest(recipient_ids) id) then raise exception 'Unknown patient';end if;
  if schedule_uuid is null then
    insert into public.prenatal_schedules(visit_date,trimester,visit_number,notes,set_by,status)
    values(visit_day,trimester_value,visit_value,notes_value,actor_uuid,status_value) returning id into target;
  else
    select * into strict previous from public.prenatal_schedules where id=schedule_uuid for update;
    target:=schedule_uuid;
    select array_agg(pregnant_mother_id order by pregnant_mother_id) into previous_ids from public.prenatal_schedule_recipients where schedule_id=target;
    delete from public.prenatal_schedule_recipients where schedule_id=target and not pregnant_mother_id=any(recipient_ids);
    update public.prenatal_schedules set visit_date=visit_day,trimester=trimester_value,visit_number=visit_value,notes=notes_value,status=status_value where id=target;
    if (previous.visit_date,previous.trimester,previous.visit_number) is distinct from (visit_day,trimester_value,visit_value)
      or previous_ids is distinct from (select array_agg(distinct id order by id) from unnest(recipient_ids) id) then
      perform public.invalidate_schedule_reminders(target);
    end if;
  end if;
  insert into public.prenatal_schedule_recipients(schedule_id,pregnant_mother_id) select target,id from unnest(recipient_ids) id on conflict(schedule_id,pregnant_mother_id) do nothing;
  return target;
exception when unique_violation then raise exception 'A selected patient already has this numbered visit in that trimester. Edit or cancel that assignment first.';
end;$$;
revoke all on function public.save_prenatal_schedule_visit(uuid,date,text,integer,uuid[],text,uuid,text) from public,anon,authenticated;
grant execute on function public.save_prenatal_schedule_visit(uuid,date,text,integer,uuid[],text,uuid,text) to service_role;

-- Checkup recording is a BHW responsibility; history/referral records are retained.
create or replace function public.can_record_care(mother_id uuid) returns boolean language sql stable security definer set search_path=public as $$
 select public.can_manage_mother(mother_id);
$$;
do $$
declare relation text; prefix text;
begin
  foreach relation in array array['maternal_health_history','maternal_referrals'] loop
    prefix:=case when relation='maternal_health_history' then 'history_write' else 'referrals_write' end;
    execute format('alter policy %I on public.%I with check(public.current_user_role()=''nurse'')',prefix||'_insert',relation);
    execute format('alter policy %I on public.%I using(public.current_user_role()=''nurse'') with check(public.current_user_role()=''nurse'')',prefix||'_update',relation);
    execute format('alter policy %I on public.%I using(public.current_user_role()=''nurse'')',prefix||'_delete',relation);
  end loop;
end;$$;
alter policy schedule_events_read on public.schedule_events using(
 public.current_user_role() in('admin','nurse') or (public.current_user_role()='bhw' and exists(select 1 from public.profiles p where p.id=auth.uid() and(p.access_all_zones or(p.purok is not null and p.purok=schedule_events.purok))))
 or(public.current_user_role()='patient' and pregnant_mother_id=public.current_mother_id()));
alter policy sms_logs_read on public.sms_logs using(public.current_user_role()='nurse' or
 (public.current_user_role()='bhw' and(sent_by=auth.uid() or exists(select 1 from public.profiles p where p.id=auth.uid() and p.access_all_zones))));
notify pgrst,'reload schema';

create or replace function public.register_mother(request_uuid uuid,mother_data jsonb,indicator_ids uuid[] default '{}')
returns public.pregnant_mothers language plpgsql security invoker set search_path=public as $$
declare p public.profiles; saved public.pregnant_mothers; ids uuid[]; fingerprint_value text; prior public.maternal_registration_requests;
  zone text; age_value integer; gravida integer; para integer;
begin
  select * into p from public.profiles where id=auth.uid();
  if public.current_user_role() is distinct from 'bhw' or p.account_status is distinct from 'active' then
    raise exception 'An active BHW account is required' using errcode='42501';
  end if;
  zone:=regexp_replace(trim(coalesce(mother_data->>'purok','')),'^(Zone|Purok)\s*','', 'i');
  if zone !~ '^[1-8]$' then raise exception 'Choose a valid zone (1–8)'; end if;
  if not p.access_all_zones and (p.purok is null or p.purok<>zone) then
    raise exception 'Choose your assigned zone. Contact an administrator if your assignment is missing or incorrect.' using errcode='42501';
  end if;
  if nullif(trim(mother_data->>'first_name'),'') is null or nullif(trim(mother_data->>'last_name'),'') is null then
    raise exception 'First and last name are required';
  end if;
  if nullif(mother_data->>'waist_cm','') is not null and (mother_data->>'waist_cm')::numeric<=0 then raise exception 'Waist Line must be greater than zero';end if;
  age_value:=nullif(mother_data->>'age','')::integer;
  gravida:=nullif(mother_data->>'gravida','')::integer;para:=nullif(mother_data->>'para','')::integer;
  if age_value is not null and age_value not between 10 and 55 then raise exception 'Age must be between 10 and 55'; end if;
  if gravida<0 or para<0 or para>gravida then raise exception 'Invalid gravida and para'; end if;
  if exists(select 1 from unnest(indicator_ids) i where not exists(
    select 1 from public.risk_indicators r where r.id=i and r.active and r.indicator_type='checklist')) then
    raise exception 'Selected risk indicators have changed. Reload and review the form.';
  end if;
  select coalesce(array_agg(distinct r.id order by r.id),'{}') into ids from public.risk_indicators r where r.active and
    (r.id=any(indicator_ids) or (r.indicator_type='age_below' and age_value<r.threshold_value)
    or(r.indicator_type='first_pregnancy_age_above' and gravida=1 and age_value>=r.threshold_value));
  fingerprint_value:=md5(mother_data::text||ids::text);
  perform pg_advisory_xact_lock(hashtextextended(request_uuid::text,0));
  select * into prior from public.maternal_registration_requests where id=request_uuid;
  if found then
    if prior.fingerprint<>fingerprint_value then raise exception 'This request was already saved with different details. Reload the registry before registering again.'; end if;
    select * into saved from public.pregnant_mothers where id=prior.mother_id;
    return saved;
  end if;
  insert into public.pregnant_mothers(date_registered,first_name,middle_name,last_name,full_name,address,purok,age,contact_number,lmp,
    gravida_para,edd,blood_pressure,waist_cm,height_cm,weight_kg,latitude,longitude,risk_level,registered_by)
  values((mother_data->>'date_registered')::date,trim(mother_data->>'first_name'),nullif(trim(mother_data->>'middle_name'),''),
    trim(mother_data->>'last_name'),concat_ws(' ',trim(mother_data->>'first_name'),nullif(trim(mother_data->>'middle_name'),''),trim(mother_data->>'last_name')),
    nullif(mother_data->>'address',''),zone,age_value,nullif(mother_data->>'contact_number',''),nullif(mother_data->>'lmp','')::date,
    case when gravida is not null and para is not null then 'G'||gravida||'P'||para end,nullif(mother_data->>'edd','')::date,
    nullif(mother_data->>'blood_pressure',''),nullif(mother_data->>'waist_cm','')::numeric,nullif(mother_data->>'height_cm','')::numeric,nullif(mother_data->>'weight_kg','')::numeric,
    nullif(mother_data->>'latitude','')::double precision,nullif(mother_data->>'longitude','')::double precision,
    case when cardinality(ids)>0 then 'high' else 'low' end,auth.uid()) returning * into saved;
  insert into public.pregnant_mother_indicators(pregnant_mother_id,indicator_id) select saved.id,unnest(ids);
  insert into public.maternal_registration_requests(id,actor_id,mother_id,fingerprint) values(request_uuid,auth.uid(),saved.id,fingerprint_value);
  return saved;
end;
$$;
revoke all on function public.register_mother(uuid,jsonb,uuid[]) from public,anon,authenticated;
grant execute on function public.register_mother(uuid,jsonb,uuid[]) to authenticated;


create or replace function public.capture_schedule_event() returns trigger
language plpgsql security definer set search_path=public as $$
declare schedule_row public.prenatal_schedules; mother_row record; entry record;
begin
  if tg_table_name='prenatal_schedule_recipients' then
    if tg_op='DELETE' then entry:=old; else entry:=new; end if;
    select * into schedule_row from public.prenatal_schedules where id=entry.schedule_id;
    if not found then return null; end if;
    select full_name,purok into mother_row from public.pregnant_mothers where id=entry.pregnant_mother_id;
    insert into public.schedule_events(schedule_id,pregnant_mother_id,patient_name,purok,visit_date,notes,status,action,created_at,actor_id,visit_number)
    values(schedule_row.id,entry.pregnant_mother_id,coalesce(mother_row.full_name,'Deleted patient'),mother_row.purok,
      schedule_row.visit_date,schedule_row.notes,case when tg_op='DELETE' then 'removed' else schedule_row.status end,
      case when tg_op='DELETE' then 'recipient_removed' else 'created' end,schedule_row.created_at,coalesce(auth.uid(),schedule_row.set_by),schedule_row.visit_number);
  else
    if tg_op='DELETE' then schedule_row:=old; else schedule_row:=new; end if;
    for mother_row in select m.id,m.full_name,m.purok from public.prenatal_schedule_recipients r
      join public.pregnant_mothers m on m.id=r.pregnant_mother_id where r.schedule_id=schedule_row.id loop
      insert into public.schedule_events(schedule_id,pregnant_mother_id,patient_name,purok,visit_date,notes,status,action,created_at,actor_id,visit_number)
      values(schedule_row.id,mother_row.id,mother_row.full_name,mother_row.purok,schedule_row.visit_date,schedule_row.notes,
        case when tg_op='DELETE' then 'deleted' else schedule_row.status end,lower(tg_op),schedule_row.created_at,coalesce(auth.uid(),schedule_row.set_by),schedule_row.visit_number);
    end loop;
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger capture_schedule_event on public.prenatal_schedules;
create trigger capture_schedule_event before delete or update of visit_date,trimester,visit_number,status,notes on public.prenatal_schedules for each row execute function public.capture_schedule_event();
create or replace view public.schedule_log_latest with(security_invoker=true) as
select distinct on(schedule_id,pregnant_mother_id) * from public.schedule_events order by schedule_id,pregnant_mother_id,occurred_at desc,id desc;
notify pgrst,'reload schema';

create function public.bhw_sms_log_visible(log_uuid uuid) returns boolean language sql stable security definer set search_path=public as $$
 select public.current_user_role()='bhw' and exists(
  select 1 from public.sms_logs l join public.profiles p on p.id=auth.uid() where l.id=log_uuid and (
    p.access_all_zones or (p.purok is not null and cardinality(l.recipient_mother_ids)>0
      and cardinality(l.recipient_mother_ids)=l.recipient_count
      and not exists(select 1 from unnest(l.recipient_mother_ids) mother_id where not exists(
        select 1 from public.pregnant_mothers m where m.id=mother_id and m.purok=p.purok)))
  ));
$$;
revoke all on function public.bhw_sms_log_visible(uuid) from public,anon,authenticated;
grant execute on function public.bhw_sms_log_visible(uuid) to authenticated;
alter policy sms_logs_read on public.sms_logs using(public.current_user_role()='nurse' or public.bhw_sms_log_visible(id));
notify pgrst,'reload schema';
