# Handoff: eval-harness rebuild

Written 2026-09-18 for whoever (human or agent) picks this up next. Read this before changing anything. `README.md` is the user-facing summary; this file is the working record.

> The other two files in `docs/` (`modernization-roadmap.md`, `old-ui-rebuild-baseline.md`) describe the **pre-rebuild** app and are stale. They are kept for history only.

## 1. What happened

The app was a prompt *runner* (Next.js Pages Router, one shared password, OpenRouter key in browser localStorage, jsonb blobs in Supabase with a local-JSON fallback, human 1–5 ratings only). It was rebuilt in one pass on branch `llm-evall-rebuild` into an eval *harness*:

- **Eval** = versioned spec of prompt × factors × pinned graders
- **Run** = the spec fanned out into **cells** (one per factor combination)
- **Grades** = one per cell per grader (code check, LLM judge, or Jev)
- **Compare** = two runs lined up by factor combination, with regressions and a promotable **baseline**

Design reference: `~/Downloads/LLM Eval - Design flow customization tool.zip` (three HTML prototypes: `Eval Platform`, `Variation Studio`, `Eval AI`, plus `notes/astryx-tokens.md`). It is not in the repo.

### Decisions the owner made (do not relitigate)

| Question | Decision |
| --- | --- |
| Where provider keys live | **Server env vars only.** No bring-your-own-key, no keys in the DB. |
| UI | Tailwind 4 + Astryx tokens as CSS variables, native HTML elements. shadcn/base-ui were removed. |
| Auth + storage | Supabase Auth (public signups **off**, invited users = allowlist), RLS on every table, Supabase-only. No service-role key anywhere. |
| Milestone 1 scope | Core eval loop. Teams, members, budgets, project switcher are explicitly deferred. |
| Extra grader | Jev (TypeSafe System One) as a first-class grader engine. |

The owner's stated priority: **security is paramount — no leakage of tokens or API keys, ever.**

## 2. State of verification (be honest about this when you continue)

Verified:
- `npm test` (25 tests), `npm run typecheck`, `npm run lint`, `npm run build`, `npm run check:leaks` all pass.
- Importing `lib/server/env` from a client component fails the build (tested, then reverted).
- Signed out / Supabase unconfigured: every API route returns 401, every page redirects to `/login`, cross-origin POST is refused.
- Security headers and the nonce CSP are served; no console or CSP errors on `/login`.
- Studio + results grid + cell drawer + tabs rendered correctly against **fixture data** through a temporary page (since deleted).

Verified against a real Supabase project in mock mode (2026-09-18, no provider keys set): sign-in, RLS as an authenticated user, evals list (including the `runs!runs_eval_id_fkey` embed), create eval, run with streaming (4 cells persisted), create code + Jev graders, "test on 5 cells", pin graders → spec v2 → graded run, Runs tab, Compare, promote to baseline, dataset upload with `reference`/`tags` columns. One bug found and fixed on the way: grader defaults were exported from a `"use client"` module and read by a server page (now `lib/grader-defaults.ts`).

Verified live with real keys (2026-09-18): Settings shows both providers connected; a 4-cell run through OpenRouter (gpt-4o-mini + claude-haiku-4.5) returned real outputs, token counts, latency (p50 ~1.1 s) and cost ($0.0006 total); the Jev grader scored every cell in one request each and its confidence flagging fired (2 of 4 flagged). Jev separated a genuinely bad cell (0.30: the model role-played a support reply instead of summarising) from good ones (0.85–1.00).

Verified live on cheap models (same day, after `0002_models.sql`): Models page with live prices; add (catalogue-checked, bogus id → 422), remove, set default; `createRun` refusing an off-list model (422, surfaced in Studio pre-flight); a 6-cell run of 2 models × 3 dataset cases in 7 s for ~$0.0001; the **LLM judge** (gpt-4o-mini) scoring every cell; the `/resume` endpoint on a finished run (no-op, completes). Bug found and fixed: "make default" on a missing id cleared the existing default first.

**What the live Jev data taught us (keep this in mind when writing rubrics):** a confidence of exactly 0 is real, not a bug. It appears when Jev's level distribution is bimodal (e.g. 0.31 at level 0 and 0.55 at level 3). The probability-weighted `score` then lands on a middle level neither mode supports, so **treat low-confidence scores as "unknown", not as a mid score** — which is what `flagged` is for. The cause was a rubric mixing two dimensions (invention and omission) on one scale; the defaults in `lib/grader-defaults.ts` now split them (Score for omission, Noul for invention). Whether that actually raises confidence has not been re-measured.

Verified on the owner's project after `0003` + `0005` (2026-09-18): `verify_rls.sql` passed for every app table and caught three RLS-off leftovers from the old app, now dropped; under the hardened policies the app still creates an eval, appends a version (v2), runs end to end (cells + grades written), and deleting the eval cascades to its versions, run and cells.

