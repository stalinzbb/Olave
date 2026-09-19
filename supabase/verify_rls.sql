-- Read-only check of the RLS setup. Paste into the Supabase SQL editor and run: it changes nothing
-- (everything happens inside a transaction that is rolled back). Every row should say "ok".
begin;

create temp table rls_check (test text, result text) on commit drop;
grant all on rls_check to authenticated, anon;

-- A) every app table has RLS on and at least one policy
insert into rls_check
select 'rls on + policy: ' || c.relname,
       case when c.relrowsecurity and count(p.polname) > 0 then 'ok' else 'FAIL' end
from pg_class c left join pg_policy p on p.polrelid = c.oid
where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
group by c.relname, c.relrowsecurity;

-- B) not signed in: sees nothing
set local role anon;
insert into rls_check select 'anon sees no evals', case when (select count(*) from evals) = 0 then 'ok' else 'FAIL' end;
insert into rls_check select 'anon sees no models', case when (select count(*) from models) = 0 then 'ok' else 'FAIL' end;
reset role;

-- C) signed in but NOT a member (a made-up user id): sees nothing, cannot insert
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-00000000dead","role":"authenticated"}';
insert into rls_check select 'stranger sees no evals', case when (select count(*) from evals) = 0 then 'ok' else 'FAIL' end;
insert into rls_check select 'stranger sees no cells', case when (select count(*) from cells) = 0 then 'ok' else 'FAIL' end;
insert into rls_check select 'stranger sees no members', case when (select count(*) from members) = 0 then 'ok' else 'FAIL' end;
do $$ begin
  insert into evals (name) values ('stranger was here');
  insert into rls_check values ('stranger cannot insert an eval', 'FAIL');
exception when insufficient_privilege then
  insert into rls_check values ('stranger cannot insert an eval', 'ok');
end $$;
reset role;

-- D) a real member: sees data, but version tables are append-only
do $$
declare member_id uuid := (select user_id from public.members limit 1);
declare n int;
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', member_id, 'role', 'authenticated')::text, true);
  insert into rls_check select 'member sees evals', case when (select count(*) from evals) > 0 then 'ok' else 'FAIL (or you have no evals yet)' end;
  update eval_versions set version = version where true;   get diagnostics n = row_count;
  insert into rls_check values ('member cannot update eval_versions', case when n = 0 then 'ok' else 'FAIL' end);
  update grader_versions set version = version where true; get diagnostics n = row_count;
  insert into rls_check values ('member cannot update grader_versions', case when n = 0 then 'ok' else 'FAIL' end);
  delete from eval_versions where true;                    get diagnostics n = row_count;
  insert into rls_check values ('member cannot delete eval_versions', case when n = 0 then 'ok' else 'FAIL' end);
  perform set_config('role', 'postgres', true);
end $$;
reset role;

select * from rls_check order by (result = 'ok'), test;
rollback;
