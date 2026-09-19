import { type EvalSpec, type Factor, type Params, MAX_CELLS } from "@/lib/spec";
import { extractVariables, renderTemplate } from "@/lib/template";

export interface CaseRow {
  data: Record<string, string>;
  tags: string[];
}
export type RowsByDataset = Record<string, CaseRow[]>;

interface AxisValue {
  label: string;
  model?: string;
  system?: string;
  vars?: Record<string, string>;
  params?: Partial<Params>;
}
export interface Axis {
  factor: Factor;
  values: AxisValue[];
}

export interface ResolvedCell {
  idx: number;
  labels: Record<string, string>;
  model: string;
  systemPrompt: string;
  userPrompt: string;
  vars: Record<string, string>;
  params: Params;
}

/** Deterministic RNG (mulberry32) so "random N" samples the same rows for the same seed. */
export function createRng(seedText: string): () => number {
  let hash = 1779033703 ^ seedText.length;
  for (let i = 0; i < seedText.length; i += 1) {
    hash = Math.imul(hash ^ seedText.charCodeAt(i), 3432918353);
    hash = (hash << 13) | (hash >>> 19);
  }
  let state = hash >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function sweepValues(from: number, to: number, steps: number, integer = false): number[] {
  if (steps <= 1) return [from];
  const values = Array.from({ length: steps }, (_, i) => from + ((to - from) * i) / (steps - 1));
  return values.map((v) => (integer ? Math.round(v) : Number(v.toFixed(3))));
}

function sampleRows(factor: Extract<Factor, { kind: "cases" }>, rows: CaseRow[], seed: string): CaseRow[] {
  const pool = factor.tag ? rows.filter((row) => row.tags.includes(factor.tag as string)) : rows;
  if (factor.sample === "all") return pool;
  if (factor.sample === "first") return pool.slice(0, factor.n);
  const rng = createRng(`${seed}:${factor.id}`);
  const shuffled = [...pool];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, factor.n);
}

const short = (value: string, max = 28) => (value.length > max ? `${value.slice(0, max - 1)}…` : value);

export function buildAxes(spec: EvalSpec, rowsByDataset: RowsByDataset = {}): Axis[] {
  return spec.factors
    .filter((factor) => factor.enabled)
    .map((factor): Axis => {
      switch (factor.kind) {
        case "models":
          return { factor, values: factor.values.map((model) => ({ label: model, model })) };
        case "variable":
          return { factor, values: factor.values.map((v) => ({ label: short(v), vars: { [factor.name]: v } })) };
        case "prompt":
          return { factor, values: factor.values.map((system, i) => ({ label: `sys ${i + 1}`, system })) };
        case "sweep":
          return {
            factor,
            values: sweepValues(factor.from, factor.to, factor.steps, factor.param === "max_tokens").map((v) => ({
              label: `${factor.param}=${v}`,
              params: { [factor.param]: v },
            })),
          };
        case "cases":
          return {
            factor,
            values: sampleRows(factor, rowsByDataset[factor.datasetId] ?? [], spec.seed).map((row, i) => ({
              label: `case ${i + 1}`,
              vars: row.data,
            })),
          };
      }
    });
}

export const countCells = (axes: Axis[]) => axes.reduce((product, axis) => product * axis.values.length, 1);

/** e.g. "3 × 2 × 5 = 30" */
export const cellMath = (axes: Axis[]) =>
  axes.length ? `${axes.map((axis) => axis.values.length).join(" × ")} = ${countCells(axes)}` : "1";

/** Mixed-radix decode: the last axis varies fastest. */
export function cellAt(spec: EvalSpec, axes: Axis[], idx: number): ResolvedCell {
  const labels: Record<string, string> = {};
  let model = spec.model;
  let system = spec.systemPrompt;
  let vars: Record<string, string> = { ...spec.fixed };
  let params: Params = { ...spec.params };
  let rest = idx;
  const picks: AxisValue[] = new Array(axes.length);
  for (let a = axes.length - 1; a >= 0; a -= 1) {
    const size = axes[a].values.length;
    picks[a] = axes[a].values[rest % size];
    rest = Math.floor(rest / size);
  }
  axes.forEach((axis, a) => {
    const pick = picks[a];
    labels[axis.factor.name] = pick.label;
    if (pick.model) model = pick.model;
    if (pick.system !== undefined) system = pick.system;
    if (pick.vars) vars = { ...vars, ...pick.vars };
    if (pick.params) params = { ...params, ...pick.params };
  });
  return {
    idx,
    labels,
    model,
    vars,
    params,
    systemPrompt: renderTemplate(system, vars).output,
    userPrompt: renderTemplate(spec.userTemplate, vars).output,
  };
}

/** Pre-flight problems that must block a run. */
export function specIssues(spec: EvalSpec, axes: Axis[]): string[] {
  const issues: string[] = [];
  if (!spec.userTemplate.trim()) issues.push("The user prompt is empty.");
  for (const axis of axes) {
    if (axis.values.length === 0) issues.push(`Factor "${axis.factor.name}" has no values.`);
  }
  const total = countCells(axes);
  if (total > MAX_CELLS) issues.push(`${total} cells exceeds the ${MAX_CELLS}-cell cap per run.`);

  const bound = new Set(Object.keys(spec.fixed));
  for (const axis of axes) for (const value of axis.values) for (const key of Object.keys(value.vars ?? {})) bound.add(key);
  const systems = [spec.systemPrompt, ...spec.factors.flatMap((f) => (f.kind === "prompt" && f.enabled ? f.values : []))];
  const used = new Set([spec.userTemplate, ...systems].flatMap(extractVariables));
  for (const key of used) if (!bound.has(key)) issues.push(`Variable {{${key}}} is unbound — give it a fixed value, a factor, or a dataset column.`);
  return issues;
}
