import { REGRESSION_DROP } from "@/lib/spec";

export interface ScoredCell {
  id: string;
  labels: Record<string, string>;
  score: number | null;
  pass: boolean | null;
  latencyMs: number | null;
  cost: number | null;
  output: string | null;
}

const mean = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : null);
const numbers = (values: Array<number | null>) => values.filter((v): v is number => typeof v === "number");
const keyOf = (labels: Record<string, string>) =>
  JSON.stringify(Object.entries(labels).sort(([a], [b]) => a.localeCompare(b)));

export function summarise(cells: ScoredCell[]) {
  const passes = cells.filter((cell) => cell.pass !== null);
  const latencies = numbers(cells.map((cell) => cell.latencyMs)).sort((a, b) => a - b);
  return {
    score: mean(numbers(cells.map((cell) => cell.score))),
    passRate: passes.length ? passes.filter((cell) => cell.pass).length / passes.length : null,
    p50LatencyMs: latencies.length ? latencies[Math.floor((latencies.length - 1) / 2)] : null,
    cost: numbers(cells.map((cell) => cell.cost)).reduce((a, b) => a + b, 0),
  };
}

/** Mean score per value of one factor, e.g. per model. */
export function byFactor(cells: ScoredCell[], factor: string): Record<string, number | null> {
  const groups: Record<string, number[]> = {};
  for (const cell of cells) {
    const label = cell.labels[factor];
    if (label === undefined) continue;
    (groups[label] ??= []).push(...numbers([cell.score]));
  }
  return Object.fromEntries(Object.entries(groups).map(([label, scores]) => [label, mean(scores)]));
}

/**
 * Cells are matched on their factor labels, not their index, so a run that added or
 * removed a factor value still lines up on the combinations both runs share.
 */
export function compareRuns(baseline: ScoredCell[], candidate: ScoredCell[], drop = REGRESSION_DROP) {
  const before = new Map(baseline.map((cell) => [keyOf(cell.labels), cell]));
  const pairs = candidate.flatMap((cell) => {
    const match = before.get(keyOf(cell.labels));
    return match ? [{ baseline: match, candidate: cell }] : [];
  });
  const regressions = pairs
    .filter((p) => p.baseline.score !== null && p.candidate.score !== null && p.baseline.score - p.candidate.score >= drop)
    .sort((a, b) => b.baseline.score! - b.candidate.score! - (a.baseline.score! - a.candidate.score!));
  const factors = [...new Set(pairs.flatMap((p) => Object.keys(p.candidate.labels)))];
  const deltas = Object.fromEntries(
    factors.map((factor) => {
      const a = byFactor(pairs.map((p) => p.baseline), factor);
      const b = byFactor(pairs.map((p) => p.candidate), factor);
      return [factor, Object.fromEntries(Object.keys(b).map((label) => [label, a[label] == null || b[label] == null ? null : b[label]! - a[label]!]))];
    }),
  );
  return { matched: pairs.length, baseline: summarise(baseline), candidate: summarise(candidate), regressions, deltas };
}
