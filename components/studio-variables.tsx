"use client";

import Link from "next/link";
import { useState } from "react";

import type { CaseRow } from "@/lib/factors";
import type { EvalSpec, Factor } from "@/lib/spec";
import { VARIABLE_KEY_PATTERN } from "@/lib/template";

export interface StudioDataset {
  id: string;
  name: string;
  columns: string[];
  rows: CaseRow[];
}
type CasesFactor = Extract<Factor, { kind: "cases" }>;
type Mode = "fixed" | "values" | "dataset";

/** Type a value, press Enter. Paste several lines to add them all. Backspace on an empty box removes the last. */
export function ChipInput({ values, onChange, label, placeholder, max = 50 }: { values: string[]; onChange: (next: string[]) => void; label: string; placeholder?: string; max?: number }) {
  const [text, setText] = useState("");
  const add = (raw: string) => {
    const incoming = raw.split("\n").map((v) => v.trim()).filter(Boolean);
    if (!incoming.length) return;
    onChange([...new Set([...values, ...incoming])].slice(0, max));
    setText("");
  };
  return (
    <div className="field flex min-h-8 flex-wrap items-center gap-1 !p-1">
      {values.map((value) => (
        <span key={value} className="inline-flex max-w-full items-center gap-1 rounded-inner bg-accent-soft px-1.5 py-0.5 text-xs text-accent">
          <span className="truncate" title={value}>{value}</span>
          <button type="button" aria-label={`Remove ${value}`} className="leading-none hover:text-bad" onClick={() => onChange(values.filter((v) => v !== value))}>×</button>
        </span>
      ))}
      <input
        aria-label={label}
        className="min-w-24 flex-1 bg-transparent px-1 text-sm outline-none placeholder:text-ink-3"
        value={text}
        placeholder={values.length ? "add another…" : (placeholder ?? "type a value, press Enter")}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            add(text);
          } else if (e.key === "Backspace" && !text && values.length) {
            onChange(values.slice(0, -1));
          }
        }}
        onPaste={(e) => {
          const pasted = e.clipboardData.getData("text");
          if (pasted.includes("\n")) {
            e.preventDefault();
            add(pasted);
          }
        }}
        onBlur={() => add(text)}
      />
    </div>
  );
}

/**
 * One row per {{variable}} found in the prompts. The person picks how it gets its value; the matching
 * factor is created, renamed and removed for them, so they never have to keep a name in sync by hand.
 */
