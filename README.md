# Olave

An eval harness for LLM output. An **eval** is a versioned spec of *prompt × factors × graders*. A **run** fans the prompt out into **cells** (one per factor combination), every cell is scored by the pinned **graders**, and runs are compared against a promoted **baseline** to catch regressions.

## Concepts

- **Playground** is for single runs: one prompt on up to four models side by side, nothing stored or graded. "Save as eval" carries it into Studio when it is worth measuring.
- **Factors** multiply the run: models, variable values, parameter sweeps, system-prompt variants, dataset cases. `2 models × 2 tones × 5 cases = 20 cells`. Runs are capped at 500 cells.
- **Graders** are versioned and immutable; evals pin a version, so tightening a rubric never silently rescores history.
  - **Jev** (TypeSafe System One): each rubric criterion is one Score question whose levels are your descriptors; yes/no checks are Nouls. One request per cell. Weights, thresholds and pass/fail are composed in code; low-confidence grades are flagged for human review.
  - **LLM judge**: a reasoning model scores the same rubric shape and returns a rationale. It is never allowed to be the model under test.
  - **Code check**: declarative only (word limits, regex, contains, JSON shape, match against a `reference` column). Nothing a user types is ever executed.
- **Models** (Library → Models) is the platform allowlist: add models from the OpenRouter catalogue, remove them, pick the default. Runs and LLM judges are refused server-side for anything not listed, which makes the list your cost ceiling. It is seeded with cheap models.
- **Compare** lines two runs up by factor combination: score/pass/latency/cost deltas, per-factor deltas, and a list of cells that dropped ≥ 0.10. Promote a run to baseline from there.

## Setup

Requires Node.js ≥ 20 and a Supabase project.

1. In the Supabase SQL editor run `supabase/migrations/0001_rebuild.sql`, `0002_models.sql`, `0003_hardening.sql` and `0004_lock_unprotected_tables.sql`, then `supabase/verify_rls.sql` (leaves data untouched; every row should say ok). If this project held the old jsonb tables, run `0000_drop_legacy.sql` first (it is destructive; export anything you need).
2. In Supabase **Authentication → Sign In / Providers**, turn **off** "Allow new users to sign up", then invite yourself under **Authentication → Users**. The invited-user list is the allowlist.
3. `cp .env.example .env.local` and fill it in. Without `OPENROUTER_API_KEY` runs return mock output; without `TYPESAFE_API_KEY` Jev graders are skipped.
4. `npm install && npm run dev`

## Security model

- Provider keys exist **only** as server environment variables, read in one file (`lib/server/env.ts`). They are never accepted from the browser, stored in the database, logged, or returned; Settings can only see whether each is set.
- Everything under `lib/server/` imports `server-only`: importing it from client code fails the build. `npm run check:leaks` greps the built client bundle for key names, key values and the TypeSafe SDK.
- There is no service-role key. The server talks to Supabase with the signed-in user's session, and RLS is enabled on every table. Policies require membership in a `members` table that only the SQL editor can write, so a stray signup gets nothing. Eval and grader versions are append-only in the database.
- Every API handler goes through `route()` (`lib/server/http.ts`): session required, cross-origin writes refused, input parsed with zod, errors redacted (`lib/redact.ts`) before they are stored, logged or returned. `proxy.ts` repeats the session check and fails closed when Supabase is not configured.
- A per-request nonce CSP (`connect-src 'self'`): the browser never calls Supabase or a model provider directly. Model output is rendered as text only and is wrapped as data in grader prompts.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` / `npm run build` | Dev server / production build |
| `npm test` | Unit tests: factor expansion, graders, run comparison, redaction, templates |
| `npm run check:leaks` | After a build, fail if anything secret-shaped is in the client bundle |
| `npm run lint` / `npm run typecheck` | Static checks |

## Not built yet

Teams, roles and budgets; the human review queue with blind grading and judge calibration (Cohen's κ); prompt library; scheduled and CI-triggered runs. Runs execute inside the request (`maxDuration` 300s) and can be resumed; move to a queue when they outgrow that.

## License

[MIT](LICENSE)