**Still not verified:** resume of a genuinely interrupted run (pending cells), runs near the 500-cell cap or the 300 s limit, the new default rubrics on live data, and a production deploy. The Jev thresholds (0.6 confidence flag, 0.5 Noul) are still defaults: calibrate them once there are human grades to compare against.

## 3. Map of the code

```
proxy.ts                     Next 16 proxy: refreshes Supabase session, 401/redirects signed-out, sets nonce CSP. Fails closed.
next.config.mjs              Static security headers (CSP is in proxy.ts because it carries a nonce)
scripts/check-leaks.mjs      Post-build grep of .next/static for key names/values + TypeSafe SDK

lib/spec.ts                  ALL shared zod schemas + types: EvalSpec, Factor, GraderConfig, Check, Criterion, Grade; constants (MAX_CELLS=500, REGRESSION_DROP=0.1); compositeScore()
lib/factors.ts               buildAxes, countCells, cellMath, cellAt (mixed-radix), specIssues (pre-flight), seeded RNG
lib/compare.ts               summarise, byFactor, compareRuns (matches cells by factor labels, not index)
lib/results.ts               DB row types (CellRow, GradeRow, RunRow), headline(), formatters
lib/template.ts              {{variable}} parser/validator/renderer — kept from the old app, unchanged in behaviour
lib/csv.ts                   CSV parse/serialise — kept from the old app
lib/redact.ts                Strips Bearer tokens, key-shaped strings, JWTs and literal secrets from text
lib/http-error.ts            HttpError (own file to avoid a circular import)
lib/client-api.ts            Browser fetch helper + NDJSON reader. Attaches nothing; the session cookie is HttpOnly.

lib/server/  (every file imports "server-only")
  env.ts                     THE ONLY place secrets are read. connectionStatus() returns booleans only.
  supabase.ts                getSupabase() (user-session client), requireUser()
  http.ts                    route() wrapper: origin check → requireUser → handler → redacted errors. readJson() with size cap.
  data.ts                    Queries: getEval, getVersionSpec, loadCaseRows, getGraderVersions, getRun, list*; must()
  openrouter.ts              listModels() (public catalogue, cached 1h), complete() (mock mode w/o key, timeout, retry on 429/5xx)
  runner.ts                  createRun (insert run + pending cells), executeRun (pool of 6), streamRun (NDJSON)
  graders/code.ts            Declarative checks. No server-only import so tests can load it.
  graders/jev.ts             buildQuestions, composeJevGrade, gradeWithJev (injectable `ask` for tests)
  graders/judge.ts           buildJudgePrompt, gradeWithJudge (refuses judge == model under test)
  graders/index.ts           grade(config, cell) dispatcher

app/layout.tsx               Root; force-dynamic so the CSP nonce reaches every script
app/login/page.tsx           Client form → POST /api/auth/login
app/(app)/layout.tsx         requireUser or redirect; side rail
app/(app)/evals/…            list · [id] (Runs + Compare tabs) · [id]/studio · [id]/runs/[runId]
app/(app)/graders/…          list · new?engine= · [id]
app/(app)/models             Platform model allowlist: add from the OpenRouter catalogue, remove, set default
app/(app)/datasets, settings
app/api/…                    auth/login (only unauthenticated handler), auth/logout, evals, evals/[id], evals/[id]/runs,
                             evals/[id]/baseline, runs/[id], runs/[id]/resume, graders, graders/[id], graders/test, datasets, datasets/[id],
                             models (POST add / PUT set default / DELETE remove; id in the body because ids contain "/")

components/kit.tsx           Chip, PageHeader, Stat, Empty, Banner, Bar, FACTOR_TONE (server-safe, no hooks)
components/studio.tsx        The single eval editor + run driver (client)
components/results.tsx       Stats, grid/table views, cell drawer (client)
lib/grader-defaults.ts       Default configs per engine (plain module: server pages read it)
components/grader-editor.tsx All three engines' forms + "test on 5 cells" (client)
components/actions.tsx       NewEvalButton, ActionButton, RunPicker (client)
components/nav.tsx, dataset-upload.tsx

supabase/migrations/0001_rebuild.sql     New schema + RLS
supabase/migrations/0002_models.sql      Platform model allowlist + cheap seed models
supabase/migrations/0003_hardening.sql   `members` table + is_member(); all policies require membership; version tables append-only
supabase/migrations/0004_lock_unprotected_tables.sql  Non-destructive: enables RLS on any public table without it (found 3 open leftovers from the old app)
supabase/verify_rls.sql                  Self-check: creates one helper function, calls it, drops it; its probes roll themselves back. Every row should say ok.
                                         (No temp tables / BEGIN: the Supabase SQL editor does not keep a script on one connection.)
supabase/migrations/0000_drop_legacy.sql DESTRUCTIVE, for a pre-rebuild project only. Guarded: refuses to run once `eval_versions` exists,
                                         because the old names `runs`/`evals`/`datasets` are reused by the new schema.
supabase/migrations/0005_drop_old_leftovers.sql  DESTRUCTIVE but safe on the new schema: drops only old-app tables whose names the new schema does not use
```

