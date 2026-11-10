-- Keep clinical actor references after deleting a login.
do $$
declare relation record; columns_sql text;
begin
  for relation in select c.conname,c.conrelid,c.confrelid,c.conkey,c.confkey from pg_constraint c
    where c.contype='f' and c.confrelid in('auth.users'::regclass,'public.profiles'::regclass) and c.conrelid<>'public.profiles'::regclass
      and c.conrelid in(select oid from pg_class where relnamespace='public'::regnamespace) loop
    select string_agg(quote_ident(attname),',') into columns_sql from pg_attribute
      where attrelid=relation.conrelid and attnum=any(relation.conkey);
    execute format('alter table %s drop constraint %I',relation.conrelid::regclass,relation.conname);
    execute format('alter table %s add constraint %I foreign key(%s) references %s(id) on delete set null',relation.conrelid::regclass,relation.conname,columns_sql,relation.confrelid::regclass);
  end loop;
end;
$$;

create or replace function public.sync_profile_email() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  update public.profiles set email=new.email where id=new.id;
  return new;
end;
$$;
create trigger sync_profile_email after update of email on auth.users for each row execute function public.sync_profile_email();
revoke all on function public.sync_profile_email() from public,anon,authenticated;

create or replace function public.admin_dashboard_summary() returns jsonb
language plpgsql stable security definer set search_path=public as $$
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  return jsonb_build_object(
    'total_users',(select count(*) from public.profiles),
    'patients',(select count(*) from public.profiles where role='patient'),
    'nurses',(select count(*) from public.profiles where role='nurse'),
    'bhws',(select count(*) from public.profiles where role='bhw'),
    'high_risk',(select count(*) from public.pregnant_mothers where risk_level='high'),
    'low_risk',(select count(*) from public.pregnant_mothers where risk_level='low'),
    'delivered',(select count(*) from(select distinct provider,provider_message_id,contact_number
      from public.sms_recipient_receipts where provider_status='delivered' and provider_message_id is not null) messages),
    'activities',(select jsonb_agg(jsonb_build_object('day',day::date,'count',total) order by day)
      from(select day,count(a.id) as total from generate_series(
        (now() at time zone 'Asia/Manila')::date-6,(now() at time zone 'Asia/Manila')::date,'1 day') day
        left join public.activity_logs a on (a.occurred_at at time zone 'Asia/Manila')::date=day::date group by day) counts)
  );
end;
$$;
revoke all on function public.admin_dashboard_summary() from public,anon,authenticated;
grant execute on function public.admin_dashboard_summary() to authenticated;
notify pgrst,'reload schema';
