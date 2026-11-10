-- Hosted default grants must not expose internal functions to browser roles.
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on all functions in schema public to service_role;
grant execute on function public.current_user_role(), public.current_user_purok(),
  public.current_mother_id(), public.is_clinical_staff(), public.is_care_staff(),
  public.is_admin(), public.can_access_mother(uuid), public.can_manage_mother(uuid),
  public.can_access_notification(uuid,text,uuid), public.sms_receipt_visible_to(uuid,uuid),
  public.mark_notification_read(uuid) to authenticated;

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from public, anon, authenticated;
grant all on all sequences in schema public to service_role;

alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated;
alter default privileges for role postgres in schema public
  grant execute on functions to service_role;
alter default privileges for role postgres in schema public
  revoke all on tables from anon;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated;

notify pgrst, 'reload schema';
