-- Keep the legacy entry point without allowing patient notifications.
create or replace function public.send_zone_program(zone_value text,program_value integer,revision_value text) returns jsonb
language plpgsql security definer set search_path=public as $$
begin
  raise exception 'Program suggestions are for BHW review only. Patient notifications are disabled.' using errcode='42501';
end;
$$;

revoke all on function public.send_zone_program(text,integer,text) from public,anon,authenticated,service_role;
notify pgrst,'reload schema';
