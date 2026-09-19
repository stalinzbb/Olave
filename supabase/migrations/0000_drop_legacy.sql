-- DESTRUCTIVE, and ONLY for a project that still has the pre-rebuild tables and has NOT yet run
-- 0001_rebuild.sql. The old app used the names `runs`, `evals` and `datasets`, which the new schema
-- reuses, so running this after 0001 would delete the new data. The guard below refuses to do that.
-- Run it yourself, once, after exporting anything you want to keep.
do $$
begin
  if to_regclass('public.eval_versions') is not null then
    raise exception 'Refusing to run: the new schema is installed (eval_versions exists). This script would drop your current evals, runs and datasets. To remove only old leftovers use 0005_drop_old_leftovers.sql.';
  end if;
  drop table if exists ratings, variant_results, runs, evals, datasets, app_settings, workspace_settings,
    test_cases, prompt_templates, source_pool cascade;
end $$;
