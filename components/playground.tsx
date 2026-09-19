"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Banner, Chip } from "@/components/kit";
import { api } from "@/lib/client-api";
import { fmtCost } from "@/lib/results";
import { evalSpecSchema } from "@/lib/spec";

interface Result {
  model: string;
  output: string;
  error: string | null;
  provider?: string;
  promptTokens?: number;
  completionTokens?: number;
  latencyMs?: number;
  cost?: number | null;
}
interface Draft {
  system: string;
  user: string;
  models: string[];
  temperature: number;
  maxTokens: number;
}

const STORAGE_KEY = "olave:playground-draft"; // prompt text only; nothing secret ever lives in the browser
const MAX_MODELS = 4;

export function Playground({ models, defaultModel }: { models: string[]; defaultModel: string }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>({ system: "", user: "", models: [defaultModel], temperature: 0.7, maxTokens: 600 });
  const [results, setResults] = useState<Result[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Restore the last draft after mount (not during render, so server and client HTML match).
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as Draft | null;
      if (!saved) return;
      const stillAllowed = saved.models.filter((model) => models.includes(model));
      setDraft({ ...saved, models: stillAllowed.length ? stillAllowed : [defaultModel] });
    } catch {
      // a corrupt draft is not worth an error
    }
  }, [models, defaultModel]);

  const update = (changes: Partial<Draft>) =>
    setDraft((current) => {
      const next = { ...current, ...changes };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // storage full or blocked: the draft just will not survive a reload
      }
      return next;
    });

  const params = { temperature: draft.temperature, top_p: 1, max_tokens: draft.maxTokens };

  async function run() {
    setBusy(true);
    setError("");
    try {
      const response = await api<{ results: Result[] }>("/api/playground", "POST", { system: draft.system, user: draft.user, models: draft.models, params });
      setResults(response.results);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The run failed.");
    } finally {
      setBusy(false);
    }
  }

  async function saveAsEval() {
    setBusy(true);
    setError("");
    try {
      const spec = evalSpecSchema.parse({
        systemPrompt: draft.system,
        userTemplate: draft.user,
        model: draft.models[0],
        params,
        factors: draft.models.length > 1 ? [{ id: "models", kind: "models", name: "model", values: draft.models }] : [],
      });
      const name = draft.user.trim().split("\n")[0].slice(0, 60) || "From playground";
      const { id } = await api<{ id: string }>("/api/evals", "POST", { name, spec });
      router.push(`/evals/${id}/studio`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save the eval.");
      setBusy(false);
    }
  }

  const canRun = !busy && draft.user.trim().length > 0 && draft.models.length > 0;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (canRun) void run();
        }}
      >
        <label className="flex flex-col gap-1">
          <span className="label">System prompt <span className="font-normal text-ink-3">(optional)</span></span>
          <textarea className="field min-h-20 font-mono text-xs" value={draft.system} onChange={(e) => update({ system: e.target.value })} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="label">Prompt</span>
          <textarea
            className="field min-h-48 font-mono text-xs"
            value={draft.user}
            onChange={(e) => update({ user: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && canRun) void run();
            }}
            placeholder="Ask anything. ⌘↵ to run."
          />
        </label>
        <fieldset className="flex flex-col gap-1.5">
          <legend className="label mb-1">Models <span className="font-normal text-ink-3">(up to {MAX_MODELS}, side by side)</span></legend>
          {models.map((model) => {
            const checked = draft.models.includes(model);
            return (
              <label key={model} className="flex items-center gap-2 font-mono text-xs">
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={!checked && draft.models.length >= MAX_MODELS}
                  onChange={(e) => update({ models: e.target.checked ? [...draft.models, model] : draft.models.filter((m) => m !== model) })}
                />
                {model}
              </label>
            );
          })}
        </fieldset>
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1">
            <span className="label">Temperature</span>
            <input className="field" type="number" min={0} max={2} step={0.1} value={draft.temperature} onChange={(e) => update({ temperature: Number(e.target.value) })} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="label">Max tokens</span>
            <input className="field" type="number" min={1} max={8000} value={draft.maxTokens} onChange={(e) => update({ maxTokens: Number(e.target.value) || 1 })} />
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-primary" disabled={!canRun}>{busy ? "Running…" : draft.models.length > 1 ? `Run on ${draft.models.length} models` : "Run"}</button>
          <button type="button" className="btn btn-secondary" disabled={!canRun} onClick={saveAsEval} title="Opens this prompt in Studio, where you can add factors and graders">Save as eval</button>
        </div>
        <p className="hint">Nothing here is stored or graded. Write {"{{variable}}"} tokens if you plan to save this as an eval: they are sent as plain text here and become variables in Studio.</p>
      </form>

      <section aria-label="Outputs" aria-live="polite" className="flex min-w-0 flex-col gap-3">
        {error ? <Banner tone="bad" title="Could not run">{error}</Banner> : null}
        {results.length === 0 && !error ? <p className="card p-6 text-ink-2">Outputs appear here, one card per model.</p> : null}
        <div className={`grid gap-3 ${results.length > 1 ? "xl:grid-cols-2" : ""}`}>
          {results.map((result) => (
            <article key={result.model} className="card flex min-w-0 flex-col gap-2 p-4">
              <header className="flex flex-wrap items-center gap-1.5">
                <span className="font-mono text-xs font-medium">{result.model}</span>
                {result.provider === "mock" ? <Chip tone="warn">mock</Chip> : null}
                {result.error ? <Chip tone="bad">failed</Chip> : null}
              </header>
              {/* Model output is untrusted: plain text only, never HTML. */}
              <p className={`text-sm whitespace-pre-wrap ${result.error ? "text-bad" : ""}`}>{result.error ?? (result.output || "(empty response)")}</p>
              {result.error ? null : (
                <footer className="hint flex flex-wrap items-center gap-x-3 tabular-nums">
                  <span>{result.promptTokens ?? "—"} in · {result.completionTokens ?? "—"} out</span>
                  <span>{result.latencyMs ?? "—"} ms</span>
                  <span>{fmtCost(result.cost ?? null)}</span>
                  <button type="button" className="btn btn-ghost btn-sm ml-auto" onClick={() => void navigator.clipboard.writeText(result.output)}>Copy</button>
                </footer>
              )}
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
