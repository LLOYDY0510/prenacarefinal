-- Enhanced notification system for BHW follow-up monitoring
-- This adds triggers and functions to automatically create notifications for key events
-- Create function to generate notification event keys
create or replace function public.generate_event_key(event_type text, record_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  return event_type || '_' || record_id::text || '_' || extract(epoch from now())::text;
end;
$$;
-- Function to create missed checkup notification
create or replace function public.notify_missed_checkup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  mother_info record;
  event_key text;
begin
-- Only create notification when status changes to 'missed'
  if new.status = 'missed' and (old.status is null or old.status != 'missed') then
-- Get mother information
    select
      pm.id,
      pm.full_name,
      pm.purok,
      pm.risk_level
    into mother_info
    from public.pregnant_mothers pm
    where pm.id = new.pregnant_mother_id;
-- Generate unique event key
    event_key := public.generate_event_key('missed_checkup', new.pregnant_mother_id);
-- Create notification for relevant BHW (excluding bhw_purok role)
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
      new.pregnant_mother_id,
      event_key,
      'missed_visit',
      'Missed Prenatal Checkup',
      format('%s missed their scheduled prenatal checkup on %s. Risk level: %s',
             mother_info.full_name,
             coalesce(new.actual_checkup_date, new.scheduled_checkup_date, new.checkup_date),
             coalesce(mother_info.risk_level, 'unknown')
      ),
      'bhw_head',
      mother_info.purok,
      null
    );
-- Also notify admins and nurses for high-risk cases
    if mother_info.risk_level = 'high' then
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
        new.pregnant_mother_id,
        event_key || '_high_risk',
        'missed_visit',
        'High-Risk Mother Missed Checkup',
        format('HIGH RISK: %s missed their scheduled prenatal checkup on %s. Immediate follow-up required.',
               mother_info.full_name,
               coalesce(new.actual_checkup_date, new.scheduled_checkup_date, new.checkup_date)
        ),
        'nurse',
        null,
        null
      );
    end if;
  end if;

  return new;
end;
$$;
-- Function to create high-risk alert notification
create or replace function public.notify_high_risk_mother()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  event_key text;
begin
-- Only notify when risk level changes to 'high'
  if new.risk_level = 'high' and (old.risk_level is null or old.risk_level != 'high') then
    event_key := public.generate_event_key('high_risk', new.id);
-- Notify assigned BHW head (excluding bhw_purok role)
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
      new.id,
      event_key,
      'risk_alert',
      'High-Risk Mother Alert',
      format('%s has been flagged as high-risk. Close monitoring required.', new.full_name),
      'bhw_head',
      new.purok,
      null
    );
-- Notify nurses for medical attention
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
      new.id,
      event_key || '_nurse',
      'risk_alert',
      'New High-Risk Case',
      format('%s (Purok %s) has been flagged as high-risk. Medical assessment recommended.',
             new.full_name,
             coalesce(new.purok, 'unassigned')
      ),
      'nurse',
      null,
      null
    );
  end if;

  return new;
end;
$$;
-- Function to create upcoming checkup notification
create or replace function public.notify_upcoming_checkup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  mother_info record;
  event_key text;
begin
-- Only create notification for new scheduled checkups
  if tg_op = 'INSERT' then
-- Get mother information
    select
      pm.id,
      pm.full_name,
      pm.purok,
      pm.risk_level
    into mother_info
    from public.pregnant_mothers pm
    where pm.id = new.pregnant_mother_id;

    event_key := public.generate_event_key('upcoming_checkup', new.id);
-- Create notification for assigned BHW head (excluding bhw_purok role)
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
      new.pregnant_mother_id,
      event_key,
      'appointment',
      'Upcoming Prenatal Checkup',
      format('%s has a prenatal checkup scheduled for %s. Risk level: %s',
             mother_info.full_name,
             coalesce(new.visit_date, new.scheduled_checkup_date),
             coalesce(mother_info.risk_level, 'unknown')
      ),
      'bhw_head',
      mother_info.purok,
      null
    );
  end if;

  return new;
end;
$$;
-- Function to create referral notification
create or replace function public.notify_referral()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  mother_info record;
  event_key text;
begin
-- Only create notification for new referrals
  if tg_op = 'INSERT' then
-- Get mother information
    select
      pm.id,
      pm.full_name,
      pm.purok,
      pm.risk_level
    into mother_info
    from public.pregnant_mothers pm
    where pm.id = new.pregnant_mother_id;

    event_key := public.generate_event_key('referral', new.id);
-- Notify assigned BHW head (excluding bhw_purok role)
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
      new.pregnant_mother_id,
      event_key,
      'appointment',
      'New Referral Created',
      format('%s has been referred to %s for: %s. Status: %s',
             mother_info.full_name,
             new.referred_to,
             new.reason,
             new.status
      ),
      'bhw_head',
      mother_info.purok,
      null
    );
-- Notify nurses for referral tracking
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
      new.pregnant_mother_id,
      event_key || '_nurse',
      'appointment',
      'New Referral for Follow-up',
      format('%s (Purok %s) has been referred to %s. Reason: %s',
             mother_info.full_name,
             coalesce(mother_info.purok, 'unassigned'),
             new.referred_to,
             new.reason
      ),
      'nurse',
      null,
      null
    );
  end if;

  return new;
end;
$$;
-- Create triggers
drop trigger if exists notify_missed_checkup_trigger on public.prenatal_checkups;
create trigger notify_missed_checkup_trigger
after insert or update on public.prenatal_checkups
for each row execute function public.notify_missed_checkup();

drop trigger if exists notify_high_risk_mother_trigger on public.pregnant_mothers;
create trigger notify_high_risk_mother_trigger
after update on public.pregnant_mothers
for each row execute function public.notify_high_risk_mother();

drop trigger if exists notify_upcoming_checkup_trigger on public.prenatal_schedules;
create trigger notify_upcoming_checkup_trigger
after insert on public.prenatal_schedules
for each row execute function public.notify_upcoming_checkup();

drop trigger if exists notify_referral_trigger on public.maternal_referrals;
create trigger notify_referral_trigger
after insert on public.maternal_referrals
for each row execute function public.notify_referral();
-- Create function to mark notifications as read
create or replace function public.mark_notification_read(notification_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.maternal_notifications
  set read_at = now()
  where id = notification_id
    and (
      recipient_user_id = auth.uid()
      or exists (
        select 1 from public.profiles p
        where p.id = auth.uid()
          and (p.role = maternal_notifications.recipient_role
               or (p.role = 'bhw_purok' and p.purok = maternal_notifications.recipient_purok))
      )
    );

  return found;
end;
$$;
-- Grant execute permissions
grant execute on function public.mark_notification_read to authenticated;
grant execute on function public.generate_event_key to authenticated;
