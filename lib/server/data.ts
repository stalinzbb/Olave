import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { CaseRow, RowsByDataset } from "@/lib/factors";
import { HttpError } from "@/lib/http-error";
import type { CellRow, RunRow } from "@/lib/results";
import { evalSpecSchema, graderConfigSchema, type EvalSpec, type GraderConfig } from "@/lib/spec";

/** Supabase errors can carry query detail; callers only ever see a generic message. */
export function must<T>(result: { data: T | null; error: { message: string } | null }, what: string): T {
  if (result.error) throw new Error(`${what}: ${result.error.message}`);
  if (result.data === null) throw new HttpError(404, `${what} not found.`);
  return result.data;
}

export interface EvalRecord {
  id: string;
  name: string;
  goal: string;
  baseline_run_id: string | null;
  updated_at: string;
  versionId: string;
  version: number;
  spec: EvalSpec;
}

export async function getEval(supabase: SupabaseClient, id: string): Promise<EvalRecord> {
  const row = must(
    await supabase.from("evals").select("*, eval_versions(id, version, spec)").eq("id", id).maybeSingle(),
    "Eval",
  ) as { eval_versions: Array<{ id: string; version: number; spec: unknown }> } & Omit<EvalRecord, "versionId" | "version" | "spec">;
  const latest = [...row.eval_versions].sort((a, b) => b.version - a.version)[0];
  if (!latest) throw new HttpError(404, "Eval has no versions.");
  return { ...row, versionId: latest.id, version: latest.version, spec: evalSpecSchema.parse(latest.spec) };
}

export async function getVersionSpec(supabase: SupabaseClient, versionId: string): Promise<EvalSpec> {
  const row = must(await supabase.from("eval_versions").select("spec").eq("id", versionId).maybeSingle(), "Eval version");
  return evalSpecSchema.parse((row as unknown as { spec: unknown }).spec);
}

export async function loadCaseRows(supabase: SupabaseClient, spec: EvalSpec): Promise<RowsByDataset> {
  const ids = [...new Set(spec.factors.flatMap((f) => (f.kind === "cases" && f.enabled ? [f.datasetId] : [])))];
  const out: RowsByDataset = {};
  for (const id of ids) {
    const rows = must(
      await supabase.from("dataset_rows").select("data, tags").eq("dataset_id", id).order("idx"),
      "Dataset rows",
    ) as CaseRow[];
    out[id] = rows;
  }
  return out;
}

export interface GraderVersionRecord {
  id: string;
  version: number;
  graderId: string;
  name: string;
  config: GraderConfig;
}

export async function getGraderVersions(supabase: SupabaseClient, ids: string[]): Promise<GraderVersionRecord[]> {
  if (!ids.length) return [];
  const rows = must(
    await supabase.from("grader_versions").select("id, version, config, graders(id, name)").in("id", ids),
    "Grader versions",
  ) as unknown as Array<{ id: string; version: number; config: unknown; graders: { id: string; name: string } }>;
  const byId = new Map(rows.map((row) => [row.id, row]));
  // keep the eval's order: the first pinned grader is the headline
  return ids.flatMap((id) => {
    const row = byId.get(id);
    return row ? [{ id, version: row.version, graderId: row.graders.id, name: row.graders.name, config: graderConfigSchema.parse(row.config) }] : [];
  });
}

export async function getRun(supabase: SupabaseClient, runId: string): Promise<{ run: RunRow; cells: CellRow[] }> {
  const run = must(await supabase.from("runs").select("*").eq("id", runId).maybeSingle(), "Run") as RunRow;
  const cells = must(await supabase.from("cells").select("*, grades(*)").eq("run_id", runId).order("idx"), "Cells") as CellRow[];
  return { run, cells };
}

export async function listGraders(supabase: SupabaseClient) {
  return must(
    await supabase.from("graders").select("id, name, description, engine, created_at, grader_versions(id, version, created_at)").order("created_at"),
    "Graders",
  ) as unknown as Array<{
    id: string;
    name: string;
    description: string;
    engine: string;
    grader_versions: Array<{ id: string; version: number; created_at: string }>;
  }>;
}

export async function listDatasets(supabase: SupabaseClient) {
  return must(await supabase.from("datasets").select("id, name, columns, created_at").order("created_at"), "Datasets") as Array<{
    id: string;
    name: string;
    columns: string[];
    created_at: string;
  }>;
}

export async function listRuns(supabase: SupabaseClient, evalId: string): Promise<RunRow[]> {
  return must(await supabase.from("runs").select("*").eq("eval_id", evalId).order("created_at", { ascending: false }).limit(50), "Runs") as RunRow[];
}

export interface PlatformModel {
  id: string;
  is_default: boolean;
}

/** The allowlist of models this workspace may call. Default first. */
export async function listPlatformModels(supabase: SupabaseClient): Promise<PlatformModel[]> {
  const rows = must(await supabase.from("models").select("id, is_default").order("created_at"), "Models") as PlatformModel[];
  return [...rows].sort((a, b) => Number(b.is_default) - Number(a.is_default));
}
