-- Separate account approval from the four application roles.
alter table public.profiles add column account_status text not null default 'pending'
  check(account_status in ('pending','active','disabled'));
alter table public.profiles add column access_all_zones boolean not null default false;
alter table public.profiles add column can_manage_bhw boolean not null default false;
alter table public.profiles drop constraint profiles_role_check;
update public.profiles set account_status=case when role='pending' then 'pending' else 'active' end,
  access_all_zones=(role='bhw_head'), can_manage_bhw=(role='bhw_head'),
  role=case role when 'pregnant_mother' then 'patient' when 'pending' then 'patient'
    when 'bhw_head' then 'bhw' when 'bhw_purok' then 'bhw' else role end;
alter table public.profiles alter column role set default 'patient';
alter table public.profiles add constraint profiles_role_check check(role in ('patient','nurse','bhw','admin'));

-- Keep existing policy and trigger entry points on canonical role values.
do $$
declare routine record; definition text;
begin
  for routine in select p.oid from pg_proc p where p.pronamespace='public'::regnamespace loop
    definition:=pg_get_functiondef(routine.oid);
    definition:=replace(replace(replace(definition,'''pregnant_mother''','''patient'''),'''bhw_purok''','''bhw'''),'''bhw_head''','''bhw''');
    execute definition;
  end loop;
end;
$$;

-- Convert literal role checks in existing policies as well as helpers.
do $$
declare rule record; expression text; checks text;
begin
  for rule in select polname,polrelid,pg_get_expr(polqual,polrelid) as q,
    pg_get_expr(polwithcheck,polrelid) as c from pg_policy
    where polrelid in(select oid from pg_class where relnamespace='public'::regnamespace) loop
    expression:=replace(replace(replace(rule.q,'''pregnant_mother''','''patient'''),'''bhw_purok''','''bhw'''),'''bhw_head''','''bhw''');
    checks:=replace(replace(replace(rule.c,'''pregnant_mother''','''patient'''),'''bhw_purok''','''bhw'''),'''bhw_head''','''bhw''');
    if expression is distinct from rule.q then execute format('alter policy %I on %s using (%s)',rule.polname,rule.polrelid::regclass,expression); end if;
    if checks is distinct from rule.c then execute format('alter policy %I on %s with check (%s)',rule.polname,rule.polrelid::regclass,checks); end if;
  end loop;
end;
$$;

create or replace function public.current_user_role() returns text
language sql stable security definer set search_path=public as $$
  select role from public.profiles where id=auth.uid() and account_status='active';
$$;
create or replace function public.is_clinical_staff() returns boolean
language sql stable security definer set search_path=public as $$
  select coalesce(public.current_user_role() in ('admin','nurse'),false);
$$;
create or replace function public.is_care_staff() returns boolean
language sql stable security definer set search_path=public as $$
  select coalesce(public.current_user_role() in ('nurse','bhw'),false);
$$;
create or replace function public.can_access_mother(mother_id uuid) returns boolean
language sql stable security definer set search_path=public as $$
  select coalesce(public.is_clinical_staff() or
    (public.current_user_role()='bhw' and exists(select 1 from public.pregnant_mothers m
      join public.profiles p on p.id=auth.uid() where m.id=mother_id
        and (p.access_all_zones or (p.purok is not null and p.purok=m.purok)))) or
    (public.current_user_role()='patient' and public.current_mother_id()=mother_id),false);
$$;
create or replace function public.can_manage_mother(mother_id uuid) returns boolean
language sql stable security definer set search_path=public as $$
  select public.current_user_role()='bhw' and public.can_access_mother(mother_id);
$$;
create or replace function public.can_record_care(mother_id uuid) returns boolean
language sql stable security definer set search_path=public as $$
  select public.current_user_role()='nurse' or public.can_manage_mother(mother_id);
$$;
revoke all on function public.can_record_care(uuid) from public,anon,authenticated;
grant execute on function public.can_record_care(uuid) to authenticated,service_role;

alter policy mothers_insert on public.pregnant_mothers with check(
  public.current_user_role()='bhw' and exists(select 1 from public.profiles p where p.id=(select auth.uid())
    and (p.access_all_zones or (p.purok is not null and p.purok=pregnant_mothers.purok))));
alter policy mothers_update on public.pregnant_mothers using(public.can_manage_mother(id))
  with check(public.current_user_role()='bhw' and exists(select 1 from public.profiles p where p.id=(select auth.uid())
    and (p.access_all_zones or (p.purok is not null and p.purok=pregnant_mothers.purok))));
