import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

import { buildAxes, cellAt, countCells, specIssues } from "@/lib/factors";
import { HttpError } from "@/lib/http-error";
import type { CellRow } from "@/lib/results";
import { getEval, getGraderVersions, getVersionSpec, listPlatformModels, loadCaseRows, must, type GraderVersionRecord } from "@/lib/server/data";
import { grade } from "@/lib/server/graders";
import { safeMessage } from "@/lib/server/http";
import { complete } from "@/lib/server/openrouter";
import { paramsSchema } from "@/lib/spec";

const CONCURRENCY = 6;

export type Progress =
  | { type: "start"; runId: string; total: number }
  | { type: "cell"; idx: number; status: "done" | "error"; done: number; total: number }
  | { type: "end"; runId: string; status: "completed" | "failed" };

/** Resolve every combination up front and persist it as pending, so a dropped connection can be resumed. */
export async function createRun(supabase: SupabaseClient, evalId: string, trigger = "manual") {
  const record = await getEval(supabase, evalId);
  const axes = buildAxes(record.spec, await loadCaseRows(supabase, record.spec));
  const issues = specIssues(record.spec, axes);
  if (issues.length) throw new HttpError(422, issues.join(" "));

  const total = countCells(axes);
  const resolved = Array.from({ length: total }, (_, idx) => cellAt(record.spec, axes, idx));

  // The platform allowlist is enforced here, server-side: the pickers in the UI are only a convenience.
  const allowed = new Set((await listPlatformModels(supabase)).map((model) => model.id));
  const judges = (await getGraderVersions(supabase, record.spec.graders)).flatMap((g) => (g.config.engine === "judge" ? [g.config.model] : []));
  const blocked = [...new Set([...resolved.map((cell) => cell.model), ...judges])].filter((model) => !allowed.has(model));
  if (blocked.length) throw new HttpError(422, `Not on the platform's model list: ${blocked.join(", ")}. Add it under Library → Models or pick another.`);

  const run = must(
    await supabase.from("runs").insert({ eval_id: evalId, eval_version_id: record.versionId, total_cells: total, trigger }).select("id").single(),
    "Run",
  ) as { id: string };
  const cells = resolved.map((cell, idx) => {
    return {
      run_id: run.id,
      idx,
      labels: cell.labels,
      model: cell.model,
      system_prompt: cell.systemPrompt,
      user_prompt: cell.userPrompt,
      vars: cell.vars,
      params: cell.params,
    };
  });
  const inserted = await supabase.from("cells").insert(cells);
  if (inserted.error) throw new Error(`Cells: ${inserted.error.message}`);
  return { runId: run.id, total };
}

async function runCell(supabase: SupabaseClient, cell: CellRow, graders: GraderVersionRecord[]): Promise<"done" | "error"> {
  try {
    const result = await complete({
      model: cell.model,
      system: cell.system_prompt,
      user: cell.user_prompt,
      params: paramsSchema.parse(cell.params),
    });
    await supabase
      .from("cells")
      .update({
        status: "done",
        error: null,
        output: result.output,
        provider: result.provider,
        prompt_tokens: result.promptTokens,
        completion_tokens: result.completionTokens,
        latency_ms: result.latencyMs,
        cost: result.cost,
      })
      .eq("id", cell.id);

    for (const grader of graders) {
      const graded = await grade(grader.config, {
        model: cell.model,
        userPrompt: cell.user_prompt,
        output: result.output,
        vars: cell.vars,
      }).catch((error) => ({ score: null, pass: null, confidence: null, flagged: true, raw: { error: safeMessage(error) } }));
      await supabase
        .from("grades")
        .upsert({ cell_id: cell.id, grader_version_id: grader.id, ...graded }, { onConflict: "cell_id,grader_version_id" });
    }
    return "done";
  } catch (error) {
    // redacted before it is persisted: provider errors can echo request headers
    await supabase.from("cells").update({ status: "error", error: safeMessage(error) }).eq("id", cell.id);
    return "error";
  }
}

// ponytail: runs execute inside the request, so the ceiling is the function's maxDuration.
// Anything unfinished stays "pending" and /resume picks it up; move to a queue/worker when runs outgrow that.
export async function executeRun(supabase: SupabaseClient, runId: string, emit: (event: Progress) => void) {
  const run = must(await supabase.from("runs").select("id, eval_version_id, total_cells").eq("id", runId).maybeSingle(), "Run") as {
    id: string;
    eval_version_id: string;
    total_cells: number;
  };
  const spec = await getVersionSpec(supabase, run.eval_version_id);
  const graders = await getGraderVersions(supabase, spec.graders);
  const todo = must(
    await supabase.from("cells").select("*").eq("run_id", runId).in("status", ["pending", "error"]).order("idx"),
    "Cells",
  ) as CellRow[];

  await supabase.from("runs").update({ status: "running", completed_at: null }).eq("id", runId);
  let done = run.total_cells - todo.length;
  let failed = 0;
  emit({ type: "start", runId, total: run.total_cells });

  const queue = [...todo];
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
      for (let cell = queue.shift(); cell; cell = queue.shift()) {
        const status = await runCell(supabase, cell, graders);
        done += 1;
        if (status === "error") failed += 1;
        emit({ type: "cell", idx: cell.idx, status, done, total: run.total_cells });
      }
    }),
  );

  const status = failed === todo.length && todo.length > 0 ? "failed" : "completed";
  await supabase.from("runs").update({ status, completed_at: new Date().toISOString() }).eq("id", runId);
  emit({ type: "end", runId, status });
}

/** NDJSON progress stream. The run keeps going server-side even if the reader goes away. */
export function streamRun(supabase: SupabaseClient, runId: string): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;
      const emit = (event: Progress | { type: "error"; message: string }) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          open = false;
        }
      };
      try {
        await executeRun(supabase, runId, emit);
      } catch (error) {
        console.error("[run]", safeMessage(error));
        emit({ type: "error", message: "The run stopped unexpectedly. Resume it to finish the remaining cells." });
      }
      if (open) controller.close();
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-store" } });
}
