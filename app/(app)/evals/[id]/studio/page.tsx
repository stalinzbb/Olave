import { Studio } from "@/components/studio";
import type { CaseRow } from "@/lib/factors";
import { getEval, getRun, listDatasets, listGraders, listRuns, must } from "@/lib/server/data";
import { listModels } from "@/lib/server/openrouter";
import { requireUser } from "@/lib/server/supabase";

export default async function StudioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requireUser();
  const [record, datasets, graders, runs, models] = await Promise.all([getEval(supabase, id), listDatasets(supabase), listGraders(supabase), listRuns(supabase, id), listModels()]);
  // ponytail: ships every dataset row to the editor so cell counts and previews are exact; send counts + a sample when datasets get big.
  const withRows = await Promise.all(
    datasets.map(async (dataset) => ({
      ...dataset,
      rows: must(await supabase.from("dataset_rows").select("data, tags").eq("dataset_id", dataset.id).order("idx"), "Rows") as CaseRow[],
    })),
  );
  const latest = runs[0] ? await getRun(supabase, runs[0].id) : null;

  return (
    <Studio
      evalId={id}
      name={record.name}
      goal={record.goal}
      version={record.version}
      spec={record.spec}
      datasets={withRows}
      graders={graders.map((g) => ({ id: g.id, name: g.name, engine: g.engine, versions: g.grader_versions }))}
      models={models.map(({ id: modelId, inputPrice, outputPrice }) => ({ id: modelId, inputPrice, outputPrice }))}
      initialCells={latest?.cells ?? []}
      initialRunId={latest?.run.id ?? null}
    />
  );
}
