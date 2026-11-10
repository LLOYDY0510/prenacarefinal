-- Preserve the existing read union while separating mutation policies.
do $$
declare target record; rule record; read_name text; read_condition text;
begin
  for target in
    select polrelid from pg_policy
    where polrelid in (select oid from pg_class where relnamespace='public'::regnamespace)
      and polpermissive and polroles=array['authenticated'::regrole::oid]
      and polcmd in ('r','*')
    group by polrelid having count(*) > 1
  loop
    select min(polname::text) filter(where polcmd='r'),
      string_agg('(' || coalesce(pg_get_expr(polqual,polrelid),'true') || ')',' or ' order by polname)
    into read_name, read_condition from pg_policy
    where polrelid=target.polrelid and polpermissive
      and polroles=array['authenticated'::regrole::oid] and polcmd in ('r','*');

    for rule in select polname,polcmd,pg_get_expr(polqual,polrelid) as condition,
      pg_get_expr(polwithcheck,polrelid) as check_condition
      from pg_policy where polrelid=target.polrelid and polpermissive
        and polroles=array['authenticated'::regrole::oid] and polcmd in ('r','*')
    loop
      execute format('drop policy %I on %s',rule.polname,target.polrelid::regclass);
      if rule.polcmd='*' then
        execute format('create policy %I on %s for insert to authenticated with check (%s)',
          rule.polname || '_insert',target.polrelid::regclass,coalesce(rule.check_condition,rule.condition,'true'));
        execute format('create policy %I on %s for update to authenticated using (%s) with check (%s)',
          rule.polname || '_update',target.polrelid::regclass,coalesce(rule.condition,'true'),coalesce(rule.check_condition,rule.condition,'true'));
        execute format('create policy %I on %s for delete to authenticated using (%s)',
          rule.polname || '_delete',target.polrelid::regclass,coalesce(rule.condition,'true'));
      end if;
    end loop;
    execute format('create policy %I on %s for select to authenticated using (%s)',
      read_name,target.polrelid::regclass,read_condition);
  end loop;
end;
$$;

-- Resolve the authenticated identity once per statement in row policies.
do $$
declare rule record; changes text;
begin
  for rule in select polname,polrelid,pg_get_expr(polqual,polrelid) as condition,
    pg_get_expr(polwithcheck,polrelid) as check_condition from pg_policy
    where polrelid in (select oid from pg_class where relnamespace='public'::regnamespace)
  loop
    changes := '';
    if rule.condition like '%auth.uid()%' then
      changes := format(' using (%s)',replace(rule.condition,'auth.uid()','(select auth.uid())'));
    end if;
    if rule.check_condition like '%auth.uid()%' then
      changes := changes || format(' with check (%s)',replace(rule.check_condition,'auth.uid()','(select auth.uid())'));
    end if;
    if changes <> '' then
      execute format('alter policy %I on %s%s',rule.polname,rule.polrelid::regclass,changes);
    end if;
  end loop;
end;
$$;

-- Remove redundant indexes while preserving constraint-backed uniqueness.
do $$
declare index_name text; index_id regclass;
begin
  foreach index_name in array array['prenatal_follow_ups_schedule_mother_unique',
    'prenatal_schedule_recipients_unique','prenatal_schedule_recipients_unique_mother']
  loop
    index_id := to_regclass('public.' || index_name);
    if index_id is not null and not exists(select 1 from pg_constraint where conindid=index_id) then
      execute format('drop index %s',index_id);
    end if;
  end loop;
end;
$$;

-- Index foreign keys not already covered by a leading nonpartial index.
do $$
declare relation record; columns_sql text;
begin
  for relation in select c.conname,c.conrelid,c.conkey from pg_constraint c
    join pg_class t on t.oid=c.conrelid
    where c.contype='f' and t.relnamespace='public'::regnamespace
      and not exists(select 1 from pg_index i where i.indrelid=c.conrelid
        and i.indisvalid and i.indpred is null
        and array(select k from unnest(i.indkey::smallint[]) with ordinality x(k,position)
          where position <= cardinality(c.conkey) order by position)=c.conkey)
  loop
    select string_agg(quote_ident(a.attname),',' order by k.position) into columns_sql
    from unnest(relation.conkey) with ordinality k(number,position)
    join pg_attribute a on a.attrelid=relation.conrelid and a.attnum=k.number;
    execute format('create index %I on %s (%s)',left(relation.conname,55) || '_idx',
      relation.conrelid::regclass,columns_sql);
  end loop;
end;
$$;

notify pgrst, 'reload schema';
