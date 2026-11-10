-- Persist message intent before the provider is contacted.
create table public.maternal_sms_events (
  event_key text not null,
  pregnant_mother_id uuid not null references public.pregnant_mothers(id) on delete cascade,
  broadcast_id uuid references public.tip_broadcasts(id) on delete cascade,
  message text not null,
  message_type text not null check (message_type in ('care_message','health_tip','nutrition_tip')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key(event_key,pregnant_mother_id)
);
alter table public.maternal_sms_events enable row level security;
revoke all on public.maternal_sms_events from public,anon,authenticated;
grant select,insert,update,delete on public.maternal_sms_events to service_role;
create index maternal_sms_events_broadcast on public.maternal_sms_events(broadcast_id);

create function public.queue_registration_sms()
returns trigger language plpgsql security definer set search_path=public as $$
declare mother public.pregnant_mothers;
begin
  select * into strict mother from public.pregnant_mothers where id=new.mother_id;
  if mother.created_at is distinct from transaction_timestamp() or mother.registered_by is distinct from new.actor_id then
    return new;
  end if;
  insert into public.maternal_sms_events(event_key,pregnant_mother_id,message,message_type,created_by)
  values('registration:'||mother.id,mother.id,
    'You are registered with the maternal care program. Your record number is '||mother.serial_no||'. Please contact your BHW for prenatal care assistance.',
    'care_message',new.actor_id) on conflict(event_key,pregnant_mother_id) do nothing;
  return new;
end;
$$;
revoke all on function public.queue_registration_sms() from public,anon,authenticated;
create trigger queue_registration_sms after insert on public.maternal_registration_requests
for each row execute function public.queue_registration_sms();

-- Freeze approved content and its recipients once dispatch begins.
create function public.prepare_tip_sms(broadcast_uuid uuid,actor_uuid uuid)
returns public.tip_broadcasts language plpgsql security definer set search_path=public as $$
declare batch public.tip_broadcasts;
begin
  select * into batch from public.tip_broadcasts where id=broadcast_uuid for update;
  if not found or batch.status not in ('approved','sent') then raise exception 'Approve the broadcast before dispatching'; end if;
  if not exists(select 1 from public.profiles where id=actor_uuid and role='nurse' and account_status='active') then
    raise exception 'Only an active nurse may dispatch tips' using errcode='42501';
  end if;
  if batch.status='sent' then
    if not exists(select 1 from public.maternal_sms_events where broadcast_id=batch.id) then
      raise exception 'This historical broadcast has no SMS dispatch to resume';
    end if;
    return batch;
  end if;
  if not exists(select 1 from public.tip_broadcast_recipients where broadcast_id=batch.id) then
    raise exception 'The broadcast has no recipients';
  end if;
  insert into public.maternal_sms_events(event_key,pregnant_mother_id,broadcast_id,message,message_type,created_by)
  select 'broadcast:'||batch.id,r.pregnant_mother_id,batch.id,batch.title||E'\n'||batch.content,'health_tip',actor_uuid
  from public.tip_broadcast_recipients r where r.broadcast_id=batch.id
  on conflict(event_key,pregnant_mother_id) do nothing;
  return batch;
end;
$$;
revoke all on function public.prepare_tip_sms(uuid,uuid) from public,anon,authenticated;
grant execute on function public.prepare_tip_sms(uuid,uuid) to service_role;

create function public.guard_tip_sms_content()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if (new.title is distinct from old.title or new.content is distinct from old.content)
    and exists(select 1 from public.maternal_sms_events where broadcast_id=old.id) then
    raise exception 'Dispatch has started; its approved content is immutable';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_tip_sms_content() from public,anon,authenticated;
create trigger guard_tip_sms_content before update on public.tip_broadcasts
for each row execute function public.guard_tip_sms_content();

create function public.guard_tip_sms_recipients()
returns trigger language plpgsql security definer set search_path=public as $$
declare batch_id uuid;
begin
  batch_id=case when tg_op='DELETE' then old.broadcast_id else new.broadcast_id end;
  perform 1 from public.tip_broadcasts where id=batch_id for update;
  if exists(select 1 from public.maternal_sms_events where broadcast_id=batch_id)
    and (tg_op<>'UPDATE' or new.broadcast_id is distinct from old.broadcast_id
      or new.pregnant_mother_id is distinct from old.pregnant_mother_id) then
    raise exception 'Dispatch has started; its recipients are immutable';
  end if;
  if tg_op='UPDATE' and new.broadcast_id is distinct from old.broadcast_id then
    perform 1 from public.tip_broadcasts where id=old.broadcast_id for update;
    if exists(select 1 from public.maternal_sms_events where broadcast_id=old.broadcast_id) then
      raise exception 'Dispatch has started; its recipients are immutable';
    end if;
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function public.guard_tip_sms_recipients() from public,anon,authenticated;
create trigger guard_tip_sms_recipients before insert or update or delete on public.tip_broadcast_recipients
for each row execute function public.guard_tip_sms_recipients();
notify pgrst,'reload schema';
