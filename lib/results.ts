import type { ScoredCell } from "@/lib/compare";

/** Row shapes as they come back from Supabase (snake_case). */
export interface GradeRow {
  id: string;
  cell_id: string;
  grader_version_id: string;
  score: number | null;
  pass: boolean | null;
  confidence: number | null;
  flagged: boolean;
  raw: Record<string, unknown>;
}
export interface CellRow {
  id: string;
  run_id: string;
  idx: number;
  labels: Record<string, string>;
  model: string;
  system_prompt: string;
  user_prompt: string;
  vars: Record<string, string>;
  params: Record<string, number>;
  status: "pending" | "done" | "error";
  output: string | null;
  error: string | null;
  provider: string | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  latency_ms: number | null;
  cost: number | null;
  grades: GradeRow[];
}
export interface RunRow {
  id: string;
  eval_id: string;
  eval_version_id: string;
  status: "running" | "completed" | "failed";
  trigger: string;
  total_cells: number;
  created_at: string;
  completed_at: string | null;
}

/** A cell's headline number: the first pinned grader, else the mean of whatever graded it. */
export function headline(cell: CellRow, headlineGraderVersionId?: string) {
  const pinned = cell.grades.find((grade) => grade.grader_version_id === headlineGraderVersionId);
  if (pinned) return { score: pinned.score, pass: pinned.pass };
  const scores = cell.grades.map((g) => g.score).filter((s): s is number => s !== null);
  const passes = cell.grades.map((g) => g.pass).filter((p): p is boolean => p !== null);
  return {
    score: scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null,
    pass: passes.length ? passes.every(Boolean) : null,
  };
}

export const toScoredCells = (cells: CellRow[], headlineGraderVersionId?: string): ScoredCell[] =>
  cells.map((cell) => ({
    id: cell.id,
    labels: cell.labels,
    ...headline(cell, headlineGraderVersionId),
    latencyMs: cell.latency_ms,
    cost: cell.cost === null ? null : Number(cell.cost),
    output: cell.output,
  }));

export const fmtScore = (score: number | null | undefined) => (score == null ? "—" : score.toFixed(2));
export const fmtPct = (value: number | null | undefined) => (value == null ? "—" : `${Math.round(value * 100)}%`);
export const fmtCost = (value: number | null | undefined) => (value == null ? "—" : `$${value.toFixed(value < 1 ? 4 : 2)}`);
export const scoreTone = (score: number | null | undefined) =>
  score == null ? "neutral" : score >= 0.8 ? "good" : score >= 0.6 ? "neutral" : "bad";
