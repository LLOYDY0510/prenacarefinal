-- Opaque request contexts are issued only by the application server.
create table public.audit_request_contexts (
  id uuid primary key default gen_random_uuid(), actor_id uuid,
  ip_address inet, user_agent text, created_at timestamptz not null default now()
);
create index audit_request_contexts_created_idx on public.audit_request_contexts(created_at);
alter table public.audit_request_contexts enable row level security;
revoke all on public.audit_request_contexts from public,anon,authenticated;
grant all on public.audit_request_contexts to service_role;

create function public.create_audit_context(actor_uuid uuid,client_ip inet,client_agent text) returns uuid
language plpgsql security definer set search_path=public as $$
declare context_uuid uuid;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Server access required' using errcode='42501'; end if;
  delete from public.audit_request_contexts where created_at<now()-interval '5 minutes';
  insert into public.audit_request_contexts(actor_id,ip_address,user_agent)
  values(actor_uuid,client_ip,left(client_agent,512)) returning id into context_uuid;
  return context_uuid;
end;
$$;
revoke all on function public.create_audit_context(uuid,inet,text) from public,anon,authenticated;
grant execute on function public.create_audit_context(uuid,inet,text) to service_role;

create or replace function public.capture_activity() returns trigger
language plpgsql security definer set search_path=public as $$
declare row_data jsonb; identity_row public.profiles; target text; actor uuid; client_headers jsonb;
  agent text; browser_name text; request_context public.audit_request_contexts; token text;
begin
  if tg_op='DELETE' then row_data:=to_jsonb(old); else row_data:=to_jsonb(new); end if;
  client_headers:=coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb;
  actor:=auth.uid();
  token:=client_headers->>'x-prenatrack-context';
  if token ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select * into request_context from public.audit_request_contexts
      where id=token::uuid and created_at>now()-interval '5 minutes'
      and (auth.role()='service_role' or actor_id=auth.uid());
  end if;
  if request_context.id is not null then
    actor:=request_context.actor_id; agent:=request_context.user_agent;
  else
    if auth.role()='service_role' and (client_headers->>'x-prenatrack-actor') ~ '^[0-9a-f-]{36}$' then
      actor:=(client_headers->>'x-prenatrack-actor')::uuid;
    end if;
    agent:=left(client_headers->>'user-agent',512);
  end if;
  browser_name:=case when agent like '%Edg/%' then 'Edge' when agent like '%Firefox/%' then 'Firefox'
    when agent like '%Chrome/%' then 'Chrome' when agent like '%Safari/%' then 'Safari'
    when agent is null then 'Unknown' else 'Other' end;
  select * into identity_row from public.profiles where id=actor;
  target:=coalesce(row_data->>'id',row_data->>'dedupe_key');
  insert into public.activity_logs(actor_id,actor_name,actor_role,action,description,target_type,target_id,ip_address,user_agent,browser,request_id)
  values(actor,coalesce(identity_row.full_name,'System'),identity_row.role,lower(tg_op),
    initcap(lower(tg_op)) || ' ' || replace(tg_table_name,'_',' '),tg_table_name,target,
    request_context.ip_address,agent,browser_name,request_context.id);
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function public.capture_activity() from public,anon,authenticated;

-- INSERT RETURNING must evaluate the new row's zone without querying that row again.
alter policy mothers_read on public.pregnant_mothers using(
  public.is_clinical_staff()
  or (public.current_user_role()='patient' and id=public.current_mother_id())
  or (public.current_user_role()='bhw' and exists(select 1 from public.profiles p
    where p.id=(select auth.uid()) and (p.access_all_zones or (p.purok is not null and p.purok=pregnant_mothers.purok))))
);

-- Retries share a request key and cannot create duplicate patient records.
create table public.maternal_registration_requests (
  id uuid primary key, actor_id uuid not null, mother_id uuid not null references public.pregnant_mothers(id),
  fingerprint text not null, created_at timestamptz not null default now()
);
alter table public.maternal_registration_requests enable row level security;
revoke all on public.maternal_registration_requests from public,anon,authenticated;
grant select,insert on public.maternal_registration_requests to authenticated;
grant all on public.maternal_registration_requests to service_role;
create policy registration_requests_own on public.maternal_registration_requests to authenticated
using(actor_id=auth.uid() and public.current_user_role()='bhw')
with check(actor_id=auth.uid() and public.current_user_role()='bhw' and public.can_manage_mother(mother_id));
create index maternal_registration_mother_idx on public.maternal_registration_requests(mother_id);

