create extension if not exists unaccent with schema extensions;
create or replace function public.normalize_table_search(value text) returns text language sql stable set search_path=public as $$
 select lower(regexp_replace(trim(extensions.unaccent(coalesce(value,''))),'\s+',' ','g'));
$$;

create index if not exists checkups_completed_slot_idx on public.prenatal_checkups(pregnant_mother_id,trimester,visit_number) where status='completed' or actual_checkup_date is not null;

-- One dating convention for current-trimester scheduling and visit dates.
create or replace function public.pregnancy_trimester(lmp_value date,edd_value date,on_day date) returns text
language plpgsql immutable set search_path=public as $$
declare start_day date:=coalesce(lmp_value,edd_value-280); days integer;
begin
  if start_day is null or on_day is null or (lmp_value is not null and edd_value is not null and edd_value<=lmp_value) then return null;end if;
  days:=on_day-start_day;
  if days<0 or days>=294 then return null;end if;
  return case when days<98 then '1st' when days<196 then '2nd' else '3rd' end;
end;$$;

create or replace function public.prenatal_visit_eligibility(mother_uuid uuid,visit_day date,trimester_value text,visit_value integer,exclude_uuid uuid default null) returns text
language plpgsql volatile security definer set search_path=public as $$
declare mother public.pregnant_mothers; today date:=(now() at time zone 'Asia/Manila')::date;current_trimester text;
begin
  if visit_day is null or trimester_value is null or trimester_value not in('1st','2nd','3rd') or visit_value is null or visit_value not between 1 and 3 then return 'Choose a trimester, visit and date first.';end if;
  select * into mother from public.pregnant_mothers where id=mother_uuid;
  if not found then return 'Maternal record is unavailable.';end if;
  if exists(select 1 from public.prenatal_schedule_recipients r join public.prenatal_schedules s on s.id=r.schedule_id
    where r.schedule_id=exclude_uuid and r.pregnant_mother_id=mother_uuid and s.trimester=trimester_value and s.visit_number=visit_value and s.status<>'cancelled') then return null;end if;
  if visit_day<today then return 'The visit date cannot be in the past.';end if;
  current_trimester:=public.pregnancy_trimester(mother.lmp,mother.edd,today);
  if current_trimester is null then return 'Pregnancy dating needs record review.';end if;
  if current_trimester<>trimester_value then return 'The mother is not currently in this trimester.';end if;
  if public.pregnancy_trimester(mother.lmp,mother.edd,visit_day) is distinct from trimester_value then return 'The visit date is outside this trimester.';end if;
  if exists(select 1 from public.prenatal_checkups c left join public.prenatal_schedules s on s.id=c.schedule_id
    where c.pregnant_mother_id=mother_uuid and coalesce(c.trimester,s.trimester)=trimester_value and coalesce(c.visit_number,s.visit_number)=visit_value
      and(c.status='completed' or c.actual_checkup_date is not null)) then return 'This visit is already completed.';end if;
  if exists(select 1 from public.prenatal_schedule_recipients r join public.prenatal_schedules s on s.id=r.schedule_id
    where r.pregnant_mother_id=mother_uuid and s.trimester=trimester_value and s.visit_number=visit_value and s.status<>'cancelled'
      and(exclude_uuid is null or s.id<>exclude_uuid)) then return 'This visit is already assigned. Edit or cancel that assignment.';end if;
  return null;
end;$$;

