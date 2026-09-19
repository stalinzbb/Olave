"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";

import { Banner, Chip, FACTOR_TONE } from "@/components/kit";
import { Results, type GraderName } from "@/components/results";
import { ChipInput, InsertVariable, VariableRow } from "@/components/studio-variables";
import { api, readLines } from "@/lib/client-api";
import { buildAxes, cellAt, cellMath, countCells, specIssues, sweepValues, type CaseRow } from "@/lib/factors";
import type { CellRow } from "@/lib/results";
import { fmtCost } from "@/lib/results";
import type { EvalSpec, Factor, FactorKind } from "@/lib/spec";
import { extractVariables } from "@/lib/template";

export interface StudioProps {
  evalId: string;
  name: string;
  goal: string;
  version: number;
  spec: EvalSpec;
  datasets: Array<{ id: string; name: string; columns: string[]; rows: CaseRow[] }>;
  graders: Array<{ id: string; name: string; engine: string; versions: Array<{ id: string; version: number }> }>;
  models: Array<{ id: string; inputPrice: number | null; outputPrice: number | null }>;
  initialCells: CellRow[];
  initialRunId: string | null;
}

const KIND_LABEL: Record<FactorKind, string> = { models: "Models", variable: "Variable values", sweep: "Parameter sweep", prompt: "System prompts", cases: "Dataset cases" };

