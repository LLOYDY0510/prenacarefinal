-- Browser-created batches always start pending and cannot forge delivery state.
revoke insert on public.tip_broadcasts from authenticated;
grant insert(month,risk_level,period,title,content) on public.tip_broadcasts to authenticated;
revoke insert on public.tip_broadcast_recipients from authenticated;
grant insert(broadcast_id,pregnant_mother_id) on public.tip_broadcast_recipients to authenticated;
revoke delete on public.tip_broadcasts from authenticated;
create unique index if not exists tip_broadcast_period_group on public.tip_broadcasts(period,month,risk_level);

create or replace function public.review_changed_tip()
returns trigger language plpgsql set search_path = public as $$
begin
  if old.content is distinct from new.content or old.title is distinct from new.title then
    if old.status = 'sent' then raise exception 'Dispatched content is immutable'; end if;
    new.status = 'pending'; new.approved_at = null; new.approved_by = null;
  end if;
  return new;
end;
$$;
create trigger review_changed_tip before update on public.tip_broadcasts
for each row execute function public.review_changed_tip();
-- Direct notices belong to their addressed user, while role notices are shared.
create or replace function public.can_access_notification(row_recipient_user_id uuid,row_recipient_role text,row_mother_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
select row_recipient_user_id = auth.uid()
  or (row_recipient_user_id is null and public.is_clinical_staff()
    and (row_recipient_role is null or row_recipient_role = public.current_user_role()))
  or (public.current_user_role() = 'pregnant_mother' and row_mother_id = public.current_mother_id());
$$;
notify pgrst, 'reload schema';
-- Delete schedule relations and stale patient appointment notices together.
create or replace function public.delete_prenatal_schedule(schedule_uuid uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from public.maternal_notifications where
    event_key like 'appointment:' || schedule_uuid::text || ':%'
    or event_key like 'prenatal-reminder:' || schedule_uuid::text || ':%'
    or event_key like 'prenatal_reminder:' || schedule_uuid::text || ':%';
  delete from public.prenatal_schedules where id = schedule_uuid;
end;
$$;
revoke all on function public.delete_prenatal_schedule(uuid) from public,authenticated,anon;
grant execute on function public.delete_prenatal_schedule(uuid) to service_role;
notify pgrst, 'reload schema';

-- A stale record link must never widen a pending or BHW role's access.
create or replace function public.can_access_mother(mother_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
select public.is_clinical_staff()
  or exists(select 1 from public.pregnant_mothers m where m.id = mother_id
    and public.current_user_role() = 'bhw_purok' and m.purok = public.current_user_purok())
  or (public.current_user_role() = 'pregnant_mother' and public.current_mother_id() = mother_id);
$$;

-- Patients cannot manufacture dispatch evidence; provider logs are server-owned.
drop policy notifications_insert on public.maternal_notifications;
create policy notifications_insert on public.maternal_notifications for insert to authenticated
with check (public.current_user_role() in ('admin','nurse','bhw_head'));
revoke insert, update, delete on public.sms_logs from authenticated;
revoke insert, update, delete on public.prenatal_schedules from authenticated;
revoke insert, update, delete on public.prenatal_schedule_recipients from authenticated;
notify pgrst, 'reload schema';

-- Historical sender ownership does not grant access after staff demotion.
drop policy sms_logs_read on public.sms_logs;
create policy sms_logs_read on public.sms_logs for select to authenticated
using(public.is_clinical_staff() or (public.current_user_role()='bhw_purok' and sent_by=auth.uid()));
notify pgrst, 'reload schema';