alter policy mothers_delete on public.pregnant_mothers using(false);

-- Clinical notices require nurse review; reminder evidence is server-owned.
alter policy notifications_insert on public.maternal_notifications with check(
  public.current_user_role()='nurse' or (public.current_user_role()='admin' and category='system'));
revoke insert,update,delete on public.prenatal_schedule_reminders from authenticated;

-- Preserve clinical editing separately from registry editing.
do $$
declare rule record; expression text; check_expression text;
begin
  for rule in select polname,polrelid,pg_get_expr(polqual,polrelid) as q,
    pg_get_expr(polwithcheck,polrelid) as c from pg_policy
    where polrelid in ('public.prenatal_checkups'::regclass,'public.maternal_health_history'::regclass,
      'public.maternal_referrals'::regclass,'public.prenatal_follow_ups'::regclass) loop
    expression:=replace(rule.q,'can_manage_mother(','can_record_care(');
    check_expression:=replace(rule.c,'can_manage_mother(','can_record_care(');
    if expression is distinct from rule.q then execute format('alter policy %I on %s using (%s)',rule.polname,rule.polrelid::regclass,expression); end if;
    if check_expression is distinct from rule.c then execute format('alter policy %I on %s with check (%s)',rule.polname,rule.polrelid::regclass,check_expression); end if;
  end loop;
end;
$$;

create or replace function public.provision_profile() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  insert into public.profiles(id,email,full_name,role,account_status)
  values(new.id,new.email,new.raw_user_meta_data->>'full_name','patient','pending') on conflict(id) do nothing;
  return new;
end;
$$;
create or replace function public.link_maternal_account(account_uuid uuid,mother_uuid uuid)
returns setof public.profiles language plpgsql security definer set search_path=public as $$
declare account public.profiles; mother public.pregnant_mothers;
begin
  select * into account from public.profiles where id=account_uuid for update;
  if not found or account.account_status<>'pending' or account.role<>'patient' or account.pregnant_mother_id is not null then raise exception 'Account is already assigned'; end if;
  select * into mother from public.pregnant_mothers where id=mother_uuid;
  if not found then raise exception 'Record not found'; end if;
  return query update public.profiles set account_status='active',pregnant_mother_id=mother_uuid,
    full_name=mother.full_name,purok=null where id=account_uuid returning *;
end;
$$;
update public.maternal_notifications set recipient_role=case recipient_role when 'bhw_head' then 'bhw'
  when 'bhw_purok' then 'bhw' when 'pregnant_mother' then 'patient' else recipient_role end;

-- Keep advice text independent of the clinical matching rule.
alter table public.risk_indicators add column advice_message text check(length(advice_message)<=5000);
alter table public.sms_logs add column provider text not null default 'semaphore';
alter table public.sms_recipient_receipts add column provider text not null default 'semaphore';
alter table public.sms_recipient_receipts add column device_id text;

-- Serialize account role/status updates to protect the last active administrator.
create or replace function public.protect_last_admin() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  perform pg_advisory_xact_lock(734201);
  if old.role='admin' and old.account_status='active' and
    (tg_op='DELETE' or new.role<>'admin' or new.account_status<>'active') and
    not exists(select 1 from public.profiles where id<>old.id and role='admin' and account_status='active') then
    raise exception 'The last active administrator cannot be removed';
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;
create trigger protect_last_admin before update or delete on public.profiles for each row execute function public.protect_last_admin();
revoke all on function public.protect_last_admin() from public,anon,authenticated;
notify pgrst,'reload schema';

-- Disabled and unapproved accounts cannot use stale links or direct notices.
create or replace function public.current_mother_id() returns uuid
language sql stable security definer set search_path=public as $$
  select pregnant_mother_id from public.profiles where id=auth.uid() and role='patient' and account_status='active';
$$;
create or replace function public.current_user_purok() returns text
language sql stable security definer set search_path=public as $$
  select purok from public.profiles where id=auth.uid() and role='bhw' and account_status='active';
$$;
create or replace function public.can_access_notification(row_recipient_user_id uuid,row_recipient_role text,row_mother_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select public.current_user_role() is not null and (
    row_recipient_user_id=auth.uid()
    or(row_recipient_user_id is null and public.is_clinical_staff() and (row_recipient_role is null or row_recipient_role=public.current_user_role()))
    or(public.current_user_role()='patient' and row_mother_id=public.current_mother_id()));
$$;
