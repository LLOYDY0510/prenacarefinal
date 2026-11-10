-- Allow authenticated care staff to manage prenatal checkup records.

alter table public.prenatal_checkups enable row level security;

drop policy if exists "care staff can read prenatal checkups" on public.prenatal_checkups;
create policy "care staff can read prenatal checkups"
  on public.prenatal_checkups
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and (
          p.role in ('admin', 'nurse', 'bhw_head')
          or (
            p.role = 'bhw_purok'
            and exists (
              select 1
              from public.pregnant_mothers m
              where m.id = prenatal_checkups.pregnant_mother_id
                and m.purok = p.purok
            )
          )
        )
    )
    or exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'pregnant_mother'
        and p.pregnant_mother_id = prenatal_checkups.pregnant_mother_id
    )
  );

drop policy if exists "care staff can insert prenatal checkups" on public.prenatal_checkups;
create policy "care staff can insert prenatal checkups"
  on public.prenatal_checkups
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and (
          p.role in ('admin', 'nurse', 'bhw_head')
          or (
            p.role = 'bhw_purok'
            and exists (
              select 1
              from public.pregnant_mothers m
              where m.id = prenatal_checkups.pregnant_mother_id
                and m.purok = p.purok
            )
          )
        )
    )
    and (recorded_by is null or recorded_by = auth.uid())
  );

drop policy if exists "care staff can update prenatal checkups" on public.prenatal_checkups;
create policy "care staff can update prenatal checkups"
  on public.prenatal_checkups
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and (
          p.role in ('admin', 'nurse', 'bhw_head')
          or (
            p.role = 'bhw_purok'
            and exists (
              select 1
              from public.pregnant_mothers m
              where m.id = prenatal_checkups.pregnant_mother_id
                and m.purok = p.purok
            )
          )
        )
    )
  )
  with check (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and (
          p.role in ('admin', 'nurse', 'bhw_head')
          or (
            p.role = 'bhw_purok'
            and exists (
              select 1
              from public.pregnant_mothers m
              where m.id = prenatal_checkups.pregnant_mother_id
                and m.purok = p.purok
            )
          )
        )
    )
  );

drop policy if exists "care staff can delete prenatal checkups" on public.prenatal_checkups;
create policy "care staff can delete prenatal checkups"
  on public.prenatal_checkups
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and (
          p.role in ('admin', 'nurse', 'bhw_head')
          or (
            p.role = 'bhw_purok'
            and exists (
              select 1
              from public.pregnant_mothers m
              where m.id = prenatal_checkups.pregnant_mother_id
                and m.purok = p.purok
            )
          )
        )
    )
  );
