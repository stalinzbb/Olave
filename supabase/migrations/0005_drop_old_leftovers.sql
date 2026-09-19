-- DESTRUCTIVE (owner's decision, 2026-09-18: the old data is not wanted).
-- Drops tables left behind by the pre-rebuild apps. None of these names is used by the current schema,
-- so this is safe to run on top of 0001–0004. It does not touch evals, runs, datasets or anything current.
drop table if exists prompt_templates, source_pool, test_cases,
  ratings, variant_results, app_settings, workspace_settings;

-- What remains in `public`, and its protection. Nothing should say EXPOSED.
select c.relname as "table",
       case when not c.relrowsecurity then 'EXPOSED: RLS off, run 0004_lock_unprotected_tables.sql'
            when count(p.polname) = 0 then 'locked (RLS on, no policies)'
            else 'RLS on, ' || count(p.polname) || ' policies' end as protection
from pg_class c left join pg_policy p on p.polrelid = c.oid
where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
group by c.relname, c.relrowsecurity order by 2, 1;
