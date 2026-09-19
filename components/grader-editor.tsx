"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Banner, Chip, type Tone } from "@/components/kit";
import { api } from "@/lib/client-api";
import { fmtScore, scoreTone } from "@/lib/results";
import { graderConfigSchema, type Check, type Criterion, type Engine, type Grade, type GraderConfig, type NoulCheck } from "@/lib/spec";

const uid = () => Math.random().toString(36).slice(2, 8);

const CHECK_DEFAULTS: Record<Check["type"], Check> = {
  max_words: { type: "max_words", max: 40 },
  min_words: { type: "min_words", min: 5 },
  contains: { type: "contains", text: "", caseSensitive: false },
  not_contains: { type: "not_contains", text: "", caseSensitive: false },
  regex: { type: "regex", pattern: "", flags: "" },
  equals_reference: { type: "equals_reference" },
  valid_json: { type: "valid_json" },
  json_has_keys: { type: "json_has_keys", keys: ["answer"] },
};

interface TestResult { cellId: string; labels: Record<string, string>; output: string; grade: Grade }

export function GraderEditor({ graderId, initial, models }: { graderId: string | null; initial: { name: string; description: string; config: GraderConfig }; models: string[] }) {
  const router = useRouter();
  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description);
  const [config, setConfig] = useState(initial.config);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [tests, setTests] = useState<TestResult[] | null>(null);

  const validate = () => {
    const parsed = graderConfigSchema.safeParse(config);
    if (!parsed.success) throw new Error(parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; "));
    return parsed.data;
  };
  const guard = async (work: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await work();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "That did not work.");
    } finally {
      setBusy(false);
    }
  };
  const save = () => guard(async () => {
    const body = { name, description, config: validate() };
    if (graderId) {
      await api(`/api/graders/${graderId}`, "PUT", body);
      router.refresh();
    } else {
      const { id } = await api<{ id: string }>("/api/graders", "POST", body);
      router.push(`/graders/${id}`);
    }
  });
  const test = () => guard(async () => setTests((await api<{ results: TestResult[] }>("/api/graders/test", "POST", { config: validate() })).results));

  const setCriteria = (criteria: Criterion[]) => setConfig((c) => (c.engine === "code" ? c : { ...c, criteria }));

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="flex flex-col gap-4">
        <div className="card grid gap-3 p-4 md:grid-cols-2">
          <label className="flex flex-col gap-1"><span className="label">Name</span><input className="field" value={name} onChange={(e) => setName(e.target.value)} /></label>
          <label className="flex flex-col gap-1"><span className="label">Description</span><input className="field" value={description} onChange={(e) => setDescription(e.target.value)} /></label>
        </div>

        {config.engine === "judge" ? (
          <div className="card grid gap-3 p-4 md:grid-cols-4">
            <label className="flex flex-col gap-1 md:col-span-2"><span className="label">Judge model</span><input className="field font-mono text-xs" list="judge-models" value={config.model} onChange={(e) => setConfig({ ...config, model: e.target.value })} /><span className="hint">Never the model under test. That is enforced at run time: matching cells are skipped and flagged.</span></label>
            <label className="flex flex-col gap-1"><span className="label">Temperature</span><input className="field" type="number" min={0} max={1} step={0.1} value={config.temperature} onChange={(e) => setConfig({ ...config, temperature: Number(e.target.value) })} /></label>
            <label className="flex flex-col gap-1"><span className="label">Samples per cell</span><input className="field" type="number" min={1} max={5} value={config.samples} onChange={(e) => setConfig({ ...config, samples: Number(e.target.value) || 1 })} /></label>
            <datalist id="judge-models">{models.map((m) => <option key={m} value={m} />)}</datalist>
          </div>
        ) : null}

        {config.engine === "jev" ? (
          <Banner tone="info" title="Jev grader (TypeSafe System One)">
            Each criterion becomes one Score question whose levels are your descriptors, and each yes/no check becomes a Noul. All of them go in a single request per cell and are answered independently; weights, thresholds and pass/fail stay in code, so you can change them without re-grading. Low-confidence grades are flagged for human review.
          </Banner>
        ) : null}

        {config.engine !== "code" ? (
          <section className="flex flex-col gap-3">
            <h2 className="font-semibold">Rubric criteria</h2>
            {config.criteria.map((criterion, i) => {
              const update = (changes: Partial<Criterion>) => setCriteria(config.criteria.map((c, j) => (j === i ? { ...c, ...changes } : c)));
              return (
                <details key={criterion.id} open className="card p-4">
                  <summary className="cursor-pointer font-medium">{criterion.name || "Untitled"} <span className="font-mono text-xs text-ink-2">weight {criterion.weight} · {criterion.levels.length} levels</span></summary>
                  <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_96px]">
                    <label className="flex flex-col gap-1"><span className="label">Name</span><input className="field" value={criterion.name} onChange={(e) => update({ name: e.target.value })} /></label>
                    <label className="flex flex-col gap-1"><span className="label">Weight</span><input className="field" type="number" min={0.1} step={0.5} value={criterion.weight} onChange={(e) => update({ weight: Number(e.target.value) || 1 })} /></label>
                    <label className="flex flex-col gap-1 md:col-span-2"><span className="label">What is being rated?</span><input className="field" value={criterion.instructions} onChange={(e) => update({ instructions: e.target.value })} /><span className="hint">One dimension only. Refer to `input`, `response` and `reference`.</span></label>
                    <label className="flex flex-col gap-1 md:col-span-2"><span className="label">Levels, worst → best, one per line (2–10)</span>
                      <textarea className="field min-h-28 text-xs" defaultValue={criterion.levels.join("\n")} onBlur={(e) => update({ levels: e.target.value.split("\n").map((l) => l.trim()).filter(Boolean) })} />
                      <span className="hint">Describe a concrete situation per level (“omits an amount or date”), not a degree (“somewhat faithful”). Each line must make sense on its own.</span>
                    </label>
                  </div>
                  <button type="button" className="btn btn-ghost btn-sm mt-2" onClick={() => setCriteria(config.criteria.filter((_, j) => j !== i))}>Remove criterion</button>
                </details>
              );
            })}
            <button type="button" className="btn btn-secondary btn-sm self-start" onClick={() => setCriteria([...config.criteria, { id: `c_${uid()}`, name: "New criterion", weight: 1, instructions: "How well does `response` …?", levels: ["Fails entirely", "Fully succeeds"] }])}>+ Criterion</button>
          </section>
        ) : null}

        {config.engine === "jev" ? (
          <section className="flex flex-col gap-3">
            <h2 className="font-semibold">Yes/no checks <span className="font-normal text-ink-2">· hard gates: any failing check fails the cell</span></h2>
            {config.nouls.map((check, i) => {
              const update = (changes: Partial<NoulCheck>) => setConfig({ ...config, nouls: config.nouls.map((n, j) => (j === i ? { ...n, ...changes } : n)) });
              return (
                <div key={check.id} className="card grid gap-3 p-4 md:grid-cols-[minmax(0,1fr)_120px_96px_auto]">
                  <label className="flex flex-col gap-1 md:col-span-4"><span className="label">Question</span><input className="field" value={check.instructions} onChange={(e) => update({ instructions: e.target.value })} /></label>
                  <label className="flex flex-col gap-1"><span className="label">Short name</span><input className="field" value={check.name} onChange={(e) => update({ name: e.target.value })} /></label>
                  <label className="flex flex-col gap-1"><span className="label">Passes when</span><select className="field" value={check.passWhen} onChange={(e) => update({ passWhen: e.target.value as "yes" })}><option value="yes">answer is yes</option><option value="no">answer is no</option></select></label>
                  <label className="flex flex-col gap-1"><span className="label">P ≥</span><input className="field" type="number" min={0.5} max={0.99} step={0.05} value={check.threshold} onChange={(e) => update({ threshold: Number(e.target.value) })} /></label>
                  <button type="button" className="btn btn-ghost btn-sm self-end" onClick={() => setConfig({ ...config, nouls: config.nouls.filter((_, j) => j !== i) })}>Remove</button>
                </div>
              );
            })}
            <button type="button" className="btn btn-secondary btn-sm self-start" onClick={() => setConfig({ ...config, nouls: [...config.nouls, { id: `n_${uid()}`, name: "New check", instructions: "Does `response` …?", passWhen: "yes", threshold: 0.5 }] })}>+ Yes/no check</button>
          </section>
        ) : null}

        {config.engine !== "code" ? (
          <div className="card grid gap-3 p-4 md:grid-cols-2">
            <label className="flex flex-col gap-1"><span className="label">Cell passes when weighted score ≥</span><input className="field" type="number" min={0} max={1} step={0.05} value={config.passScore} onChange={(e) => setConfig({ ...config, passScore: Number(e.target.value) })} /></label>
            {config.engine === "jev" ? <label className="flex flex-col gap-1"><span className="label">Flag for review when confidence &lt;</span><input className="field" type="number" min={0} max={1} step={0.05} value={config.flagBelowConfidence} onChange={(e) => setConfig({ ...config, flagBelowConfidence: Number(e.target.value) })} /><span className="hint">A starting point. Tune it against cells you have graded by hand.</span></label> : null}
          </div>
        ) : null}

        {config.engine === "code" ? (
          <section className="flex flex-col gap-3">
            <h2 className="font-semibold">Checks <span className="font-normal text-ink-2">· declarative only, nothing you type is executed</span></h2>
            {config.checks.map((check, i) => {
              const update = (next: Check) => setConfig({ ...config, checks: config.checks.map((c, j) => (j === i ? next : c)) });
              return (
                <div key={i} className="card flex flex-wrap items-center gap-2 p-3">
                  <select aria-label="Check type" className="field !w-44" value={check.type} onChange={(e) => update(CHECK_DEFAULTS[e.target.value as Check["type"]])}>
                    {Object.keys(CHECK_DEFAULTS).map((type) => <option key={type}>{type}</option>)}
                  </select>
                  {check.type === "max_words" ? <input aria-label="Max words" className="field !w-24" type="number" min={1} value={check.max} onChange={(e) => update({ ...check, max: Number(e.target.value) || 1 })} /> : null}
                  {check.type === "min_words" ? <input aria-label="Min words" className="field !w-24" type="number" min={1} value={check.min} onChange={(e) => update({ ...check, min: Number(e.target.value) || 1 })} /> : null}
                  {check.type === "contains" || check.type === "not_contains" ? <input aria-label="Text" className="field min-w-40 flex-1" value={check.text} onChange={(e) => update({ ...check, text: e.target.value })} /> : null}
                  {check.type === "regex" ? <input aria-label="Pattern" className="field min-w-40 flex-1 font-mono text-xs" placeholder="^Summary:" value={check.pattern} onChange={(e) => update({ ...check, pattern: e.target.value })} /> : null}
                  {check.type === "json_has_keys" ? <input aria-label="Keys, comma separated" className="field min-w-40 flex-1 font-mono text-xs" defaultValue={check.keys.join(", ")} onBlur={(e) => update({ ...check, keys: e.target.value.split(",").map((k) => k.trim()).filter(Boolean) })} /> : null}
                  {check.type === "equals_reference" ? <span className="hint">Compares with the dataset’s <code>reference</code> column (case and spacing ignored).</span> : null}
                  <button type="button" className="btn btn-ghost btn-sm ml-auto" onClick={() => setConfig({ ...config, checks: config.checks.filter((_, j) => j !== i) })}>Remove</button>
                </div>
              );
            })}
            <button type="button" className="btn btn-secondary btn-sm self-start" onClick={() => setConfig({ ...config, checks: [...config.checks, CHECK_DEFAULTS.max_words] })}>+ Check</button>
          </section>
        ) : null}

        {error ? <Banner tone="bad" title="Could not continue">{error}</Banner> : null}
        <div className="flex gap-2">
          <button type="button" className="btn btn-primary" disabled={busy} onClick={save}>{graderId ? "Save as new version" : "Create grader"}</button>
          <button type="button" className="btn btn-secondary" disabled={busy} onClick={test}>Test on 5 recent cells</button>
        </div>
        {graderId ? <p className="hint">Saving creates a new version. It does not rescore past runs, and evals stay pinned to the version they chose until you bump them in Studio.</p> : null}
      </div>

      <aside className="flex flex-col gap-3">
        <h2 className="font-semibold">Test results</h2>
        {tests === null ? <p className="hint">Runs this unsaved configuration against the five most recent outputs. Nothing is stored.</p> : tests.length === 0 ? <p className="hint">No completed cells yet. Run an eval first.</p> : null}
        {tests?.map((result) => (
          <div key={result.cellId} className="card flex flex-col gap-1.5 p-3">
            <span className="flex flex-wrap items-center gap-1.5">
              <Chip tone={scoreTone(result.grade.score) as Tone}>{fmtScore(result.grade.score)}</Chip>
              {result.grade.pass != null ? <Chip tone={result.grade.pass ? "good" : "bad"}>{result.grade.pass ? "pass" : "fail"}</Chip> : null}
              {result.grade.confidence != null ? <span className="text-xs text-ink-2">conf {result.grade.confidence.toFixed(2)}</span> : null}
              {result.grade.flagged ? <Chip tone="warn">flagged</Chip> : null}
            </span>
            <p className="line-clamp-3 text-xs text-ink-2">{result.output}</p>
            {"skipped" in result.grade.raw || "error" in result.grade.raw ? <p className="hint text-warn">{String(result.grade.raw.skipped ?? result.grade.raw.error)}</p> : null}
          </div>
        ))}
      </aside>
    </div>
  );
}
