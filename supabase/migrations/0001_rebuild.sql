-- Eval harness schema. Every table has RLS on; only signed-in users get access.
-- Disable public signups in Supabase Auth: the invited-user list is the allowlist.
-- ponytail: one shared workspace; add team_id + per-team policies when teams land.

create table evals (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  goal text not null default '',
  baseline_run_id uuid,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table eval_versions (
  id uuid primary key default gen_random_uuid(),
  eval_id uuid not null references evals(id) on delete cascade,
  version int not null,
  spec jsonb not null,
  created_at timestamptz not null default now(),
  unique (eval_id, version)
);

create table datasets (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  columns text[] not null default '{}',
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

create table dataset_rows (
  id uuid primary key default gen_random_uuid(),
  dataset_id uuid not null references datasets(id) on delete cascade,
  idx int not null,
  data jsonb not null,
  tags text[] not null default '{}',
  unique (dataset_id, idx)
);

create table graders (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  engine text not null check (engine in ('code', 'judge', 'jev')),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

-- Immutable: a new version never rescores past runs; evals pin a version id.
create table grader_versions (
  id uuid primary key default gen_random_uuid(),
  grader_id uuid not null references graders(id) on delete cascade,
  version int not null,
  config jsonb not null,
  created_at timestamptz not null default now(),
  unique (grader_id, version)
);

create table runs (
  id uuid primary key default gen_random_uuid(),
  eval_id uuid not null references evals(id) on delete cascade,
  eval_version_id uuid not null references eval_versions(id) on delete cascade,
  status text not null default 'running' check (status in ('running', 'completed', 'failed')),
  trigger text not null default 'manual',
  total_cells int not null,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

alter table evals add constraint evals_baseline_run_fk
  foreign key (baseline_run_id) references runs(id) on delete set null;

create table cells (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references runs(id) on delete cascade,
  idx int not null,
  labels jsonb not null,
  model text not null,
  system_prompt text not null,
  user_prompt text not null,
  vars jsonb not null default '{}',
  params jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'done', 'error')),
  output text,
  error text,
  provider text,
  prompt_tokens int,
  completion_tokens int,
  latency_ms int,
  cost numeric,
  unique (run_id, idx)
);

create table grades (
  id uuid primary key default gen_random_uuid(),
  cell_id uuid not null references cells(id) on delete cascade,
  grader_version_id uuid not null references grader_versions(id) on delete cascade,
  score real,
  pass boolean,
  confidence real,
  flagged boolean not null default false,
  raw jsonb not null default '{}',
  unique (cell_id, grader_version_id)
);

create index on eval_versions (eval_id);
create index on dataset_rows (dataset_id);
create index on grader_versions (grader_id);
create index on runs (eval_id, created_at desc);
create index on cells (run_id);
create index on grades (cell_id);

-- Written out per table (not looped) so it is auditable at a glance and Supabase's SQL editor can see it.
alter table evals enable row level security;
alter table eval_versions enable row level security;
alter table datasets enable row level security;
alter table dataset_rows enable row level security;
alter table graders enable row level security;
alter table grader_versions enable row level security;
alter table runs enable row level security;
alter table cells enable row level security;
alter table grades enable row level security;

create policy evals_authenticated on evals for all to authenticated using (true) with check (true);
create policy eval_versions_authenticated on eval_versions for all to authenticated using (true) with check (true);
create policy datasets_authenticated on datasets for all to authenticated using (true) with check (true);
create policy dataset_rows_authenticated on dataset_rows for all to authenticated using (true) with check (true);
create policy graders_authenticated on graders for all to authenticated using (true) with check (true);
create policy grader_versions_authenticated on grader_versions for all to authenticated using (true) with check (true);
create policy runs_authenticated on runs for all to authenticated using (true) with check (true);
create policy cells_authenticated on cells for all to authenticated using (true) with check (true);
create policy grades_authenticated on grades for all to authenticated using (true) with check (true);
