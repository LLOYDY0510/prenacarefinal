-- Apply only after approval of the target inventory and serial mapping.
lock table public.pregnant_mothers in access exclusive mode;
create table public.maternal_serial_2026_backup (
  pregnant_mother_id uuid primary key,
  old_serial text,
  new_serial text not null unique,
  original_record jsonb not null,
  backed_up_at timestamptz not null default now()
);
alter table public.maternal_serial_2026_backup enable row level security;
revoke all on public.maternal_serial_2026_backup from public,anon,authenticated;
grant select on public.maternal_serial_2026_backup to service_role;
create table public.maternal_serial_2026_sequence_backup as
select last_value,is_called from public.maternal_serial_sequence;
alter table public.maternal_serial_2026_sequence_backup enable row level security;
revoke all on public.maternal_serial_2026_sequence_backup from public,anon,authenticated;
grant select on public.maternal_serial_2026_sequence_backup to service_role;

insert into public.maternal_serial_2026_backup(pregnant_mother_id,old_serial,new_serial,original_record)
select id,serial_no,'SPM-2026-'||lpad(position::text,greatest(4,length(position::text)),'0'),original_record
from (select id,serial_no,to_jsonb(m) original_record,
  row_number() over(order by date_registered asc nulls last,created_at asc nulls last,id asc) position
  from public.pregnant_mothers m) ordered;

do $$
begin
  if exists(select 1 from public.pregnant_mothers m join public.maternal_serial_2026_backup b
    on m.serial_no='__spm_2026_renumber__'||b.pregnant_mother_id::text) then
    raise exception 'Temporary serial collision; no renumbering performed';
  end if;
end;
$$;
update public.pregnant_mothers m set serial_no='__spm_2026_renumber__'||m.id::text
from public.maternal_serial_2026_backup b where m.id=b.pregnant_mother_id;
update public.pregnant_mothers m set serial_no=b.new_serial
from public.maternal_serial_2026_backup b where m.id=b.pregnant_mother_id;

do $$
begin
  if exists(select 1 from public.maternal_serial_2026_backup b
    left join public.pregnant_mothers m on m.id=b.pregnant_mother_id
    where m.id is null or m.serial_no is distinct from b.new_serial
      or (to_jsonb(m)-'serial_no') is distinct from (b.original_record-'serial_no')) then
    raise exception 'Serial renumbering failed preservation verification';
  end if;
end;
$$;
-- Unsubmitted confirmations must reference the corrected serial.
update public.maternal_sms_events e set message=
  'You are registered with the maternal care program. Your record number is '||m.serial_no||'. Please contact your BHW for prenatal care assistance.'
from public.pregnant_mothers m where e.pregnant_mother_id=m.id and e.event_key='registration:'||m.id
  and not exists(select 1 from public.sms_dispatch_claims c
    where c.dedupe_key='event:'||e.event_key||':'||e.pregnant_mother_id and c.state in ('reserved','accepted','unknown'));

-- Keep SPM and the existing global sequence/year convention.
select setval('public.maternal_serial_sequence',greatest(1,count(*)),count(*)>0)
from public.pregnant_mothers;
