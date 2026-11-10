
-- Keep sent receipts when schedules are removed.
alter table public.sms_recipient_receipts drop constraint sms_recipient_receipts_schedule_id_fkey;
alter table public.sms_recipient_receipts add constraint sms_recipient_receipts_schedule_id_fkey
foreign key(schedule_id) references public.prenatal_schedules(id) on delete set null;

create or replace function public.invalidate_schedule_reminders(schedule_uuid uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.prenatal_schedules set reminder_sent = false, reminder_sent_at = null,
    reminder_attempted_at = null, missed_follow_up_sent = false where id = schedule_uuid;
  delete from public.prenatal_schedule_reminders where schedule_id = schedule_uuid;
  delete from public.maternal_notifications
  where event_key like 'prenatal-reminder:' || schedule_uuid::text || ':%'
     or event_key like 'prenatal_reminder:' || schedule_uuid::text || ':%';
end;
$$;
revoke all on function public.invalidate_schedule_reminders(uuid) from public, authenticated, anon;
grant execute on function public.invalidate_schedule_reminders(uuid) to service_role;
-- Commit the schedule and all recipient changes together.
create or replace function public.save_prenatal_schedule(
  schedule_uuid uuid, visit_day date, trimester_value text, recipient_ids uuid[],
  notes_value text, actor_uuid uuid, status_value text default 'scheduled'
) returns uuid language plpgsql security definer set search_path = public as $$
declare target uuid; previous public.prenatal_schedules; previous_ids uuid[];
begin
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
revoke all on function public.save_prenatal_schedule(uuid,date,text,uuid[],text,uuid,text) from public,authenticated,anon;
grant execute on function public.save_prenatal_schedule(uuid,date,text,uuid[],text,uuid,text) to service_role;
-- Lock an account before linking to prevent concurrent reassignment.
create or replace function public.link_maternal_account(account_uuid uuid, mother_uuid uuid)
returns setof public.profiles language plpgsql security definer set search_path = public as $$
declare account public.profiles; mother public.pregnant_mothers;
begin
  select * into account from public.profiles where id = account_uuid for update;
  if not found or account.role <> 'pending' or account.pregnant_mother_id is not null then
    raise exception 'Account is already assigned'; end if;
  select * into mother from public.pregnant_mothers where id = mother_uuid;
  if not found then raise exception 'Record not found'; end if;
  return query update public.profiles set role = 'pregnant_mother', pregnant_mother_id = mother_uuid,
    full_name = mother.full_name, purok = null where id = account_uuid returning *;
end;
$$;
revoke all on function public.link_maternal_account(uuid,uuid) from public,authenticated,anon;
grant execute on function public.link_maternal_account(uuid,uuid) to service_role;
notify pgrst, 'reload schema';