### Data model (`0001_rebuild.sql`)

`evals` (name, goal, baseline_run_id) → `eval_versions` (version, spec jsonb — immutable; a save with a changed spec inserts a new row) · `datasets` → `dataset_rows` (idx, data jsonb, tags[]) · `graders` (engine) → `grader_versions` (version, config jsonb — immutable) · `runs` (eval_id, eval_version_id, status, trigger, total_cells) → `cells` (idx, labels, model, prompts, vars, params, status pending|done|error, output, error, tokens, latency, cost) → `grades` (grader_version_id, score 0–1, pass, confidence, flagged, raw jsonb).

`models` (id = OpenRouter model id, is_default; one default enforced by a partial unique index) is the **platform allowlist**: `createRun` refuses any cell model or judge model not in it (422). The Studio/grader pickers only offer these, but the server check is the real control — it is also the cost ceiling.

All scores are normalised to **0–1**.

**RLS (after `0003_hardening.sql`)**: enabled on every table. `anon` has no policies. `authenticated` must also pass `is_member()` (a `security definer` function checking `members.user_id = auth.uid()`), so a signed-in non-member sees and changes nothing even if signups are re-enabled by mistake. `members` has no write policy: it is managed only from the SQL editor (snippets are in the migration header). `eval_versions` and `grader_versions` have select + insert policies only (append-only); deleting an eval/grader still cascades because cascades run as the table owner. Still one shared workspace among members; `created_by` is recorded for when team scoping arrives. The migrations and `verify_rls.sql` were dry-run on a local Postgres 15 with a stubbed `auth` schema: 21/21 checks ok.

### How a run works

`POST /api/evals/[id]/runs` → `createRun`: load latest version, load dataset rows, `buildAxes`, `specIssues` (422 if any), insert `runs` row and **all cells as `pending`** with prompts already resolved → `streamRun` → `executeRun`: 6 workers pull from a queue; each cell: `complete()` → update cell → each pinned grader `grade()` → upsert grade → emit NDJSON `{type:"cell"}`. Errors are redacted then stored on the cell. `POST /api/runs/[id]/resume` re-executes `pending` and `error` cells. Ceiling: the route's `maxDuration = 300`.

### How the Jev grader works

`state = { input, response, reference? }`. One `systemOne` request per cell, model `jev-latest`. Each rubric criterion → `score(instructions, levels)` where `levels` **are** the rubric descriptors (worst → best, 2–10). Each yes/no check → `noul(instructions)`. Composition is in code (`composeJevGrade`): per-criterion `score / (levels − 1)`, weighted mean → 0–1; Nouls are hard gates; grade confidence = the minimum across answers (Noul confidence = distance from 0.5 × 2); `confidence < flagBelowConfidence` (default 0.6) sets `flagged`. The 0.6 and the 0.5 Noul threshold are starting points, **not validated on real data**. API reference: https://docs.typesafe.ai/llms.txt (append `.md` to page paths).

## 4. Security invariants — break none of these

1. Secrets are read in `lib/server/env.ts` and nowhere else. Never add `NEXT_PUBLIC_` to a secret. Never add a service-role key.
2. No code path may accept a provider key from a request, store one in the DB, log one, or return one. Settings shows booleans.
3. Provider/DB code lives under `lib/server/` and starts with `import "server-only"`.
3a. **No table in `public` may have RLS off** — the anon key is public, so RLS-off means world-readable and writable. The first `verify_rls.sql` run on the owner's project found three such leftovers from the pre-rebuild app (`prompt_templates`, `source_pool`, `test_cases`); `0004` locks them without deleting data. The owner has said the old data is not wanted: `0005_drop_old_leftovers.sql` drops them. Agents still never run destructive SQL themselves.
3b. RLS is the access control, not the app. Every new table needs `enable row level security` plus `is_member()` policies in the same migration, written out literally. Never add a write policy on `members`. Re-run `supabase/verify_rls.sql` after any schema change.
4. Every API handler is wrapped in `route()`. The only exception is `api/auth/login`. `proxy.ts` has no excluded app routes.
5. Runs may only call models in the `models` table; keep that check in `createRun` (server-side), never only in the UI.
5a. All request bodies are parsed with a zod schema from `lib/spec.ts` (or a local one). Server-side caps: 500 cells, 2,000 dataset rows, 2 MB body.
6. Anything from a provider or Supabase error passes through `safeMessage()`/`redact()` before being stored, logged or returned.
7. Code graders stay declarative. No `eval`, `new Function`, or user-supplied code — ever. (Known ceiling: user regexes are length-capped but not sandboxed; see the `ponytail:` note in `graders/code.ts`.)
8. Model output is untrusted: render as text (no `dangerouslySetInnerHTML` anywhere), and wrap it as delimited data in grader prompts.
9. The browser talks only to this origin (`connect-src 'self'`). Do not add client-side Supabase or provider calls, or third-party scripts, without revisiting the CSP.
10. After any change touching the above: `npm run build && npm run check:leaks`.

