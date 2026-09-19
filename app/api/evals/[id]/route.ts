import { NextResponse } from "next/server";
import { z } from "zod";

import { getEval } from "@/lib/server/data";
import { readJson, route } from "@/lib/server/http";
import { evalSpecSchema } from "@/lib/spec";

const body = z.object({ name: z.string().min(1).max(120), goal: z.string().max(500).default(""), spec: evalSpecSchema });

/** Saving never edits a version in place: past runs keep pointing at the exact spec they ran. */
export const PUT = route<{ id: string }>(async ({ supabase }, request, { id }) => {
  const input = body.parse(await readJson(request));
  const current = await getEval(supabase, id);
  const meta = await supabase.from("evals").update({ name: input.name, goal: input.goal, updated_at: new Date().toISOString() }).eq("id", id);
  if (meta.error) throw new Error(meta.error.message);
  let version = current.version;
  if (JSON.stringify(current.spec) !== JSON.stringify(input.spec)) {
    version += 1;
    const inserted = await supabase.from("eval_versions").insert({ eval_id: id, version, spec: input.spec });
    if (inserted.error) throw new Error(inserted.error.message);
  }
  return NextResponse.json({ id, version });
});

export const DELETE = route<{ id: string }>(async ({ supabase }, _request, { id }) => {
  const removed = await supabase.from("evals").delete().eq("id", id);
  if (removed.error) throw new Error(removed.error.message);
  return NextResponse.json({ ok: true });
});
