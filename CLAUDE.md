# dg-llm-evals — agent notes

LLM eval harness: Next.js 16 App Router, TypeScript strict, Tailwind 4, Supabase (Auth + RLS), OpenRouter, TypeSafe/Jev.

**Read `docs/HANDOFF.md` first.** It has the code map, data model, security invariants, revert steps, verification status and backlog.

Rules that override convenience:
- Security is the owner's top priority. Provider keys are server env only, read only in `lib/server/env.ts`. Never accept, store, log, return, ask for, or write a key value. Never add a service-role key or a `NEXT_PUBLIC_` secret.
- Server-only code goes in `lib/server/` with `import "server-only"`. Every API handler is wrapped in `route()` from `lib/server/http.ts`.
- Code graders stay declarative: no `eval`/`new Function`. Model output is rendered as text only.
- Never run `supabase/migrations/0000_drop_legacy.sql` or any destructive SQL yourself.
- `ponytail:` comments mark intentional simplifications with their upgrade path. Keep changes minimal; no new dependencies for what a few lines can do.

Before saying a change is done: `npm test && npm run typecheck && npm run lint && npm run build && npm run check:leaks`.

Dev server: `dev` in `.claude/launch.json` (port 3112). The app needs Supabase env vars to get past `/login`.
