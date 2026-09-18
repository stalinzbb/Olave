import { ActionButton } from "@/components/actions";
import { DatasetUpload } from "@/components/dataset-upload";
import { Chip, Empty, PageHeader } from "@/components/kit";
import { listDatasets } from "@/lib/server/data";
import { requireUser } from "@/lib/server/supabase";

export default async function DatasetsPage() {
  const { supabase } = await requireUser();
  const datasets = await Promise.all(
    (await listDatasets(supabase)).map(async (dataset) => ({
      ...dataset,
      rows: (await supabase.from("dataset_rows").select("id", { count: "exact", head: true }).eq("dataset_id", dataset.id)).count ?? 0,
    })),
  );
  return (
    <>
      <PageHeader eyebrow="Library" title="Datasets" description="Test cases for the Dataset cases factor. Each row is one case; each column fills a prompt variable." />
      <DatasetUpload />
      {datasets.length === 0 ? <Empty title="No datasets yet">Upload a CSV of real inputs. A small golden set you trust beats a large one you do not.</Empty> : (
        <div className="card overflow-x-auto">
          <table className="w-full border-collapse">
            <thead><tr><th className="th">Dataset</th><th className="th">Rows</th><th className="th">Columns</th><th className="th" /></tr></thead>
            <tbody>
              {datasets.map((dataset) => (
                <tr key={dataset.id}>
                  <td className="td font-medium">{dataset.name}</td>
                  <td className="td tabular-nums">{dataset.rows}</td>
                  <td className="td"><span className="flex flex-wrap gap-1">{dataset.columns.map((column) => <Chip key={column} tone={column === "reference" ? "accent" : "good"}>{column}</Chip>)}</span></td>
                  <td className="td text-right"><ActionButton path={`/api/datasets/${dataset.id}`} method="DELETE" label="Delete" confirmText={`Delete dataset "${dataset.name}"?`} className="btn btn-ghost btn-sm" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
