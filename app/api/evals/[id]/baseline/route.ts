import { NextResponse } from "next/server";
import { z } from "zod";

import { must } from "@/lib/server/data";
import { HttpError, readJson, route } from "@/lib/server/http";

export const POST = route<{ id: string }>(async ({ supabase }, request, { id }) => {
  const { runId } = z.object({ runId: z.string().uuid() }).parse(await readJson(request));
  const run = must(await supabase.from("runs").select("eval_id, status").eq("id", runId).maybeSingle(), "Run") as unknown as { eval_id: string; status: string };
  if (run.eval_id !== id) throw new HttpError(422, "That run belongs to a different eval.");
  if (run.status !== "completed") throw new HttpError(422, "Only a completed run can be the baseline.");
  const updated = await supabase.from("evals").update({ baseline_run_id: runId }).eq("id", id);
  if (updated.error) throw new Error(updated.error.message);
  return NextResponse.json({ ok: true });
});
