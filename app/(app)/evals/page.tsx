import Link from "next/link";

import { NewEvalButton } from "@/components/actions";
import { Chip, Empty, FACTOR_TONE, PageHeader, type Tone } from "@/components/kit";
import { summarise } from "@/lib/compare";
import { fmtScore, scoreTone, toScoredCells } from "@/lib/results";
import { getRun, must } from "@/lib/server/data";
import { requireUser } from "@/lib/server/supabase";
import { evalSpecSchema } from "@/lib/spec";

export default async function EvalsPage() {
  const { supabase } = await requireUser();
  const rows = must(
    await supabase.from("evals").select("id, name, goal, baseline_run_id, updated_at, eval_versions(version, spec), runs!runs_eval_id_fkey(id, created_at, status)").order("updated_at", { ascending: false }),
    "Evals",
  ) as unknown as Array<{
    id: string; name: string; goal: string; baseline_run_id: string | null; updated_at: string;
    eval_versions: Array<{ version: number; spec: unknown }>;
    runs: Array<{ id: string; created_at: string; status: string }>;
  }>;

  // ponytail: one extra query per eval for its latest score; add a run_summaries view when the list gets long.
  const evals = await Promise.all(
    rows.map(async (row) => {
      const latest = [...row.eval_versions].sort((a, b) => b.version - a.version)[0];
      const spec = evalSpecSchema.parse(latest?.spec ?? {});
      const lastRun = [...row.runs].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
      const score = lastRun ? summarise(toScoredCells((await getRun(supabase, lastRun.id)).cells, spec.graders[0])).score : null;
      return { ...row, version: latest?.version ?? 1, spec, lastRun, score };
    }),
  );

  return (
    <>
      <PageHeader eyebrow="Workspace" title="Evals" description="Saved variation specs. Each eval versions its prompt, factors, and graders." actions={<NewEvalButton />} />
      {evals.length === 0 ? (
        <Empty title="No evals yet">An eval fans one prompt out across models, variables, parameter sweeps and dataset cases, then grades every cell.</Empty>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full border-collapse">
            <thead><tr><th className="th">Eval</th><th className="th">Factors</th><th className="th">Latest run</th><th className="th">Score</th></tr></thead>
            <tbody>
              {evals.map((item) => (
                <tr key={item.id} className="hover:bg-tint">
                  <td className="td">
                    <Link href={`/evals/${item.id}`} className="font-medium hover:underline">{item.name}</Link>{" "}
                    <span className="font-mono text-xs text-ink-2">v{item.version}</span>
                    {item.baseline_run_id ? <> <Chip tone="accent">baseline set</Chip></> : null}
                  </td>
                  <td className="td"><span className="flex flex-wrap gap-1">{item.spec.factors.filter((f) => f.enabled).map((f) => <Chip key={f.id} tone={FACTOR_TONE[f.kind]}>{f.name}</Chip>)}</span></td>
                  <td className="td text-xs text-ink-2">{item.lastRun ? `${new Date(item.lastRun.created_at).toLocaleString()} · ${item.runs.length} runs` : "never run"}</td>
                  <td className="td"><Chip tone={scoreTone(item.score) as Tone}>{fmtScore(item.score)}</Chip></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
