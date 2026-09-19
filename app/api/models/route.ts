import { NextResponse } from "next/server";
import { z } from "zod";

import { HttpError, readJson, route } from "@/lib/server/http";
import { listModels } from "@/lib/server/openrouter";

const body = z.object({ id: z.string().min(1).max(120) });

/** Add a model. It must exist in OpenRouter's catalogue: a typo here would otherwise fail every cell of a run. */
export const POST = route(async ({ supabase }, request) => {
  const { id } = body.parse(await readJson(request));
  const catalogue = await listModels();
  if (!catalogue.length) throw new HttpError(503, "Could not reach the OpenRouter catalogue to check that model. Try again.");
  if (!catalogue.some((model) => model.id === id)) throw new HttpError(422, `"${id}" is not in the OpenRouter catalogue.`);
  const existing = await supabase.from("models").select("id", { count: "exact", head: true });
  const inserted = await supabase.from("models").upsert({ id, is_default: (existing.count ?? 0) === 0 }, { onConflict: "id", ignoreDuplicates: true });
  if (inserted.error) throw new Error(inserted.error.message);
  return NextResponse.json({ id }, { status: 201 });
});

/** Make a model the default for new evals. */
export const PUT = route(async ({ supabase }, request) => {
  const { id } = body.parse(await readJson(request));
  // Check it exists before touching the current default, so a bad id cannot leave the platform with none.
  const found = await supabase.from("models").select("id").eq("id", id).maybeSingle();
  if (found.error) throw new Error(found.error.message);
  if (!found.data) throw new HttpError(404, "That model is not on the platform.");
  const cleared = await supabase.from("models").update({ is_default: false }).eq("is_default", true);
  if (cleared.error) throw new Error(cleared.error.message);
  const updated = await supabase.from("models").update({ is_default: true }).eq("id", id);
  if (updated.error) throw new Error(updated.error.message);
  return NextResponse.json({ id });
});

// Model ids contain "/", so the id travels in the body rather than the path.
export const DELETE = route(async ({ supabase }, request) => {
  const { id } = body.parse(await readJson(request));
  const removed = await supabase.from("models").delete().eq("id", id);
  if (removed.error) throw new Error(removed.error.message);
  return NextResponse.json({ ok: true });
});