create or replace function public.schedule_planning_rows(mode_value text,query_value text default '',zone_value text default '',trimester_value text default null,visit_value integer default null,visit_day date default null,exclude_uuid uuid default null,offset_value integer default 0,limit_value integer default 25) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare result jsonb;today date:=(now() at time zone 'Asia/Manila')::date;
begin
  if public.current_user_role() is distinct from 'admin' then raise exception 'Admin access required' using errcode='42501';end if;
  if mode_value not in('eligibility','checklist') or mode_value is null or offset_value is null or offset_value<0 or limit_value is null or limit_value not between 1 and 100 or length(coalesce(query_value,''))>120 then raise exception 'Invalid planning request' using errcode='22023';end if;
  if exclude_uuid is not null and not exists(select 1 from public.prenatal_schedules where id=exclude_uuid) then raise exception 'Schedule no longer exists' using errcode='22023';end if;
  with candidates as materialized (
    select m.id,m.full_name,m.serial_no,m.purok,m.contact_number,
      case when mode_value='eligibility' then public.prenatal_visit_eligibility(m.id,visit_day,trimester_value,visit_value,exclude_uuid) end reason
    from public.pregnant_mothers m where (coalesce(zone_value,'')='' or m.purok=zone_value)
      and not exists(select 1 from regexp_split_to_table(public.normalize_table_search(query_value),'\s+') token
        where token<>'' and position(token in public.normalize_table_search(concat_ws(' ',m.full_name,m.serial_no,m.contact_number,'zone '||m.purok)))=0)
  ), eligible as materialized(select * from candidates where mode_value='checklist' or reason is null),
  paged as materialized(select * from eligible order by full_name,id offset offset_value limit limit_value),
  slots as (
    select p.id mother_id,t.tri,v.number,
      (select jsonb_build_object('status',r.state,'date',r.visit_date,'scheduleId',r.schedule_id) from (
        select s.id schedule_id,s.visit_date as visit_date,
          case when s.status='completed' or c.status='completed' or c.actual_checkup_date is not null then 'completed'
            when s.status='cancelled' then 'cancelled' when s.status='missed' or c.status='missed' or s.visit_date<today then 'missed' else 'scheduled' end state,
          case when s.status='completed' or c.status='completed' or c.actual_checkup_date is not null then 0 when s.status='cancelled' then 2 else 1 end priority,s.created_at
        from public.prenatal_schedule_recipients a join public.prenatal_schedules s on s.id=a.schedule_id
          left join public.prenatal_checkups c on c.schedule_id=s.id and c.pregnant_mother_id=p.id
        where a.pregnant_mother_id=p.id and s.trimester=t.tri and s.visit_number=v.number
        union all
        select null,coalesce(c.actual_checkup_date,c.scheduled_for,c.checkup_date),'completed',0,c.created_at
          from public.prenatal_checkups c where c.pregnant_mother_id=p.id and c.schedule_id is null and c.trimester=t.tri and c.visit_number=v.number and(c.status='completed' or c.actual_checkup_date is not null)
      ) r order by r.priority,r.visit_date desc,r.created_at desc,r.schedule_id limit 1) cell
    from paged p cross join(values('1st'),('2nd'),('3rd')) t(tri) cross join generate_series(1,3) v(number) where mode_value='checklist'
  )
  select jsonb_build_object('total',(select count(*) from eligible),'needsReview',(select count(*) from candidates where reason='Pregnancy dating needs record review.'),'updatedAt',now(),
    'rows',coalesce((select jsonb_agg(to_jsonb(p)-'reason'||case when mode_value='checklist' then jsonb_build_object('visits',coalesce((select jsonb_object_agg(s.tri||':'||s.number,coalesce(s.cell,jsonb_build_object('status','unscheduled','date',null,'scheduleId',null))) from slots s where s.mother_id=p.id),'{}'::jsonb)) else '{}'::jsonb end order by p.full_name,p.id) from paged p),'[]'::jsonb)) into result;
  return result;
end;$$;

create or replace function public.save_prenatal_schedule_visit(
 schedule_uuid uuid,visit_day date,trimester_value text,visit_value integer,recipient_ids uuid[],notes_value text,
 actor_uuid uuid,status_value text default 'scheduled'
) returns uuid language plpgsql security definer set search_path=public as $$
declare target uuid;previous public.prenatal_schedules;previous_ids uuid[]; mother_id uuid; reason text;
begin
  if not exists(select 1 from public.profiles where id=actor_uuid and account_status='active' and role='admin') then
    raise exception 'Only active admin/midwife accounts may manage schedules' using errcode='42501';end if;
  if visit_day is null or trimester_value is null or trimester_value not in('1st','2nd','3rd') or visit_value is null or visit_value not between 1 and 3
    or status_value is null or status_value not in('scheduled','completed','missed','cancelled') or coalesce(cardinality(recipient_ids),0)=0 then raise exception 'Select a trimester, visit (1–3), date and patients.';end if;
  if (select count(distinct id) from public.pregnant_mothers where id=any(recipient_ids))<>(select count(distinct id) from unnest(recipient_ids) id) then raise exception 'Unknown patient';end if;
  if schedule_uuid is not null then perform id from public.prenatal_schedules where id=schedule_uuid for update;end if;
  perform m.id from public.pregnant_mothers m where m.id=any(recipient_ids) order by m.id for update;
  if status_value<>'cancelled' then
    foreach mother_id in array recipient_ids loop
      reason:=public.prenatal_visit_eligibility(mother_id,visit_day,trimester_value,visit_value,schedule_uuid);
      if reason is not null then raise exception '% Refresh the eligible mother list.',reason using errcode='22023';end if;
    end loop;
  end if;
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

