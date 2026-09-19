-- Non-destructive. Turns RLS on for every table in `public` that does not have it.
--
-- Why: the anon key is public by design, so any `public` table with RLS off is readable and writable
-- by anyone who has the project URL. The pre-rebuild app never enabled RLS, and tables it left behind
-- (prompt_templates, source_pool, test_cases) were still open.
--
-- Effect: RLS on + no policies = anon and authenticated can do nothing with the table. No rows are
-- touched and nothing is dropped; the data stays readable from the SQL editor. Reversible with
-- `alter table <name> disable row level security;` (don't). Safe to re-run at any time.
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' and not rowsecurity loop
    execute format('alter table public.%I enable row level security', t);
    raise notice 'RLS enabled on public.%', t;
  end loop;
end $$;

-- What is in `public` now, and its protection. "locked" is correct for tables the app does not use.
select c.relname as "table",
       case when not c.relrowsecurity then 'EXPOSED: RLS off'
            when count(p.polname) = 0 then 'locked (RLS on, no policies: app roles have no access)'
            else 'RLS on, ' || count(p.polname) || ' policies' end as protection
from pg_class c left join pg_policy p on p.polrelid = c.oid
where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
group by c.relname, c.relrowsecurity order by 2, 1;
