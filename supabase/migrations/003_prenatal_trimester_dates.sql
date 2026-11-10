-- Preserve legacy checkup data while separating scheduled and actual visit dates.

alter table public.pregnant_mothers
  add column if not exists checkup_recorded boolean not null default false;

alter table public.prenatal_checkups
  add column if not exists scheduled_checkup_date date,
  add column if not exists actual_checkup_date date;

update public.prenatal_checkups
set scheduled_checkup_date = coalesce(scheduled_checkup_date, scheduled_for, checkup_date),
    actual_checkup_date = coalesce(
      actual_checkup_date,
      case when status = 'completed' then checkup_date else null end
    )
where scheduled_checkup_date is null
   or (status = 'completed' and actual_checkup_date is null);

create or replace function public.sync_pregnant_mother_checkup_recorded()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    update public.pregnant_mothers
    set checkup_recorded = exists (
      select 1
      from public.prenatal_checkups pc
      where pc.pregnant_mother_id = old.pregnant_mother_id
        and pc.actual_checkup_date is not null
    )
    where id = old.pregnant_mother_id;
    return old;
  end if;

  update public.pregnant_mothers
  set checkup_recorded = exists (
    select 1
    from public.prenatal_checkups pc
    where pc.pregnant_mother_id = coalesce(new.pregnant_mother_id, old.pregnant_mother_id)
      and pc.actual_checkup_date is not null
  )
  where id = coalesce(new.pregnant_mother_id, old.pregnant_mother_id);
  return new;
end;
$$;

drop trigger if exists sync_pregnant_mother_checkup_recorded
  on public.prenatal_checkups;
create trigger sync_pregnant_mother_checkup_recorded
after insert or update or delete on public.prenatal_checkups
for each row execute function public.sync_pregnant_mother_checkup_recorded();

update public.pregnant_mothers pm
set checkup_recorded = exists (
  select 1
  from public.prenatal_checkups pc
  where pc.pregnant_mother_id = pm.id
    and pc.actual_checkup_date is not null
);

create index if not exists prenatal_checkups_trimester_date_idx
  on public.prenatal_checkups(pregnant_mother_id, trimester, scheduled_checkup_date);
