-- Reject callers whose active administrator predicate is false or unknown.
create or replace function public.admin_dashboard_summary() returns jsonb
language plpgsql stable security definer set search_path=public as $$
begin
  if public.is_admin() is not true then raise exception 'Administrator access required'; end if;
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
