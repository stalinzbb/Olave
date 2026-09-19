-- DESTRUCTIVE: removes the pre-rebuild jsonb tables (their names collide with the new schema).
-- Run this yourself, once, only after exporting anything you want to keep.
drop table if exists ratings, variant_results, runs, evals, datasets, app_settings, workspace_settings,
  test_cases, prompt_templates, source_pool cascade; -- the last three are from the even older fundraiser app
