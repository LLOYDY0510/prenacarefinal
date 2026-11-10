-- Browser edits cannot approve or mark deliveries as sent.
revoke update on public.tip_broadcasts from authenticated;
grant update(content) on public.tip_broadcasts to authenticated;
revoke update on public.tip_broadcast_recipients from authenticated;
create or replace function public.complete_tip_broadcast(broadcast_uuid uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform 1 from public.tip_broadcasts where id = broadcast_uuid and status = 'approved' for update;
  if not found then raise exception 'Broadcast is not approved'; end if;
  if exists (select 1 from public.tip_broadcast_recipients r where r.broadcast_id = broadcast_uuid
    and not exists (select 1 from public.maternal_notifications n
      where n.event_key = 'health-tip:' || broadcast_uuid::text || ':' || r.pregnant_mother_id::text)) then
    raise exception 'Recipient notifications are incomplete'; end if;
  update public.tip_broadcast_recipients set sent = true, sent_at = now() where broadcast_id = broadcast_uuid;
  update public.tip_broadcasts set status = 'sent', sent_at = now() where id = broadcast_uuid;
end;
$$;
revoke all on function public.complete_tip_broadcast(uuid) from public,authenticated,anon;
grant execute on function public.complete_tip_broadcast(uuid) to service_role;
notify pgrst, 'reload schema';
