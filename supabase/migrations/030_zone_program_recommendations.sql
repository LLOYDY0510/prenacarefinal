create table public.zone_program_catalog (
  id integer primary key check(id between 1 and 8),
  title text not null,
  activities text not null
);
insert into public.zone_program_catalog(id,title,activities) values
 (1,'Teenage Pregnancy Awareness and Prevention Program','Age-appropriate reproductive health education, responsible decision-making, prevention of sexual coercion, youth counseling, and information about adolescent-friendly health services.'),
 (2,'Family Planning and Responsible Parenthood Education','Explain pregnancy spacing, available family planning options, informed choice, and access to qualified counseling and services.'),
 (3,'High-Risk Pregnancy Monitoring and Referral Program','Review patient records, arrange appropriate prenatal assessments, follow clinician-approved care plans, and coordinate referrals to suitable health facilities.'),
 (4,'Prenatal Care Awareness and Follow-Up Program','Prenatal schedule education, appointment reminders, follow-up by authorized BHWs, and assistance arranging health-center consultations.'),
 (5,'Maternal Nutrition and Anemia Prevention Program','Nutrition counseling, education on iron and folic acid supplementation, and referral for assessment or treatment when indicated.'),
 (6,'Safe Pregnancy, Birth Preparedness, and Emergency Referral Seminar','Discuss facility-based delivery planning, transportation arrangements, emergency contacts, and when to seek urgent medical assessment.'),
 (7,'Barangay Maternal Health Outreach Program','Health education sessions, prenatal appointment assistance, coordination with BHWs, and referral information for residents in the identified zones.'),
 (8,'Maternal and Newborn Care Education Program','Prenatal education on postpartum checkups, breastfeeding, newborn care, and when mothers or newborns need professional attention.');

create table public.zone_program_needs (
  zone text not null check(zone ~ '^[1-8]$'),
  program_id integer not null references public.zone_program_catalog(id) check(program_id in(2,5,6,7,8)),
  identified_count integer not null check(identified_count >= 0),
  note text not null check(length(note) between 5 and 500),
  assessed_on date not null,
  recorded_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key(zone,program_id)
);
create table public.zone_program_campaigns (
  id uuid primary key default gen_random_uuid(),
  zone text not null check(zone ~ '^[1-8]$'),
  program_id integer not null references public.zone_program_catalog(id),
  period date not null,
  title text not null,
  message text not null,
  evidence jsonb not null,
  sent_by uuid references auth.users(id) on delete set null,
  recipient_count integer not null check(recipient_count > 0),
  sent_at timestamptz not null default now(),
  unique(zone,program_id,period)
);
create table public.zone_program_recipients (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.zone_program_campaigns(id),
  patient_user_id uuid references auth.users(id) on delete set null,
  mother_id uuid references public.pregnant_mothers(id) on delete set null,
  notification_id uuid references public.maternal_notifications(id) on delete set null,
  unique(campaign_id,patient_user_id)
);
create index if not exists checkup_schedule_attendance_idx on public.prenatal_checkups(schedule_id,pregnant_mother_id) where status='completed';
create index if not exists mothers_program_zone_idx on public.pregnant_mothers(purok,date_registered) include(age,risk_level);
create index zone_program_recipient_campaign_idx on public.zone_program_recipients(campaign_id);

create function public.can_access_program_zone(zone_value text) returns boolean
language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.profiles p where p.id=auth.uid() and p.account_status='active'
   and(p.role in('nurse','admin') or(p.role='bhw' and(p.access_all_zones or p.purok=zone_value))));
$$;

alter table public.zone_program_catalog enable row level security;
alter table public.zone_program_needs enable row level security;
alter table public.zone_program_campaigns enable row level security;
alter table public.zone_program_recipients enable row level security;
create policy program_catalog_read on public.zone_program_catalog for select to authenticated using(public.current_user_role() in('bhw','nurse','admin'));
create policy program_needs_read on public.zone_program_needs for select to authenticated using(public.can_access_program_zone(zone));
create policy program_campaigns_read on public.zone_program_campaigns for select to authenticated using(public.can_access_program_zone(zone));
create policy program_recipients_read on public.zone_program_recipients for select to authenticated using(exists(
  select 1 from public.zone_program_campaigns c where c.id=campaign_id and public.can_access_program_zone(c.zone)));
revoke all on public.zone_program_catalog,public.zone_program_needs,public.zone_program_campaigns,public.zone_program_recipients from anon,authenticated;
grant select on public.zone_program_catalog,public.zone_program_needs,public.zone_program_campaigns,public.zone_program_recipients to authenticated;
grant all on public.zone_program_catalog,public.zone_program_needs,public.zone_program_campaigns,public.zone_program_recipients to service_role;

