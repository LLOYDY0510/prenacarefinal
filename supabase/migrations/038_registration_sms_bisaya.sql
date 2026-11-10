-- Registration SMS in Bisaya, including the serial number and portal instructions.
create or replace function public.queue_registration_sms()
returns trigger language plpgsql security definer set search_path=public as $$
declare mother public.pregnant_mothers;
begin
  select * into strict mother from public.pregnant_mothers where id=new.mother_id;
  if mother.created_at is distinct from transaction_timestamp() or mother.registered_by is distinct from new.actor_id then
    return new;
  end if;
  insert into public.maternal_sms_events(event_key,pregnant_mother_id,message,message_type,created_by)
  values('registration:'||mother.id,mother.id,
    'Maayong adlaw! Nakarehistro na kaymo sa Barangay Sankanan Health Center. Ang inyong record number mao ang '||mother.serial_no||'. Aron makasud sa inyong dashboard, palihug create og account ug isulod ang record number ug ang inyong contact number. Salamat!',
    'care_message',new.actor_id) on conflict(event_key,pregnant_mother_id) do nothing;
  return new;
end;
$$;
revoke all on function public.queue_registration_sms() from public,anon,authenticated;

-- Queued-but-unsubmitted registration SMS get the same new wording.
update public.maternal_sms_events e set message=
  'Maayong adlaw! Nakarehistro na kaymo sa Barangay Sankanan Health Center. Ang inyong record number mao ang '||m.serial_no||'. Aron makasud sa inyong dashboard, palihug create og account ug isulod ang record number ug ang inyong contact number. Salamat!'
from public.pregnant_mothers m where e.pregnant_mother_id=m.id and e.event_key='registration:'||m.id
  and not exists(select 1 from public.sms_dispatch_claims c
    where c.dedupe_key='event:'||e.event_key||':'||e.pregnant_mother_id and c.state in ('reserved','accepted','unknown'));

notify pgrst,'reload schema';