export function VariableRow({ name, spec, datasets, patch }: { name: string; spec: EvalSpec; datasets: StudioDataset[]; patch: (changes: Partial<EvalSpec>) => void }) {
  const valuesFactor = spec.factors.find((f) => f.kind === "variable" && f.name === name);
  const cases = spec.factors.find((f): f is CasesFactor => f.kind === "cases");
  const dataset = datasets.find((d) => d.id === cases?.datasetId);
  const sameNameColumn = Boolean(cases && dataset?.columns.includes(name));
  const mappedColumn = cases?.mapping?.[name];
  const mode: Mode = valuesFactor ? "values" : mappedColumn || sameNameColumn ? "dataset" : "fixed";
  const column = mappedColumn ?? (sameNameColumn ? name : "");

  const withoutValues = spec.factors.filter((f) => f !== valuesFactor);
  const withoutMapping = (factors: Factor[]) =>
    factors.map((f) => (f.kind === "cases" && f.mapping?.[name] ? { ...f, mapping: Object.fromEntries(Object.entries(f.mapping).filter(([key]) => key !== name)) } : f));
  const withoutFixed = () => Object.fromEntries(Object.entries(spec.fixed).filter(([key]) => key !== name));

  function setMode(next: Mode) {
    if (next === mode) return;
    if (next === "fixed") patch({ factors: withoutMapping(withoutValues) });
    if (next === "values") {
      const seed = spec.fixed[name] ? [spec.fixed[name]] : [];
      patch({ fixed: withoutFixed(), factors: [...withoutMapping(withoutValues), { id: `var:${name}`.slice(0, 64), kind: "variable", name, enabled: true, values: seed }] });
    }
    if (next === "dataset") bindColumn(datasets[0]?.id ?? "", "");
  }

  /** Point this variable at a dataset column, creating the dataset factor if the eval has none yet. */
  function bindColumn(datasetId: string, pickedColumn: string) {
    const target = datasets.find((d) => d.id === datasetId);
    if (!target) return;
    const chosen = pickedColumn || (target.columns.includes(name) ? name : (target.columns[0] ?? ""));
    const entry = chosen && chosen !== name ? { [name]: chosen } : {};
    const base: CasesFactor = cases ?? { id: "cases", kind: "cases", name: "cases", enabled: true, datasetId, tag: null, sample: "first", n: 5, mapping: {} };
    const kept = Object.fromEntries(Object.entries(base.mapping ?? {}).filter(([key]) => key !== name));
    const updated: CasesFactor = { ...base, enabled: true, datasetId, mapping: base.datasetId === datasetId ? { ...kept, ...entry } : entry };
    const others = withoutValues.filter((f) => f !== cases);
    patch({ fixed: withoutFixed(), factors: [...others, updated] });
  }

  return (
    <div className="flex flex-col gap-1.5 rounded-el border border-line p-2">
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate font-mono text-xs font-medium" title={name}>{`{{${name}}}`}</code>
        <select aria-label={`How ${name} gets its value`} className="field !w-auto text-xs" value={mode} onChange={(e) => setMode(e.target.value as Mode)} disabled={sameNameColumn && !mappedColumn && !valuesFactor}>
          <option value="fixed">One fixed value</option>
          <option value="values">Try several values</option>
          <option value="dataset" disabled={datasets.length === 0}>From a dataset column</option>
        </select>
      </div>

      {mode === "fixed" ? (
        <input
          aria-label={`Value for ${name}`}
          className="field"
          placeholder="value used in every run"
          value={spec.fixed[name] ?? ""}
          onChange={(e) => patch({ fixed: e.target.value ? { ...spec.fixed, [name]: e.target.value } : withoutFixed() })}
        />
      ) : null}

      {mode === "values" && valuesFactor?.kind === "variable" ? (
        <>
          <ChipInput label={`Values for ${name}`} values={valuesFactor.values} onChange={(values) => patch({ factors: spec.factors.map((f) => (f === valuesFactor ? { ...valuesFactor, values } : f)) })} />
          <p className="hint">Each value is run separately: ×{Math.max(1, valuesFactor.values.length)}.</p>
        </>
      ) : null}

      {mode === "dataset" ? (
        dataset ? (
          <>
            <div className="grid grid-cols-2 gap-2">
              <select aria-label={`Dataset for ${name}`} className="field text-xs" value={dataset.id} onChange={(e) => bindColumn(e.target.value, "")}>
                {datasets.map((d) => <option key={d.id} value={d.id}>{d.name} · {d.rows.length} rows</option>)}
              </select>
              <select aria-label={`Column for ${name}`} className="field text-xs" value={column} onChange={(e) => bindColumn(dataset.id, e.target.value)}>
                {dataset.columns.map((c) => <option key={c} value={c}>column: {c}</option>)}
              </select>
            </div>
            <p className="hint truncate" title={dataset.rows[0]?.data[column]}>
              {sameNameColumn && !mappedColumn ? "Filled automatically: the dataset has a column with this name. " : ""}
              First row: {dataset.rows[0]?.data[column] ? `“${dataset.rows[0].data[column]}”` : "(empty)"}
            </p>
          </>
        ) : (
          <p className="hint">No datasets yet. <Link className="text-accent underline" href="/datasets">Upload a CSV</Link> first.</p>
        )
      ) : null}
    </div>
  );
}

/** Small "+ variable" control: inserts {{name}} at the prompt's cursor. */
export function InsertVariable({ onInsert }: { onInsert: (name: string) => void }) {
  const [name, setName] = useState("");
  const valid = VARIABLE_KEY_PATTERN.test(name);
  const submit = () => {
    if (!valid) return;
    onInsert(name);
    setName("");
  };
  return (
    <span className="flex items-center gap-1">
      <input
        aria-label="New variable name"
        className="field !w-36 font-mono text-xs"
        placeholder="variable_name"
        value={name}
        onChange={(e) => setName(e.target.value.replace(/\s+/g, "_"))}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            submit();
          }
        }}
      />
      <button type="button" className="btn btn-secondary btn-sm" disabled={!valid} onClick={submit}>+ Insert variable</button>
    </span>
  );
}
