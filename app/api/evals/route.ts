import { NextResponse } from "next/server";
import { z } from "zod";

import { must } from "@/lib/server/data";
import { readJson, route } from "@/lib/server/http";
import { evalSpecSchema } from "@/lib/spec";

const body = z.object({ name: z.string().min(1).max(120), goal: z.string().max(500).default(""), spec: evalSpecSchema });

export const POST = route(async ({ supabase }, request) => {
  const input = body.parse(await readJson(request));
  const created = must(await supabase.from("evals").insert({ name: input.name, goal: input.goal }).select("id").single(), "Eval") as { id: string };
  const version = await supabase.from("eval_versions").insert({ eval_id: created.id, version: 1, spec: input.spec });
  if (version.error) throw new Error(version.error.message);
  return NextResponse.json({ id: created.id }, { status: 201 });
});
