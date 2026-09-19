import { NextResponse } from "next/server";
import { z } from "zod";

import { assertModelsAllowed } from "@/lib/server/data";
import { readJson, route, safeMessage } from "@/lib/server/http";
import { complete } from "@/lib/server/openrouter";
import { paramsSchema } from "@/lib/spec";

export const maxDuration = 120;

const body = z.object({
  system: z.string().max(20000).default(""),
  user: z.string().min(1).max(20000),
  models: z.array(z.string().min(1).max(120)).min(1).max(4),
  params: paramsSchema,
});

/** One prompt, up to four models, nothing stored. Same allowlist and the same server-only keys as a run. */
export const POST = route(async ({ supabase }, request) => {
  const input = body.parse(await readJson(request));
  const models = [...new Set(input.models)];
  await assertModelsAllowed(supabase, models);
  const results = await Promise.all(
    models.map(async (model) => {
      try {
        const result = await complete({ model, system: input.system, user: input.user, params: input.params });
        return { model, ...result, error: null };
      } catch (error) {
        return { model, output: "", error: safeMessage(error) }; // redacted: provider errors can echo request details
      }
    }),
  );
  return NextResponse.json({ results });
});
