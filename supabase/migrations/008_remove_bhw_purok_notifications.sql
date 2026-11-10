-- Remove BHW purok role from notification system
-- BHW purok users should not receive notifications
-- Keep notifications for Admin, Nurse, BHW Head, and Pregnant Mother
-- Update RLS policies to exclude bhw_purok role
drop policy if exists "staff can read notifications" on public.maternal_notifications;
create policy "staff can read notifications"
  on public.maternal_notifications for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'nurse', 'bhw_head')));

drop policy if exists "staff can create notifications" on public.maternal_notifications;
create policy "staff can create notifications"
  on public.maternal_notifications for insert to authenticated
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'nurse', 'bhw_head')));

drop policy if exists "roles can mark their notifications read" on public.maternal_notifications;
create policy "roles can mark their notifications read"
  on public.maternal_notifications for update to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = maternal_notifications.recipient_role))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = maternal_notifications.recipient_role));
-- Clean up existing notifications that were sent to bhw_purok role
delete from public.maternal_notifications
where recipient_role = 'bhw_purok';