create function public.zone_program_summary() returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare result jsonb; day_value date:=(now() at time zone 'Asia/Manila')::date;
begin
  if not exists(select 1 from public.profiles where id=auth.uid() and account_status='active' and role in('bhw','nurse','admin')) then
    raise exception 'Care staff access required' using errcode='42501';
  end if;
  with zones as materialized (
    select z::text zone from generate_series(1,8) z where public.can_access_program_zone(z::text)
  ), mothers as materialized (
    select m.id,m.purok,m.age,m.risk_level,m.date_registered from public.pregnant_mothers m join zones z on z.zone=m.purok
  ), late_mothers as (
    select distinct r.pregnant_mother_id id from public.prenatal_schedule_recipients r
      join public.prenatal_schedules s on s.id=r.schedule_id join mothers m on m.id=r.pregnant_mother_id
      where s.visit_date<day_value and s.status in('scheduled','missed')
        and not exists(select 1 from public.prenatal_checkups c where c.schedule_id=s.id and c.pregnant_mother_id=m.id and c.status='completed')
    union
    select distinct c.pregnant_mother_id from public.prenatal_checkups c join mothers m on m.id=c.pregnant_mother_id
      where c.status='missed' and coalesce(c.scheduled_for,c.checkup_date)<day_value
      and not exists(select 1 from public.prenatal_checkups done where done.schedule_id=c.schedule_id and done.pregnant_mother_id=m.id and done.status='completed')
  ), reachable as (
    select m.purok,count(distinct p.pregnant_mother_id)::integer count from public.profiles p join mothers m on m.id=p.pregnant_mother_id
      where p.role='patient' and p.account_status='active' group by m.purok
  ), metrics as (
    select z.zone,count(m.id)::integer registered,count(m.id) filter(where m.age is not null)::integer known_age,
      count(m.id) filter(where m.age between 10 and 19)::integer adolescents,
      count(m.id) filter(where m.risk_level='high')::integer high_risk,
      count(l.id)::integer overdue,count(m.id) filter(where m.date_registered is null)::integer unknown_date,
      count(m.id) filter(where m.age is not null and m.date_registered between day_value-29 and day_value)::integer recent_known,
      count(m.id) filter(where m.age between 10 and 19 and m.date_registered between day_value-29 and day_value)::integer recent_teens,
      count(m.id) filter(where m.age is not null and m.date_registered>=day_value-59 and m.date_registered<day_value-29)::integer prior_known,
      count(m.id) filter(where m.age between 10 and 19 and m.date_registered>=day_value-59 and m.date_registered<day_value-29)::integer prior_teens,
      coalesce(max(a.count),0)::integer reachable
      from zones z left join mothers m on m.purok=z.zone left join late_mothers l on l.id=m.id
      left join reachable a on a.purok=z.zone group by z.zone
  ), evidence as (
    select m.*,p.id program_id,p.title,p.activities,n.identified_count,n.assessed_on,n.note,
      coalesce(n.assessed_on between day_value-90 and day_value and n.identified_count between 1 and m.registered,false) assessment_current,
      (m.recent_known>=10 and m.prior_known>=10 and m.recent_teens::numeric/nullif(m.recent_known,0)-m.prior_teens::numeric/nullif(m.prior_known,0)>=0.05) adolescent_rising,
      c.id campaign_id,c.sent_at,c.recipient_count
    from metrics m cross join public.zone_program_catalog p
      left join public.zone_program_needs n on n.zone=m.zone and n.program_id=p.id
      left join public.zone_program_campaigns c on c.zone=m.zone and c.program_id=p.id and c.period=date_trunc('month',day_value)::date
  ), rows as (
    select e.*,case program_id
      when 1 then adolescents>=3 or(known_age>=10 and adolescents::numeric/nullif(known_age,0)>=0.2) or coalesce(adolescent_rising,false)
      when 3 then high_risk>=2 when 4 then overdue>=3 when 7 then registered>=10 or assessment_current
      else assessment_current end eligible,
      case program_id
        when 1 then format('%s adolescents among %s recorded ages; %s ages missing.%s',adolescents,known_age,registered-known_age,
          case when adolescent_rising then ' Adolescent registration proportion rose by at least 5 percentage points across the two 30-day cohorts.' else '' end)
        when 3 then format('%s high-risk records; group-planning threshold: 2.',high_risk)
        when 4 then format('%s mothers with overdue or missed visits; group-planning threshold: 3.',overdue)
        when 7 then case when registered>=10 then format('%s registered mothers; outreach threshold: 10.',registered)
          when assessment_current then format('%s access needs identified on %s.',identified_count,assessed_on) else 'A current access-needs assessment or 10 registrations is required.' end
        else case when assessment_current then format('%s education or assessment needs identified on %s.',identified_count,assessed_on)
          else 'A current staff needs assessment is required.' end end reason
    from evidence e
  )
  select jsonb_build_object('computedAt',now(),'period',date_trunc('month',day_value)::date,
    'zones',coalesce((select jsonb_agg(to_jsonb(m) order by zone) from metrics m),'[]'::jsonb),
    'recommendations',coalesce((select jsonb_agg(to_jsonb(r)||jsonb_build_object('revision',md5(to_jsonb(r)::text||day_value::text),
      'announcement',format('A program is recommended for Zone %s: %s.%s%s%sContact your barangay health center for information and available services.',zone,title,E'\n\n',activities,E'\n\n')) order by zone,program_id) from rows r),'[]'::jsonb)) into result;
  return result;
