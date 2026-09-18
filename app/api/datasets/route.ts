import { NextResponse } from "next/server";
import { z } from "zod";

import { parseCsv } from "@/lib/csv";
import { must } from "@/lib/server/data";
import { HttpError, readJson, route } from "@/lib/server/http";
import { MAX_DATASET_ROWS } from "@/lib/spec";

const body = z.object({ name: z.string().min(1).max(120), csv: z.string().min(1).max(1_900_000) });

/** Column headers become template variable keys. An optional "tags" column (a|b|c) feeds tag filters. */
export const POST = route(async ({ supabase }, request) => {
  const input = body.parse(await readJson(request));
  const rows = parseCsv(input.csv);
  if (!rows.length) throw new HttpError(422, "The CSV has no data rows.");
  if (rows.length > MAX_DATASET_ROWS) throw new HttpError(422, `Datasets are capped at ${MAX_DATASET_ROWS} rows.`);
  const columns = Object.keys(rows[0]).filter((column) => column !== "tags");

  const dataset = must(await supabase.from("datasets").insert({ name: input.name, columns }).select("id").single(), "Dataset") as { id: string };
  const inserted = await supabase.from("dataset_rows").insert(
    rows.map((row, idx) => {
      const { tags = "", ...data } = row;
      return { dataset_id: dataset.id, idx, data, tags: tags.split("|").map((tag) => tag.trim()).filter(Boolean) };
    }),
  );
  if (inserted.error) {
    await supabase.from("datasets").delete().eq("id", dataset.id);
    throw new Error(inserted.error.message);
  }
  return NextResponse.json({ id: dataset.id, rows: rows.length }, { status: 201 });
});
