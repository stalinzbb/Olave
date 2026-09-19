-- Self-check of the RLS setup for the Supabase SQL editor. Every row should say "ok".
--
-- It creates one helper function, calls it, and drops it. It leaves your data untouched: the two
-- write attempts it makes are each rolled back inside the function even if a policy is broken.
-- (No temp tables or BEGIN/ROLLBACK: the SQL editor does not keep a script on a single connection.)

create or replace function public.verify_rls() returns table (test text, result text)
language plpgsql as $fn$
declare
  member_id uuid := (select user_id from public.members limit 1);
  stranger  constant text := '{"sub":"00000000-0000-4000-8000-00000000dead","role":"authenticated"}';
  n int;
  inserted boolean;
begin
  -- A) every table in public has RLS on and at least one policy
  return query
    select 'rls on + policy: ' || c.relname::text,
           case when c.relrowsecurity and count(p.polname) > 0 then 'ok' else 'FAIL' end
    from pg_class c left join pg_policy p on p.polrelid = c.oid
    where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
    group by c.relname, c.relrowsecurity;

  -- B) not signed in
  perform set_config('request.jwt.claims', '', true);
  perform set_config('role', 'anon', true);
  select count(*) into n from public.evals;   test := 'anon sees no evals';  result := case when n = 0 then 'ok' else 'FAIL' end; return next;
  select count(*) into n from public.models;  test := 'anon sees no models'; result := case when n = 0 then 'ok' else 'FAIL' end; return next;

  -- C) signed in, but not a member (a made-up user id)
  perform set_config('request.jwt.claims', stranger, true);
  perform set_config('role', 'authenticated', true);
  select count(*) into n from public.evals;   test := 'stranger sees no evals';   result := case when n = 0 then 'ok' else 'FAIL' end; return next;
  select count(*) into n from public.cells;   test := 'stranger sees no cells';   result := case when n = 0 then 'ok' else 'FAIL' end; return next;
  select count(*) into n from public.members; test := 'stranger sees no members'; result := case when n = 0 then 'ok' else 'FAIL' end; return next;
  inserted := false;
  begin
    insert into public.evals (name) values ('verify_rls probe');
    inserted := true;
    raise exception 'undo probe';           -- roll the probe row back even if a broken policy let it in
  exception when others then null;
  end;
  test := 'stranger cannot insert an eval'; result := case when inserted then 'FAIL' else 'ok' end; return next;

  -- D) a real member: can read, but version tables are append-only
  if member_id is null then
    perform set_config('role', 'postgres', true);
    test := 'members table has at least one member'; result := 'FAIL: run 0003_hardening.sql first'; return next;
    return;
  end if;
  perform set_config('request.jwt.claims', json_build_object('sub', member_id, 'role', 'authenticated')::text, true);
  select count(*) into n from public.evals;
  test := 'member sees evals'; result := case when n > 0 then 'ok' else 'ok (no evals exist yet)' end; return next;

  n := 0;
  begin
    update public.eval_versions set version = version;      get diagnostics n = row_count;
    raise exception 'undo probe';
  exception when others then null;
  end;
  test := 'member cannot update eval_versions'; result := case when n = 0 then 'ok' else 'FAIL' end; return next;

  n := 0;
  begin
    update public.grader_versions set version = version;    get diagnostics n = row_count;
    raise exception 'undo probe';
  exception when others then null;
  end;
  test := 'member cannot update grader_versions'; result := case when n = 0 then 'ok' else 'FAIL' end; return next;

  n := 0;
  begin
    delete from public.eval_versions;                       get diagnostics n = row_count;
    raise exception 'undo probe';           -- guarantees nothing is deleted, whatever the policies say
  exception when others then null;
  end;
  test := 'member cannot delete eval_versions'; result := case when n = 0 then 'ok' else 'FAIL' end; return next;

  perform set_config('role', 'postgres', true);
end $fn$;

-- The helper must never be callable by the app's roles.
revoke all on function public.verify_rls() from public, anon, authenticated;

select * from public.verify_rls() order by (result like 'ok%'), test;

drop function public.verify_rls();