end;
$$;

create function public.save_zone_program_need(zone_value text,program_value integer,count_value integer,note_value text,date_value date) returns void
language plpgsql security definer set search_path=public as $$
declare total integer; day_value date:=(now() at time zone 'Asia/Manila')::date;
begin
  if public.current_user_role() is distinct from 'bhw' or not public.can_access_program_zone(zone_value) then
    raise exception 'An assigned active BHW is required' using errcode='42501';
  end if;
  select count(*) into total from public.pregnant_mothers where purok=zone_value;
  if zone_value is null or zone_value!~'^[1-8]$' or program_value is null or program_value not in(2,5,6,7,8)
    or count_value is null or count_value<0 or count_value>total or note_value is null or length(trim(note_value)) not between 5 and 500
    or date_value is null or date_value>day_value or date_value<day_value-90 then
    raise exception 'Enter a valid zone assessment, date, count, and source note' using errcode='22023';
  end if;
  insert into public.zone_program_needs(zone,program_id,identified_count,note,assessed_on,recorded_by)
    values(zone_value,program_value,count_value,trim(note_value),date_value,auth.uid())
    on conflict(zone,program_id) do update set identified_count=excluded.identified_count,note=excluded.note,
      assessed_on=excluded.assessed_on,recorded_by=excluded.recorded_by,updated_at=now();
end;
$$;

create function public.send_zone_program(zone_value text,program_value integer,revision_value text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare campaign public.zone_program_campaigns; selected jsonb; summary jsonb; notice_count integer;
  period_value date:=date_trunc('month',now() at time zone 'Asia/Manila')::date;
begin
  if public.current_user_role() is distinct from 'bhw' or not public.can_access_program_zone(zone_value) then
    raise exception 'An assigned active BHW is required' using errcode='42501';
  end if;
  if zone_value is null or zone_value!~'^[1-8]$' or program_value is null or program_value not between 1 and 8 or revision_value is null then
    raise exception 'Invalid zone program request' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('zone-program:'||zone_value||':'||program_value||':'||period_value,0));
  select * into campaign from public.zone_program_campaigns where zone=zone_value and program_id=program_value and period=period_value;
  if found then return jsonb_build_object('campaignId',campaign.id,'created',0,'recipients',campaign.recipient_count,'alreadySent',true); end if;
  perform m.id from public.pregnant_mothers m where m.purok=zone_value for share;
  perform p.id from public.profiles p join public.pregnant_mothers m on m.id=p.pregnant_mother_id
    where m.purok=zone_value for share of p;
  summary:=public.zone_program_summary();
  select item into selected from jsonb_array_elements(summary->'recommendations') item where item->>'zone'=zone_value and (item->>'program_id')::integer=program_value;
  if selected is null or (selected->>'eligible')::boolean is not true or selected->>'revision' is distinct from revision_value then
    raise exception 'Recommendation changed. Refresh and review before sending.' using errcode='40001';
  end if;
  if (selected->>'reachable')::integer<1 then raise exception 'No linked active patient accounts in this zone' using errcode='22023'; end if;
  insert into public.zone_program_campaigns(zone,program_id,period,title,message,evidence,sent_by,recipient_count)
    values(zone_value,program_value,period_value,selected->>'title',
      selected->>'announcement',selected,auth.uid(),(selected->>'reachable')::integer)
    returning * into campaign;
  with notices as (
    insert into public.maternal_notifications(pregnant_mother_id,recipient_user_id,event_key,category,title,message,email_status)
      select m.id,p.id,'zone-program:'||campaign.id||':'||p.id,'program_recommendation',campaign.title,campaign.message,'skipped'
      from public.profiles p join public.pregnant_mothers m on m.id=p.pregnant_mother_id
      where p.role='patient' and p.account_status='active' and m.purok=zone_value
      returning id,pregnant_mother_id,recipient_user_id
  )
  insert into public.zone_program_recipients(campaign_id,patient_user_id,mother_id,notification_id)
    select campaign.id,recipient_user_id,pregnant_mother_id,id from notices;
  get diagnostics notice_count=row_count;
  if notice_count<>campaign.recipient_count then raise exception 'Recipients changed. Refresh and review before sending.' using errcode='40001'; end if;
  return jsonb_build_object('campaignId',campaign.id,'created',notice_count,'recipients',notice_count,'alreadySent',false);
end;
$$;

create trigger capture_activity after insert or update on public.zone_program_needs for each row execute function public.capture_activity();
create trigger capture_activity after insert on public.zone_program_campaigns for each row execute function public.capture_activity();
revoke all on function public.can_access_program_zone(text),public.zone_program_summary(),public.save_zone_program_need(text,integer,integer,text,date),public.send_zone_program(text,integer,text) from public,anon,authenticated;
grant execute on function public.can_access_program_zone(text),public.zone_program_summary(),public.save_zone_program_need(text,integer,integer,text,date),public.send_zone_program(text,integer,text) to authenticated;
notify pgrst,'reload schema';
