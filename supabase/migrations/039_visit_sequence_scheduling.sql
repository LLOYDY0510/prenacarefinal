-- Visit progression scheduling: a mother's position comes from her records,
-- not from LMP/EDD pregnancy dating. A slot is "consumed" once it has a
-- non-cancelled schedule (scheduled, completed or missed) or a recorded
-- checkup outcome, so a missed visit still moves her forward while the
-- checklist keeps showing it as missed.
create or replace function public.prenatal_visit_eligibility(
  mother_uuid uuid, visit_day date, trimester_value text, visit_value integer,
  exclude_uuid uuid default null
) returns text
language plpgsql volatile security definer set search_path=public as $$
declare mother public.pregnant_mothers; today date:=(now() at time zone 'Asia/Manila')::date;
  slot_index integer; prior record; prior_tri text; prior_num integer; prior_label text;
begin
  if visit_day is null or trimester_value is null or trimester_value not in('1st','2nd','3rd') or visit_value is null or visit_value not between 1 and 3 then return 'Choose a trimester, visit and date first.';end if;
  select * into mother from public.pregnant_mothers where id=mother_uuid;
  if not found then return 'Maternal record is unavailable.';end if;
  if exists(select 1 from public.prenatal_schedule_recipients r join public.prenatal_schedules s on s.id=r.schedule_id
    where r.schedule_id=exclude_uuid and r.pregnant_mother_id=mother_uuid and s.trimester=trimester_value and s.visit_number=visit_value and s.status<>'cancelled') then return null;end if;
  if visit_day<today then return 'The visit date cannot be in the past.';end if;
  if exists(select 1 from public.prenatal_checkups c left join public.prenatal_schedules s on s.id=c.schedule_id
    where c.pregnant_mother_id=mother_uuid and coalesce(c.trimester,s.trimester)=trimester_value and coalesce(c.visit_number,s.visit_number)=visit_value
      and(c.status='completed' or c.actual_checkup_date is not null)) then return 'This visit is already completed.';end if;
  if exists(select 1 from public.prenatal_schedule_recipients r join public.prenatal_schedules s on s.id=r.schedule_id
    where r.pregnant_mother_id=mother_uuid and s.trimester=trimester_value and s.visit_number=visit_value and s.status<>'cancelled'
      and(exclude_uuid is null or s.id<>exclude_uuid)) then return 'This visit is already assigned. Edit or cancel that assignment.';end if;

  -- New assignments must follow the visit sequence: every earlier slot has to
  -- be consumed first. Edits (exclude_uuid set) skip this so legacy records
  -- stay maintainable.
  if exclude_uuid is null then
    slot_index:=case trimester_value when '1st' then 0 when '2nd' then 3 else 6 end + visit_value - 1;
    for prior in select generate_series(0,slot_index-1) as j loop
      prior_tri:=case when prior.j<3 then '1st' when prior.j<6 then '2nd' else '3rd' end;
      prior_num:=(prior.j % 3)+1;
      if not exists(select 1 from public.prenatal_schedule_recipients r join public.prenatal_schedules s on s.id=r.schedule_id
          where r.pregnant_mother_id=mother_uuid and s.trimester=prior_tri and s.visit_number=prior_num and s.status<>'cancelled')
        and not exists(select 1 from public.prenatal_checkups c left join public.prenatal_schedules s on s.id=c.schedule_id
          where c.pregnant_mother_id=mother_uuid and coalesce(c.trimester,s.trimester)=prior_tri and coalesce(c.visit_number,s.visit_number)=prior_num
            and(c.status in('completed','missed') or c.actual_checkup_date is not null)) then
        prior_label:=prior_tri||' Trimester, '||case prior_num when 1 then '1st Visit' when 2 then '2nd Visit' else '3rd Visit' end;
        return 'Schedule the pending visit first: '||prior_label||'.';
      end if;
    end loop;
  end if;
  return null;
end;$$;
revoke all on function public.prenatal_visit_eligibility(uuid,date,text,integer,uuid) from public,anon,authenticated;
grant execute on function public.prenatal_visit_eligibility(uuid,date,text,integer,uuid) to service_role;
notify pgrst,'reload schema';
