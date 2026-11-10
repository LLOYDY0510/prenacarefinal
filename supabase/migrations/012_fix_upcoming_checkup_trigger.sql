-- Fixes: ERROR: record "new" has no field "pregnant_mother_id"

create or replace function public.notify_upcoming_checkup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recipient_count integer;
  v_mother_summary text;
begin
  if tg_op <> 'INSERT' then
    return new;
  end if;
-- Resolve the mothers of this schedule through the junction table.
  select count(*)::integer,
         string_agg(
           pm.full_name || ' (' || coalesce(pm.risk_level, 'unknown') || ')',
           ', ' order by pm.full_name
         )
  into v_recipient_count, v_mother_summary
  from public.prenatal_schedule_recipients psr
  join public.pregnant_mothers pm on pm.id = psr.pregnant_mother_id
  where psr.schedule_id = new.id;

  insert into public.maternal_notifications (
    pregnant_mother_id,
    event_key,
    category,
    title,
    message,
    recipient_role,
    recipient_purok,
    recipient_user_id
  )
  values (
    null,
    'upcoming_checkup_' || new.id::text,
    'appointment',
    'Upcoming Prenatal Checkup',
    case
      when v_recipient_count = 0 then
        format(
          'A prenatal checkup was scheduled for %s.',
          coalesce(new.visit_date::text, 'an unscheduled date')
        )
      else
        format(
          'A prenatal checkup is scheduled for %s: %s.',
          coalesce(new.visit_date::text, 'an unscheduled date'),
          v_mother_summary
        )
    end,
    'bhw_head',
    null,
    null
  )
  on conflict (event_key) do nothing;

  return new;
end;
$$;

drop trigger if exists notify_upcoming_checkup_trigger on public.prenatal_schedules;
create trigger notify_upcoming_checkup_trigger
  after insert on public.prenatal_schedules
  for each row execute function public.notify_upcoming_checkup();
-- Not changed here, but worth knowing about:
