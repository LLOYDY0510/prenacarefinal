-- Associate each prenatal schedule with one trimester without changing existing schedules.

alter table public.prenatal_schedules
  add column if not exists trimester text;

alter table public.prenatal_schedules
  drop constraint if exists prenatal_schedules_trimester_check;
alter table public.prenatal_schedules
  add constraint prenatal_schedules_trimester_check
  check (trimester is null or trimester in ('1st', '2nd', '3rd'));

create index if not exists prenatal_schedules_trimester_date_idx
  on public.prenatal_schedules(trimester, visit_date);
