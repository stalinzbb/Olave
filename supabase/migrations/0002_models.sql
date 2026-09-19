-- The platform's model allowlist. Runs (and LLM judges) may only use models listed here,
-- which also caps what a run can cost. Ids are OpenRouter model ids.
create table models (
  id text primary key,
  is_default boolean not null default false,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

-- at most one default
create unique index models_one_default on models (is_default) where is_default;

alter table models enable row level security;
create policy models_authenticated on models for all to authenticated using (true) with check (true);

-- Cheap, non-reasoning starters (OpenRouter list prices per 1M tokens on 2026-09-18).
insert into models (id, is_default) values
  ('openai/gpt-4.1-nano', true),            -- $0.10 in / $0.40 out
  ('google/gemini-2.5-flash-lite', false),  -- $0.10 in / $0.40 out
  ('mistralai/mistral-nemo', false),        -- $0.02 in / $0.03 out
  ('openai/gpt-4o-mini', false);            -- $0.15 in / $0.60 out: a cheap judge that is not one of the above
