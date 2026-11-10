-- Patient accounts stay pending after record linking; an admin/midwife
-- activates them from User Management. Linking still assigns the maternal
-- record and official name so activation is one click.
create or replace function public.link_maternal_account(account_uuid uuid,mother_uuid uuid)
returns setof public.profiles language plpgsql security definer set search_path=public as $$
declare account public.profiles; mother public.pregnant_mothers;
begin
  select * into account from public.profiles where id=account_uuid for update;
  if not found or account.account_status<>'pending' or account.role<>'patient' or account.pregnant_mother_id is not null then raise exception 'Account is already assigned'; end if;
  select * into mother from public.pregnant_mothers where id=mother_uuid;
  if not found then raise exception 'Record not found'; end if;
  return query update public.profiles set pregnant_mother_id=mother_uuid,
    full_name=mother.full_name,purok=null where id=account_uuid returning *;
end;
$$;
revoke all on function public.link_maternal_account(uuid,uuid) from public,authenticated,anon;
grant execute on function public.link_maternal_account(uuid,uuid) to service_role;
notify pgrst,'reload schema';