create or replace function public.save_prenatal_schedule(
  schedule_uuid uuid, visit_day date, trimester_value text, recipient_ids uuid[],
  notes_value text, actor_uuid uuid, status_value text default 'scheduled'
) returns uuid language plpgsql security definer set search_path = public as $$
declare target uuid; previous public.prenatal_schedules; previous_ids uuid[];
begin
  if not exists(select 1 from public.profiles where id=actor_uuid and role='admin' and account_status='active') then raise exception 'Admin access required' using errcode='42501';end if;
  if schedule_uuid is null or status_value<>'cancelled' then raise exception 'Select a numbered visit using the scheduling form.' using errcode='22023';end if;
  if visit_day is null or trimester_value not in ('1st','2nd','3rd')
    or status_value not in ('scheduled','completed','missed','cancelled')
    or coalesce(cardinality(recipient_ids),0) = 0 then raise exception 'Invalid schedule data'; end if;
  if (select count(distinct id) from public.pregnant_mothers where id = any(recipient_ids))
    <> (select count(distinct id) from unnest(recipient_ids) id) then raise exception 'Unknown mother'; end if;
  if schedule_uuid is null then
    insert into public.prenatal_schedules(visit_date,trimester,notes,set_by,status)
    values(visit_day,trimester_value,notes_value,actor_uuid,status_value) returning id into target;
  else
    select * into previous from public.prenatal_schedules where id = schedule_uuid for update;
    if not found then raise exception 'Schedule not found'; end if;
    target := schedule_uuid;
    select array_agg(pregnant_mother_id order by pregnant_mother_id) into previous_ids
    from public.prenatal_schedule_recipients where schedule_id = target;
    update public.prenatal_schedules set visit_date = visit_day, trimester = trimester_value,
      notes = notes_value, status = status_value where id = target;
    if previous.visit_date <> visit_day or previous.trimester is distinct from trimester_value
      or previous_ids is distinct from (select array_agg(distinct id order by id) from unnest(recipient_ids) id) then
      perform public.invalidate_schedule_reminders(target);
    end if;
    delete from public.prenatal_schedule_recipients where schedule_id = target and not pregnant_mother_id = any(recipient_ids);
  end if;
  insert into public.prenatal_schedule_recipients(schedule_id,pregnant_mother_id)
  select target, id from unnest(recipient_ids) id on conflict(schedule_id,pregnant_mother_id) do nothing;
  return target;
end;
$$;

-- Schedule mutations go through the authorized transactional service.
do $$declare entry record;begin
 for entry in select tablename,policyname,cmd from pg_policies where schemaname='public' and tablename in('prenatal_schedules','prenatal_schedule_recipients') and cmd in('INSERT','UPDATE','DELETE') loop
  if entry.cmd='INSERT' then execute format('alter policy %I on public.%I with check(false)',entry.policyname,entry.tablename);
  elsif entry.cmd='UPDATE' then execute format('alter policy %I on public.%I using(false) with check(false)',entry.policyname,entry.tablename);
  else execute format('alter policy %I on public.%I using(false)',entry.policyname,entry.tablename);end if;
 end loop;
end;$$;
revoke all on function public.pregnancy_trimester(date,date,date),public.prenatal_visit_eligibility(uuid,date,text,integer,uuid),public.schedule_planning_rows(text,text,text,text,integer,date,uuid,integer,integer) from public,anon,authenticated;
grant execute on function public.schedule_planning_rows(text,text,text,text,integer,date,uuid,integer,integer) to authenticated;
grant execute on function public.pregnancy_trimester(date,date,date),public.prenatal_visit_eligibility(uuid,date,text,integer,uuid) to service_role;
notify pgrst,'reload schema';
