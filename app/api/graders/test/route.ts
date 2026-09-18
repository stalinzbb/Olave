import { NextResponse } from "next/server";
import { z } from "zod";

import { must } from "@/lib/server/data";
import { grade } from "@/lib/server/graders";
import { readJson, route, safeMessage } from "@/lib/server/http";
import type { CellRow } from "@/lib/results";
import { graderConfigSchema } from "@/lib/spec";

export const maxDuration = 120;

const body = z.object({ config: graderConfigSchema });

/** "Test on 5 cells": try an unsaved grader config against the most recent real outputs. Nothing is stored. */
export const POST = route(async ({ supabase }, request) => {
  const { config } = body.parse(await readJson(request));
  const cells = must(
    await supabase.from("cells").select("id, model, user_prompt, output, vars, labels").eq("status", "done").order("id", { ascending: false }).limit(5),
    "Cells",
  ) as unknown as Array<Pick<CellRow, "id" | "model" | "user_prompt" | "output" | "vars" | "labels">>;
  const results = await Promise.all(
    cells.map(async (cell) => ({
      cellId: cell.id,
      labels: cell.labels,
      output: (cell.output ?? "").slice(0, 400),
      grade: await grade(config, { model: cell.model, userPrompt: cell.user_prompt, output: cell.output ?? "", vars: cell.vars }).catch(
        (error) => ({ score: null, pass: null, confidence: null, flagged: true, raw: { error: safeMessage(error) } }),
      ),
    })),
  );
  return NextResponse.json({ results });
});