Comments starting `ponytail:` mark deliberate simplifications and name their ceiling and upgrade path. Grep for them before "fixing" something that looks naive.

## 5. Reverting

Everything before the rebuild is at commit `1d36751` (tagged locally as `pre-rebuild`; push the tag with `git push origin pre-rebuild` if you want it on the remote). `main` was not touched.

- **Abandon the rebuild:** `git switch main` (or `git switch -c old-app pre-rebuild`). Nothing else is needed; the old app has no dependency on the new tables.
- **Get one old file back:** `git show pre-rebuild:lib/runner.ts` · the whole old tree: `git checkout pre-rebuild -- pages lib components styles proxy.js`.
- **Old DB schema:** `git show pre-rebuild:supabase/schema.sql`. It is idempotent. The old tables are only gone if someone ran `0000_drop_legacy.sql`; that drop is not reversible and old run data is not recoverable from git — export first.
- **Undo just the new tables:** `drop table grades, cells, runs, grader_versions, graders, dataset_rows, datasets, eval_versions, evals cascade;`
- Old env vars no longer used: `APP_ACCESS_PASSWORD`, `SUPABASE_SERVICE_ROLE_KEY` (remove it from any deployment — it is a high-privilege secret the new app never needs), `OPENROUTER_REFERER`, `OPENROUTER_TITLE`.
- Removed packages: `@base-ui/react`, `vaul`, `shadcn`, `class-variance-authority`, `lucide-react`, `tw-animate-css`, `clsx`, `tailwind-merge`, `@vercel/analytics`. Added: `@supabase/ssr`, `zod`, `server-only`, `@typesafe-ai/sdk`.

## 6. First run (done once in mock mode; repeat for a new environment)

1. Supabase SQL editor: (`0000_drop_legacy.sql` only if the old tables exist and are exported) then `0001_rebuild.sql`, `0002_models.sql`, `0003_hardening.sql` (check the member list it prints), `0004_lock_unprotected_tables.sql`, then `verify_rls.sql` (every row should say ok).
2. Supabase → Authentication: disable "Allow new users to sign up"; invite a user; set a password.
3. `cp .env.example .env.local`; fill in the two `NEXT_PUBLIC_SUPABASE_*` values. Leave provider keys blank to start in mock mode. **Agents: never ask for, read, echo or write key values. The owner fills this file in.**
4. `npm install && npm run dev -- -p 3112` (or the `dev` config in `.claude/launch.json`).
5. Smoke test: sign in → New eval (starter spec = 2 models × 2 tones = 4 cells) → Run → open a cell → create a code grader and a Jev grader → pin them in Studio → run again → change the prompt → run → Runs tab → pick two → Compare → promote baseline. Upload a CSV with `ticket,reference,tags` columns and add a Dataset cases factor.
6. Then add keys and repeat once live.

## 7. Backlog, in suggested order

1. Do the live-key pass in §6 step 6 and the remaining unverified items in §2.
2. **Human review loop** (designs: Review queue, Grading session, Grader → Calibration): blind grading (model/params hidden until scored), keyboard 1–5, `flagged` grades + judge/code disagreement as the sampling feed, Cohen's κ per criterion, human × judge confusion matrix. Needs a `human_grades` table. Jev-vs-judge agreement on the same rubric is nearly free once this exists.
3. Queue-backed runner (runs currently live inside one request; see the `ponytail:` note in `runner.ts`).
4. Results: Side-by-side and Cards views, "add to golden set", re-run a single cell ×N.
5. Statistical honesty: repeated samples per cell, confidence intervals on run deltas before calling something a regression.
6. Scheduled and CI-triggered runs (`runs.trigger` already exists), pass/fail exit for CI.
7. Prompt library; the 5-step create wizard (Studio currently covers the same fields); ⌘K palette.
8. Deferred logistics: teams, roles, budgets, project switcher → add `team_id` and swap `is_member()` for a per-team check; a Members page would need a deliberate, admin-only write path to `members` (today there is none, on purpose).
9. Small debts: evals list does one extra query per eval for its score (wants a summary view); Studio receives every dataset row; user regexes are unsandboxed.