create function public.register_mother(request_uuid uuid,mother_data jsonb,indicator_ids uuid[] default '{}')
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
    gravida_para,edd,blood_pressure,height_cm,weight_kg,latitude,longitude,risk_level,registered_by)
  values((mother_data->>'date_registered')::date,trim(mother_data->>'first_name'),nullif(trim(mother_data->>'middle_name'),''),
    trim(mother_data->>'last_name'),concat_ws(' ',trim(mother_data->>'first_name'),nullif(trim(mother_data->>'middle_name'),''),trim(mother_data->>'last_name')),
    nullif(mother_data->>'address',''),zone,age_value,nullif(mother_data->>'contact_number',''),nullif(mother_data->>'lmp','')::date,
    case when gravida is not null and para is not null then 'G'||gravida||'P'||para end,nullif(mother_data->>'edd','')::date,
    nullif(mother_data->>'blood_pressure',''),nullif(mother_data->>'height_cm','')::numeric,nullif(mother_data->>'weight_kg','')::numeric,
    nullif(mother_data->>'latitude','')::double precision,nullif(mother_data->>'longitude','')::double precision,
    case when cardinality(ids)>0 then 'high' else 'low' end,auth.uid()) returning * into saved;
  insert into public.pregnant_mother_indicators(pregnant_mother_id,indicator_id) select saved.id,unnest(ids);
  insert into public.maternal_registration_requests(id,actor_id,mother_id,fingerprint) values(request_uuid,auth.uid(),saved.id,fingerprint_value);
  return saved;
end;
$$;
revoke all on function public.register_mother(uuid,jsonb,uuid[]) from public,anon,authenticated;
grant execute on function public.register_mother(uuid,jsonb,uuid[]) to authenticated;

-- Registration notices remain in-app and commit with the patient record.
create function public.notify_registered_mother() returns trigger
language plpgsql security definer set search_path=public as $$
declare recipient text; staff record;
begin
  foreach recipient in array array['admin','bhw'] loop
    if recipient='bhw' then
      for staff in select id from public.profiles where role='bhw' and account_status='active' and (access_all_zones or purok=new.purok) loop
        insert into public.maternal_notifications(event_key,category,title,message,recipient_user_id,email_status)
        values('registered_'||new.id||'_'||staff.id,'staff','New pregnant mother registered',
          new.full_name||' was added to the maternal registry.',staff.id,'skipped');
      end loop;
    else
      insert into public.maternal_notifications(event_key,category,title,message,recipient_role,email_status)
      values('registered_'||new.id||'_'||recipient,'staff','New pregnant mother registered',
        new.full_name||' was added to the maternal registry.',recipient,'skipped');
    end if;
  end loop;
  if new.risk_level='high' then
    foreach recipient in array array['admin','nurse','patient'] loop
      insert into public.maternal_notifications(pregnant_mother_id,event_key,category,title,message,recipient_role,email_status)
      values(case when recipient='patient' then new.id end,'registered_risk_'||new.id||'_'||recipient,'risk_alert','High-risk pregnancy alert',
        case when recipient='patient' then 'Your record has been flagged for enhanced prenatal monitoring. Please review your care plan with your BHW or nurse at your next visit.'
        else new.full_name||' was registered as high risk and needs enhanced prenatal monitoring.' end,recipient,'skipped');
    end loop;
    for staff in select id from public.profiles where role='bhw' and account_status='active' and (access_all_zones or purok=new.purok) loop
      insert into public.maternal_notifications(event_key,category,title,message,recipient_user_id,email_status)
      values('registered_risk_'||new.id||'_'||staff.id,'risk_alert','High-risk pregnancy alert',
        new.full_name||' was registered as high risk and needs enhanced prenatal monitoring.',staff.id,'skipped');
    end loop;
  end if;
  return new;
end;
$$;
revoke all on function public.notify_registered_mother() from public,anon,authenticated;
create trigger notify_registered_mother after insert on public.pregnant_mothers for each row execute function public.notify_registered_mother();