export function Studio(props: StudioProps) {
  const [name, setName] = useState(props.name);
  const [spec, setSpec] = useState(props.spec);
  const [version, setVersion] = useState(props.version);
  const [tab, setTab] = useState<"prompt" | "factors" | "preview" | "graders">("prompt");
  const [cells, setCells] = useState(props.initialCells);
  const [runId, setRunId] = useState(props.initialRunId);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(true);
  const [previewIdx, setPreviewIdx] = useState(0);
  const nextId = useRef(0);
  const promptRef = useRef<HTMLTextAreaElement>(null);

  const patch = (changes: Partial<EvalSpec>) => {
    setSpec((current) => ({ ...current, ...changes }));
    setSaved(false);
  };
  const patchFactor = (id: string, changes: Partial<Factor>) =>
    patch({ factors: spec.factors.map((f) => (f.id === id ? ({ ...f, ...changes } as Factor) : f)) });

  const rowsByDataset = useMemo(() => Object.fromEntries(props.datasets.map((d) => [d.id, d.rows])), [props.datasets]);
  const axes = useMemo(() => buildAxes(spec, rowsByDataset), [spec, rowsByDataset]);
  const total = countCells(axes);
  const issues = useMemo(() => {
    const found = specIssues(spec, axes);
    const allowed = new Set(props.models.map((m) => m.id));
    const used = new Set([spec.model, ...spec.factors.flatMap((f) => (f.kind === "models" && f.enabled ? f.values : []))]);
    if (spec.factors.some((f) => f.kind === "models" && f.enabled)) used.delete(spec.model);
    const blocked = [...used].filter((model) => !allowed.has(model));
    // Mirrors the server-side check in createRun, so the problem shows before the run is refused.
    if (blocked.length) found.push(`Not on the platform's model list: ${blocked.join(", ")}. Add it under Library → Models or swap it out.`);
    return found;
  }, [spec, axes, props.models]);
  const variables = useMemo(
    () => [...new Set([spec.systemPrompt, spec.userTemplate, ...spec.factors.flatMap((f) => (f.kind === "prompt" ? f.values : []))].flatMap(extractVariables))],
    [spec],
  );

  // Upper bound: prompt tokens at ~4 chars each, completions at max_tokens.
  const estimate = useMemo(() => {
    if (issues.length || total > 500) return null;
    let cost = 0;
    for (let i = 0; i < total; i += 1) {
      const cell = cellAt(spec, axes, i);
      const model = props.models.find((m) => m.id === cell.model);
      if (!model || model.inputPrice === null || model.outputPrice === null) return null;
      cost += (((cell.systemPrompt.length + cell.userPrompt.length) / 4) * model.inputPrice + cell.params.max_tokens * model.outputPrice) / 1_000_000;
    }
    return cost;
  }, [spec, axes, total, issues.length, props.models]);

  const graderNames: GraderName[] = spec.graders.flatMap((versionId) => {
    const grader = props.graders.find((g) => g.versions.some((v) => v.id === versionId));
    const v = grader?.versions.find((entry) => entry.id === versionId);
    return grader && v ? [{ versionId, name: grader.name, version: v.version, engine: grader.engine }] : [];
  });

  async function save() {
    const result = await api<{ version: number }>(`/api/evals/${props.evalId}`, "PUT", { name, goal: props.goal, spec });
    setVersion(result.version);
    setSaved(true);
  }

  async function refresh(id: string) {
    const result = await api<{ cells: CellRow[] }>(`/api/runs/${id}`);
    setCells(result.cells);
  }

  async function run(resume = false) {
    setError("");
    try {
      if (!resume) await save();
      const response = await fetch(resume && runId ? `/api/runs/${runId}/resume` : `/api/evals/${props.evalId}/runs`, { method: "POST" });
      if (!response.ok) throw new Error(((await response.json().catch(() => ({}))) as { error?: string }).error ?? "Could not start the run.");
      let current = runId;
      await readLines(response, (event) => {
        if (event.type === "start") {
          current = event.runId as string;
          setRunId(current);
          if (!resume) setCells([]);
          setProgress({ done: 0, total: event.total as number });
        }
        if (event.type === "cell") {
          setProgress({ done: event.done as number, total: event.total as number });
          if ((event.done as number) % 5 === 0 && current) void refresh(current);
        }
        if (event.type === "error") setError(event.message as string);
      });
      if (current) await refresh(current);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The run failed.");
    } finally {
      setProgress(null);
    }
  }

  function addFactor(kind: FactorKind) {
    const id = `f${Date.now().toString(36)}${(nextId.current += 1)}`;
    const base = { id, enabled: true };
    const unbound = variables.find((v) => !(v in spec.fixed) && !spec.factors.some((f) => f.kind === "variable" && f.name === v));
    const factor: Factor =
      kind === "models" ? { ...base, kind, name: "model", values: [spec.model] }
      : kind === "variable" ? { ...base, kind, name: unbound ?? "variable", values: [] }
      : kind === "sweep" ? { ...base, kind, name: "temperature", param: "temperature", from: 0, to: 1, steps: 3 }
      : kind === "prompt" ? { ...base, kind, name: "system", values: [spec.systemPrompt] }
      : { ...base, kind, name: "cases", datasetId: props.datasets[0]?.id ?? "", tag: null, sample: "first", n: 5, mapping: {} };
    patch({ factors: [...spec.factors, factor] });
    setTab("factors");
  }

  const running = progress !== null;
  const pending = cells.filter((cell) => cell.status !== "done").length;
  const preview = total > 0 && !issues.some((i) => i.includes("no values")) ? cellAt(spec, axes, Math.min(previewIdx, total - 1)) : null;

  return (
    <div className="-m-6 flex h-[calc(100%+3rem)] flex-col">
      <header className="flex flex-wrap items-center gap-3 border-b border-line bg-surface px-4 py-2">
        <Link href={`/evals/${props.evalId}`} className="btn btn-ghost btn-sm">← Eval</Link>
        <input aria-label="Eval name" className="field !w-64 font-medium" value={name} onChange={(e) => { setName(e.target.value); setSaved(false); }} />
        <Chip tone="gray">v{version}</Chip>
        <Chip tone={saved ? "good" : "warn"}>{saved ? "saved" : "unsaved"}</Chip>
        <span className="ml-auto font-mono text-xs text-ink-2">{cellMath(axes)} cells{estimate !== null ? ` · est. ≤ ${fmtCost(estimate)}` : ""}</span>
        <button type="button" className="btn btn-secondary" disabled={saved || running} onClick={() => save().catch((e) => setError(e.message))}>Save</button>
        <button type="button" className="btn btn-primary" disabled={running || issues.length > 0} onClick={() => run()}>
          {running ? `Running ${progress.done}/${progress.total}` : `Run ${total}`}
        </button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <section aria-label="Composer" className="flex w-full shrink-0 flex-col border-r border-line bg-surface lg:w-[400px]">
          <div role="tablist" className="flex gap-1 border-b border-line px-3 pt-2">
            {(["prompt", "factors", "preview", "graders"] as const).map((t) => (
              <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className="tab">
                {t === "factors" ? "variations" : t}{t === "factors" ? ` · ${spec.factors.filter((f) => f.enabled).length}` : t === "graders" ? ` · ${spec.graders.length}` : ""}
              </button>
            ))}
          </div>
          <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
            {tab === "prompt" ? (
              <>
                <label className="flex flex-col gap-1">
                  <span className="label">System prompt</span>
                  <textarea className="field min-h-24 font-mono text-xs" value={spec.systemPrompt} onChange={(e) => patch({ systemPrompt: e.target.value })} />
                  {spec.factors.some((f) => f.kind === "prompt" && f.enabled) ? <span className="hint">Overridden by the system-prompt factor.</span> : null}
                </label>
                <div className="flex flex-col gap-1">
                  <label className="label" htmlFor="user-prompt">User prompt</label>
                  <textarea id="user-prompt" ref={promptRef} className="field min-h-40 font-mono text-xs" value={spec.userTemplate} onChange={(e) => patch({ userTemplate: e.target.value })} />
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="hint">Anything in {"{{double braces}}"} is a variable.</span>
                    <InsertVariable
                      onInsert={(name) => {
                        const box = promptRef.current;
                        const at = box ? box.selectionStart : spec.userTemplate.length;
                        const end = box ? box.selectionEnd : at;
                        patch({ userTemplate: `${spec.userTemplate.slice(0, at)}{{${name}}}${spec.userTemplate.slice(end)}` });
                        box?.focus();
                      }}
                    />
                  </div>
                </div>
                <fieldset className="flex flex-col gap-2">
                  <legend className="label mb-1">Variables{variables.length ? ` · ${variables.length}` : ""}</legend>
                  {variables.length === 0 ? <p className="hint">None yet. Insert one above to reuse this prompt across different inputs, tones, audiences…</p> : null}
                  {variables.map((key) => <VariableRow key={key} name={key} spec={spec} datasets={props.datasets} patch={patch} />)}
                </fieldset>
                {preview ? (
                  <details className="rounded-el border border-line p-2" open>
                    <summary className="cursor-pointer text-xs font-semibold text-ink-2">What the model will see · run 1 of {total}</summary>
                    <pre className="mt-2 max-h-40 overflow-y-auto font-mono text-xs whitespace-pre-wrap">{cellAt(spec, axes, 0).userPrompt}</pre>
                  </details>
                ) : null}
                <div className="grid grid-cols-2 gap-2">
                  <label className="col-span-2 flex flex-col gap-1">
                    <span className="label">Default model</span>
                    <select className="field font-mono text-xs" value={spec.model} onChange={(e) => patch({ model: e.target.value })}>
                      {props.models.some((m) => m.id === spec.model) ? null : <option value={spec.model}>{spec.model} (not on the platform list)</option>}
                      {props.models.map((m) => <option key={m.id} value={m.id}>{m.id}</option>)}
                    </select>
                    {spec.factors.some((f) => f.kind === "models" && f.enabled) ? <span className="hint">Not used while a Models variation is on.</span> : null}
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="label">Temperature</span>
                    <input className="field" type="number" min={0} max={2} step={0.1} value={spec.params.temperature} onChange={(e) => patch({ params: { ...spec.params, temperature: Number(e.target.value) } })} />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="label">Max tokens</span>
                    <input className="field" type="number" min={1} max={8000} value={spec.params.max_tokens} onChange={(e) => patch({ params: { ...spec.params, max_tokens: Number(e.target.value) || 1 } })} />
                  </label>
                </div>
              </>
            ) : null}

            {tab === "factors" ? (
              <>
                {spec.factors.length === 0 ? <p className="hint">One prompt, one run. Add a variation to fan it out: each one multiplies the number of runs. Variables are easiest to set up from the Prompt tab.</p> : null}
                {spec.factors.map((factor) => {
                  const count = axes.find((axis) => axis.factor.id === factor.id)?.values.length ?? 0;
                  return (
                    <div key={factor.id} className="card flex flex-col gap-2 p-3">
                      <div className="flex items-center gap-2">
                        <input type="checkbox" aria-label={`Enable ${factor.name}`} checked={factor.enabled} onChange={(e) => patchFactor(factor.id, { enabled: e.target.checked })} />
                        <Chip tone={FACTOR_TONE[factor.kind]}>{KIND_LABEL[factor.kind]}</Chip>
                        <input aria-label="Factor name" className="field font-mono text-xs" value={factor.name} onChange={(e) => patchFactor(factor.id, { name: e.target.value })} />
                        <span className="font-mono text-xs text-ink-2">×{factor.enabled ? count : 1}</span>
                        <button type="button" className="btn btn-ghost btn-sm" aria-label={`Remove ${factor.name}`} onClick={() => patch({ factors: spec.factors.filter((f) => f.id !== factor.id) })}>✕</button>
                      </div>
                      {factor.kind === "variable" ? (
                        <>
                          <ChipInput label={`Values for ${factor.name}`} values={factor.values} onChange={(values) => patchFactor(factor.id, { values })} />
                          {variables.includes(factor.name) ? null : <p className="hint text-warn">No {`{{${factor.name}}}`} in the prompt, so these values change nothing. Rename it or insert the variable.</p>}
                        </>
                      ) : null}
                      {factor.kind === "models" ? (
                        <div className="flex flex-col gap-1">
                          {props.models.map((m) => (
                            <label key={m.id} className="flex items-center gap-2 font-mono text-xs">
                              <input type="checkbox" checked={factor.values.includes(m.id)} onChange={(e) => patchFactor(factor.id, { values: e.target.checked ? [...factor.values, m.id] : factor.values.filter((v) => v !== m.id) })} />
                              {m.id}
                            </label>
                          ))}
                          {factor.values.filter((v) => !props.models.some((m) => m.id === v)).map((v) => (
                            <label key={v} className="flex items-center gap-2 font-mono text-xs text-bad">
                              <input type="checkbox" checked onChange={() => patchFactor(factor.id, { values: factor.values.filter((x) => x !== v) })} />
                              {v} <span className="font-sans">(not on the platform list: untick to remove)</span>
                            </label>
                          ))}
                        </div>
                      ) : null}
                      {factor.kind === "prompt" ? (
                        <div className="flex flex-col gap-2">
                          {factor.values.map((value, i) => (
                            <div key={i} className="flex items-start gap-1">
                              <textarea aria-label={`System prompt variant ${i + 1}`} className="field min-h-16 font-mono text-xs" value={value} onChange={(e) => patchFactor(factor.id, { values: factor.values.map((v, j) => (j === i ? e.target.value : v)) })} />
                              <button type="button" className="btn btn-ghost btn-sm" aria-label={`Remove variant ${i + 1}`} onClick={() => patchFactor(factor.id, { values: factor.values.filter((_, j) => j !== i) })}>✕</button>
                            </div>
                          ))}
                          <button type="button" className="btn btn-secondary btn-sm self-start" onClick={() => patchFactor(factor.id, { values: [...factor.values, ""] })}>+ Variant</button>
                        </div>
                      ) : null}
                      {factor.kind === "sweep" ? (
                        <div className="grid grid-cols-4 gap-2">
                          <select aria-label="Parameter" className="field col-span-4" value={factor.param} onChange={(e) => patchFactor(factor.id, { param: e.target.value as "temperature" })}>
                            <option value="temperature">temperature</option><option value="top_p">top_p</option><option value="max_tokens">max_tokens</option>
                          </select>
                          {(["from", "to", "steps"] as const).map((key) => (
                            <label key={key} className="flex flex-col gap-0.5 text-xs text-ink-2">{key}
                              <input className="field" type="number" step={key === "steps" ? 1 : 0.1} min={key === "steps" ? 1 : 0} max={key === "steps" ? 10 : undefined} value={factor[key]} onChange={(e) => patchFactor(factor.id, { [key]: Number(e.target.value) })} />
                            </label>
                          ))}
                          <p className="hint self-end font-mono">{sweepValues(factor.from, factor.to, factor.steps, factor.param === "max_tokens").join(", ")}</p>
                        </div>
                      ) : null}
                      {factor.kind === "cases" ? (
                        props.datasets.length === 0 ? <p className="hint">No datasets yet. <Link className="text-accent underline" href="/datasets">Upload a CSV</Link> first.</p> : (
                          <div className="grid grid-cols-2 gap-2">
                            <select aria-label="Dataset" className="field col-span-2" value={factor.datasetId} onChange={(e) => patchFactor(factor.id, { datasetId: e.target.value })}>
                              {props.datasets.map((d) => <option key={d.id} value={d.id}>{d.name} · {d.rows.length} rows</option>)}
                            </select>
                            <select aria-label="Sampling" className="field" value={factor.sample} onChange={(e) => patchFactor(factor.id, { sample: e.target.value as "first" })}>
                              <option value="first">First N</option><option value="random">Random N (seeded)</option><option value="all">All rows</option>
                            </select>
                            <input aria-label="N" className="field" type="number" min={1} max={500} disabled={factor.sample === "all"} value={factor.n} onChange={(e) => patchFactor(factor.id, { n: Number(e.target.value) || 1 })} />
                            <input aria-label="Tag filter" className="field col-span-2" placeholder="tag filter (optional), e.g. golden-set" value={factor.tag ?? ""} onChange={(e) => patchFactor(factor.id, { tag: e.target.value || null })} />
                            <p className="hint col-span-2">Columns: {props.datasets.find((d) => d.id === factor.datasetId)?.columns.map((c) => `{{${c}}}`).join(" ") || "—"}</p>
                          </div>
                        )
                      ) : null}
                    </div>
                  );
                })}
                <div className="flex flex-wrap gap-1.5">
                  {(Object.keys(KIND_LABEL) as FactorKind[]).map((kind) => (
                    <button key={kind} type="button" className="btn btn-secondary btn-sm" onClick={() => addFactor(kind)}>+ {KIND_LABEL[kind]}</button>
                  ))}
                </div>
                <p className="rounded-el bg-tint p-3 font-mono text-xs">{axes.map((a) => `${a.values.length} ${a.factor.name}`).join(" × ") || "1"} = {total} cells</p>
              </>
            ) : null}

            {tab === "preview" ? (
              preview ? (
                <>
                  <div className="flex items-center gap-2">
                    <button type="button" className="btn btn-secondary btn-sm" disabled={previewIdx <= 0} onClick={() => setPreviewIdx((i) => i - 1)}>←</button>
                    <span className="font-mono text-xs">combination {Math.min(previewIdx, total - 1) + 1} / {total}</span>
                    <button type="button" className="btn btn-secondary btn-sm" disabled={previewIdx >= total - 1} onClick={() => setPreviewIdx((i) => i + 1)}>→</button>
                  </div>
                  <div className="flex flex-wrap gap-1">{Object.entries(preview.labels).map(([k, v]) => <Chip key={k}>{k}: {v}</Chip>)}</div>
                  <pre className="code">{`POST openrouter.ai/api/v1/chat/completions\nmodel: ${preview.model}\ntemperature: ${preview.params.temperature} · top_p: ${preview.params.top_p} · max_tokens: ${preview.params.max_tokens}\n\n[system]\n${preview.systemPrompt || "(none)"}\n\n[user]\n${preview.userPrompt}`}</pre>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm self-start"
                    onClick={() => {
                      const body = JSON.stringify({ model: preview.model, messages: [{ role: "system", content: preview.systemPrompt }, { role: "user", content: preview.userPrompt }], ...preview.params });
                      // The key is a shell variable placeholder: no real key ever exists in the browser.
                      void navigator.clipboard.writeText(`curl https://openrouter.ai/api/v1/chat/completions -H "Authorization: Bearer $OPENROUTER_API_KEY" -H "Content-Type: application/json" -d '${body.replace(/'/g, "'\\''")}'`);
                    }}
                  >
                    Copy as cURL
                  </button>
                </>
              ) : <p className="hint">Fix the issues below to preview a request.</p>
            ) : null}

            {tab === "graders" ? (
              <>
                {props.graders.length === 0 ? <p className="hint">No graders yet. <Link className="text-accent underline" href="/graders">Create one</Link>: outputs are stored but unscored without a grader.</p> : <p className="hint">The first pinned grader is the headline score. Versions are pinned: editing a grader never changes this eval until you bump it.</p>}
                {props.graders.map((grader) => {
                  const latest = [...grader.versions].sort((a, b) => b.version - a.version)[0];
                  const pinned = grader.versions.find((v) => spec.graders.includes(v.id));
                  const position = pinned ? spec.graders.indexOf(pinned.id) : -1;
                  return (
                    <div key={grader.id} className="card flex items-center gap-2 p-3">
                      <input
                        type="checkbox"
                        aria-label={`Use ${grader.name}`}
                        checked={Boolean(pinned)}
                        onChange={(e) => patch({ graders: e.target.checked ? [...spec.graders, latest.id] : spec.graders.filter((id) => id !== pinned?.id) })}
                      />
                      <span className="min-w-0 flex-1 truncate font-medium">{grader.name}</span>
                      <Chip tone="gray">{grader.engine}</Chip>
                      {position === 0 ? <Chip tone="accent">headline</Chip> : null}
                      {pinned ? <Chip>v{pinned.version}</Chip> : null}
                      {pinned && pinned.id !== latest.id ? (
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => patch({ graders: spec.graders.map((id) => (id === pinned.id ? latest.id : id)) })}>Bump to v{latest.version}</button>
                      ) : null}
                    </div>
                  );
                })}
                <label className="flex flex-col gap-1">
                  <span className="label">Run passes when headline average ≥</span>
                  <input className="field !w-24" type="number" min={0} max={1} step={0.05} value={spec.passThreshold} onChange={(e) => patch({ passThreshold: Number(e.target.value) })} />
                </label>
              </>
            ) : null}
          </div>
          {issues.length ? (
            <div className="border-t border-line p-3">
              <Banner tone="warn" title="Before you run">
                <ul className="list-disc pl-4">{issues.map((issue) => <li key={issue}>{issue}</li>)}</ul>
              </Banner>
            </div>
          ) : null}
        </section>

        <section aria-label="Results" className="min-w-0 flex-1 overflow-y-auto p-4">
          <div className="mb-3 flex items-center gap-2 text-xs text-ink-2">
            <span aria-hidden className={`size-2 rounded-full ${running ? "pulse bg-accent" : cells.length ? "bg-ok" : "bg-line-strong"}`} />
            <span aria-live="polite">{running ? `Running · ${progress.done} of ${progress.total} cells` : cells.length ? "Latest run" : "Idle"}</span>
            {!running && runId && pending > 0 ? <button type="button" className="btn btn-secondary btn-sm" onClick={() => run(true)}>Resume {pending} unfinished</button> : null}
          </div>
          {error ? <div className="mb-3"><Banner tone="bad" title="Run problem">{error}</Banner></div> : null}
          <Results cells={cells} graders={graderNames} />
        </section>
      </div>
      <datalist id="models">{props.models.map((m) => <option key={m.id} value={m.id} />)}</datalist>
    </div>
  );
}
