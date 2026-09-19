import { NextResponse } from "next/server";
import { z } from "zod";

import { must } from "@/lib/server/data";
import { readJson, route } from "@/lib/server/http";
import { graderConfigSchema } from "@/lib/spec";

const body = z.object({ name: z.string().min(1).max(120), description: z.string().max(500).default(""), config: graderConfigSchema });

export const POST = route(async ({ supabase }, request) => {
  const input = body.parse(await readJson(request));
  const created = must(
    await supabase.from("graders").insert({ name: input.name, description: input.description, engine: input.config.engine }).select("id").single(),
    "Grader",
  ) as { id: string };
  const version = must(await supabase.from("grader_versions").insert({ grader_id: created.id, version: 1, config: input.config }).select("id").single(), "Version") as { id: string };
  return NextResponse.json({ id: created.id, versionId: version.id }, { status: 201 });
});
