import Link from "next/link";

import { ActionButton, RunPicker } from "@/components/actions";
import { Banner, Bar, Chip, Empty, FACTOR_TONE, PageHeader, Stat, type Tone } from "@/components/kit";
import { compareRuns, summarise } from "@/lib/compare";
import { cellMath, buildAxes } from "@/lib/factors";
import { fmtCost, fmtPct, fmtScore, scoreTone, toScoredCells } from "@/lib/results";
import { getEval, getRun, getVersionSpec, listRuns, loadCaseRows } from "@/lib/server/data";
import { requireUser } from "@/lib/server/supabase";

const signed = (value: number | null, digits = 2) => (value === null ? "—" : `${value >= 0 ? "+" : ""}${value.toFixed(digits)}`);
const diff = (a: number | null, b: number | null) => (a === null || b === null ? null : b - a);

export default async function EvalPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string; a?: string; b?: string }> }) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const { supabase } = await requireUser();
  const record = await getEval(supabase, id);
  const runs = await listRuns(supabase, id);
  const axes = buildAxes(record.spec, await loadCaseRows(supabase, record.spec));
  const tab = query.tab === "compare" ? "compare" : "runs";

  // Each run is scored with the headline grader of the spec version it actually ran.
  const scored = await Promise.all(
    runs.slice(0, 20).map(async (run) => {
      const spec = await getVersionSpec(supabase, run.eval_version_id);
      const cells = toScoredCells((await getRun(supabase, run.id)).cells, spec.graders[0]);
      return { run, cells, summary: summarise(cells) };
    }),
  );
  const byId = new Map(scored.map((entry) => [entry.run.id, entry]));
  const baseline = record.baseline_run_id ? byId.get(record.baseline_run_id) : undefined;
  const a = byId.get(query.a ?? "") ?? baseline ?? scored[1];
  const b = byId.get(query.b ?? "") ?? scored[0];
  const label = (runId: string) => `run ${runId.slice(0, 6)}`;

  return (
    <>
      <PageHeader
        eyebrow="Evals"
        title={<>{record.name} <span className="font-mono text-base text-ink-2">v{record.version}</span></>}
        description={<span className="flex flex-wrap items-center gap-1.5">{axes.map((axis) => <Chip key={axis.factor.id} tone={FACTOR_TONE[axis.factor.kind]}>{axis.values.length} {axis.factor.name}</Chip>)}<span className="font-mono text-xs">{cellMath(axes)} cells</span></span>}
        actions={<>
          <ActionButton path={`/api/evals/${id}`} method="DELETE" label="Delete" confirmText={`Delete "${record.name}" and all of its runs? This cannot be undone.`} className="btn btn-ghost" then="/evals" />
          <Link href={`/evals/${id}/studio`} className="btn btn-primary">Open in Studio</Link>
        </>}
      />

      <nav aria-label="Eval sections" className="mb-4 flex gap-1 border-b border-line">
        {(["runs", "compare"] as const).map((t) => (
          <Link key={t} href={`/evals/${id}?tab=${t}`} aria-current={tab === t ? "page" : undefined} className={`-mb-px border-b-2 px-3 pb-2 font-medium capitalize ${tab === t ? "border-accent" : "border-transparent text-ink-2"}`}>{t}</Link>
        ))}
      </nav>

      {tab === "runs" ? (
        scored.length === 0 ? <Empty title="No runs yet">Open this eval in Studio and run it.</Empty> : (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Stat label="Baseline score" value={fmtScore(baseline?.summary.score)} sub={baseline ? label(baseline.run.id) : "no baseline promoted"} />
              <Stat label="Latest score" value={fmtScore(scored[0].summary.score)} tone={scoreTone(scored[0].summary.score) as Tone} sub={baseline ? `${signed(diff(baseline.summary.score, scored[0].summary.score))} vs baseline` : undefined} />
              <Stat label="Latest pass rate" value={fmtPct(scored[0].summary.passRate)} sub={`run passes at ≥ ${record.spec.passThreshold}`} />
              <Stat label="Spend, last 20 runs" value={fmtCost(scored.reduce((sum, entry) => sum + entry.summary.cost, 0))} />
            </div>
            <RunPicker evalId={id} runs={scored.map((entry) => ({ id: entry.run.id, label: label(entry.run.id) }))} />
            <div className="card overflow-x-auto">
              <table className="w-full border-collapse">
                <thead><tr><th className="th">Run</th><th className="th">When</th><th className="th">Trigger</th><th className="th">Score</th><th className="th">Δ prev</th><th className="th">Pass</th><th className="th">Cost</th><th className="th">Status</th><th className="th" /></tr></thead>
                <tbody>
                  {scored.map((entry, i) => {
                    const delta = diff(scored[i + 1]?.summary.score ?? null, entry.summary.score);
                    const passes = entry.summary.score !== null && entry.summary.score >= record.spec.passThreshold;
                    return (
                      <tr key={entry.run.id} className="hover:bg-tint">
                        <td className="td"><Link className="font-mono text-xs hover:underline" href={`/evals/${id}/runs/${entry.run.id}`}>{label(entry.run.id)}</Link>{entry.run.id === record.baseline_run_id ? <> <Chip tone="accent">baseline</Chip></> : null}</td>
                        <td className="td text-xs text-ink-2">{new Date(entry.run.created_at).toLocaleString()}</td>
                        <td className="td text-xs">{entry.run.trigger}</td>
                        <td className="td"><Chip tone={scoreTone(entry.summary.score) as Tone}>{fmtScore(entry.summary.score)}</Chip></td>
                        <td className={`td font-mono text-xs ${delta !== null && delta < 0 ? "text-bad" : "text-ink-2"}`}>{signed(delta)}</td>
                        <td className="td text-xs tabular-nums">{fmtPct(entry.summary.passRate)}</td>
                        <td className="td text-xs tabular-nums">{fmtCost(entry.summary.cost)}</td>
                        <td className="td"><Chip tone={entry.run.status === "completed" ? (passes ? "good" : "warn") : entry.run.status === "failed" ? "bad" : "info"}>{entry.run.status === "completed" ? (passes ? "passed" : "below threshold") : entry.run.status}</Chip></td>
                        <td className="td text-right">{entry.run.status === "completed" && entry.run.id !== record.baseline_run_id ? <ActionButton path={`/api/evals/${id}/baseline`} body={{ runId: entry.run.id }} label="Promote to baseline" /> : null}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )
      ) : !a || !b || a.run.id === b.run.id ? (
        <Empty title="Pick two runs">Compare needs a baseline (or an earlier run) and a candidate. Select two runs on the Runs tab.</Empty>
      ) : (() => {
        const result = compareRuns(a.cells, b.cells);
        return (
          <div className="flex flex-col gap-4">
            <p className="flex flex-wrap items-center gap-2"><Chip tone="gray">BASELINE {label(a.run.id)}</Chip> → <Chip tone="accent">CANDIDATE {label(b.run.id)}</Chip><span className="text-xs text-ink-2">{result.matched} cells share the same factor combination</span></p>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Stat label="Score" value={signed(diff(result.baseline.score, result.candidate.score))} sub={`${fmtScore(result.baseline.score)} → ${fmtScore(result.candidate.score)}`} tone={(diff(result.baseline.score, result.candidate.score) ?? 0) < 0 ? "bad" : "good"} />
              <Stat label="Pass rate" value={fmtPct(result.candidate.passRate)} sub={`was ${fmtPct(result.baseline.passRate)}`} />
              <Stat label="p50 latency" value={result.candidate.p50LatencyMs == null ? "—" : `${result.candidate.p50LatencyMs} ms`} sub={`was ${result.baseline.p50LatencyMs ?? "—"} ms`} />
              <Stat label="Cost / run" value={fmtCost(result.candidate.cost)} sub={`was ${fmtCost(result.baseline.cost)}`} />
            </div>
            {result.matched === 0 ? <Banner tone="warn" title="Nothing to line up">These runs share no factor combinations, so per-cell comparison is empty.</Banner> : null}
            <section className="card p-4">
              <h2 className="mb-3 font-semibold">Per-factor delta</h2>
              <div className="grid gap-4 md:grid-cols-2">
                {Object.entries(result.deltas).map(([factor, values]) => (
                  <div key={factor}>
                    <h3 className="mb-1 text-xs font-semibold text-ink-2">{factor}</h3>
                    <ul className="flex flex-col gap-1.5">
                      {Object.entries(values).map(([value, delta]) => (
                        <li key={value} className="grid grid-cols-[minmax(0,1fr)_120px_48px] items-center gap-2 text-xs">
                          <span className="truncate font-mono" title={value}>{value}</span><Bar value={delta} signed /><span className={`text-right font-mono ${delta !== null && delta < 0 ? "text-bad" : ""}`}>{signed(delta)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </section>
            <section className="card p-4">
              <h2 className="mb-1 font-semibold">Regressions <span className="font-normal text-ink-2">· cells that dropped ≥ 0.10</span></h2>
              {result.regressions.length === 0 ? <p className="text-ink-2">No cell regressed.</p> : (
                <ul className="flex flex-col divide-y divide-line">
                  {result.regressions.slice(0, 25).map((pair) => (
                    <li key={pair.candidate.id} className="flex flex-col gap-1.5 py-3">
                      <span className="flex flex-wrap items-center gap-1.5">{Object.entries(pair.candidate.labels).map(([k, v]) => <Chip key={k}>{k}: {v}</Chip>)}<span className="font-mono text-xs text-bad">{fmtScore(pair.baseline.score)} → {fmtScore(pair.candidate.score)}</span></span>
                      <span className="grid gap-2 text-xs md:grid-cols-2"><span className="rounded-el bg-tint p-2 whitespace-pre-wrap">{pair.baseline.output}</span><span className="rounded-el bg-bad-bg/40 p-2 whitespace-pre-wrap">{pair.candidate.output}</span></span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            {b.run.status === "completed" && b.run.id !== record.baseline_run_id ? <div><ActionButton path={`/api/evals/${id}/baseline`} body={{ runId: b.run.id }} label={`Promote ${label(b.run.id)} to baseline`} className="btn btn-primary" /></div> : null}
          </div>
        );
      })()}
    </>
  );
}
