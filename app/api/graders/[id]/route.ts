import { NextResponse } from "next/server";
import { z } from "zod";

import { must } from "@/lib/server/data";
import { HttpError, readJson, route } from "@/lib/server/http";
import { graderConfigSchema } from "@/lib/spec";

const body = z.object({ name: z.string().min(1).max(120), description: z.string().max(500).default(""), config: graderConfigSchema });

/** Always a new immutable version. Evals stay pinned to the one they chose until someone bumps them. */
export const PUT = route<{ id: string }>(async ({ supabase }, request, { id }) => {
  const input = body.parse(await readJson(request));
  const grader = must(await supabase.from("graders").select("engine, grader_versions(version)").eq("id", id).maybeSingle(), "Grader") as unknown as {
    engine: string;
    grader_versions: Array<{ version: number }>;
  };
  if (grader.engine !== input.config.engine) throw new HttpError(422, "A grader cannot change engine; create a new grader instead.");
  const version = Math.max(0, ...grader.grader_versions.map((v) => v.version)) + 1;
  const meta = await supabase.from("graders").update({ name: input.name, description: input.description }).eq("id", id);
  if (meta.error) throw new Error(meta.error.message);
  const inserted = must(await supabase.from("grader_versions").insert({ grader_id: id, version, config: input.config }).select("id").single(), "Version") as { id: string };
  return NextResponse.json({ id, version, versionId: inserted.id });
});

export const DELETE = route<{ id: string }>(async ({ supabase }, _request, { id }) => {
  const removed = await supabase.from("graders").delete().eq("id", id);
  if (removed.error) throw new Error(removed.error.message);
  return NextResponse.json({ ok: true });
});
