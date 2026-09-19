-- Hardening. Safe to run once on top of 0001 + 0002.
--
-- 1. Membership is enforced IN THE DATABASE. Being signed in is no longer enough: every policy also
--    requires the user to be listed in `members`. If public signups are ever switched back on by
--    mistake, a stranger's account can sign in but sees and changes nothing.
-- 2. Version tables become append-only, so "evals pin an immutable version" is a guarantee, not a convention.
--
-- Adding a teammate later (after inviting them in Authentication > Users):
--   insert into members (user_id) select id from auth.users where email = 'teammate@example.com';
-- Removing one:
--   delete from members where user_id = (select id from auth.users where email = 'teammate@example.com');
-- There is deliberately no policy that lets the app write to `members`: only the SQL editor can.

create table members (
  user_id uuid primary key references auth.users (id) on delete cascade,
  added_at timestamptz not null default now()
);
alter table members enable row level security;

-- Keyed on the user id, not the email: ids cannot be re-registered or spoofed.
-- SECURITY DEFINER so the check can read `members` without the caller having any access to it.
create function is_member() returns boolean
  language sql stable security definer set search_path = ''
  as $$ select exists (select 1 from public.members where user_id = (select auth.uid())) $$;
revoke all on function is_member() from public, anon;
grant execute on function is_member() to authenticated;

create policy members_read_self on members for select to authenticated using (user_id = (select auth.uid()));

-- Everyone who can sign in today becomes a member, so running this cannot lock you out.
-- CHECK THE RESULT OF THE FINAL SELECT: every email listed there gets full access.
insert into members (user_id) select id from auth.users;

-- Replace the "any signed-in user" policies.
drop policy evals_authenticated on evals;
drop policy eval_versions_authenticated on eval_versions;
drop policy datasets_authenticated on datasets;
drop policy dataset_rows_authenticated on dataset_rows;
drop policy graders_authenticated on graders;
drop policy grader_versions_authenticated on grader_versions;
drop policy runs_authenticated on runs;
drop policy cells_authenticated on cells;
drop policy grades_authenticated on grades;
drop policy models_authenticated on models;

create policy evals_members on evals for all to authenticated using (is_member()) with check (is_member());
create policy datasets_members on datasets for all to authenticated using (is_member()) with check (is_member());
create policy dataset_rows_members on dataset_rows for all to authenticated using (is_member()) with check (is_member());
create policy graders_members on graders for all to authenticated using (is_member()) with check (is_member());
create policy runs_members on runs for all to authenticated using (is_member()) with check (is_member());
create policy cells_members on cells for all to authenticated using (is_member()) with check (is_member());
create policy grades_members on grades for all to authenticated using (is_member()) with check (is_member());
create policy models_members on models for all to authenticated using (is_member()) with check (is_member());

-- Append-only: read and insert, never update or delete. Deleting an eval or grader still removes its
-- versions, because ON DELETE CASCADE runs as the table owner and is not subject to these policies.
create policy eval_versions_read on eval_versions for select to authenticated using (is_member());
create policy eval_versions_append on eval_versions for insert to authenticated with check (is_member());
create policy grader_versions_read on grader_versions for select to authenticated using (is_member());
create policy grader_versions_append on grader_versions for insert to authenticated with check (is_member());

select u.email as member, m.added_at from members m join auth.users u on u.id = m.user_id order by 1;
