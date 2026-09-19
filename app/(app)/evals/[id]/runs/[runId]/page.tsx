import Link from "next/link";

import { Chip, PageHeader } from "@/components/kit";
import { Results } from "@/components/results";
import { getGraderVersions, getRun, getVersionSpec } from "@/lib/server/data";
import { requireUser } from "@/lib/server/supabase";

export default async function RunPage({ params }: { params: Promise<{ id: string; runId: string }> }) {
  const { id, runId } = await params;
  const { supabase } = await requireUser();
  const { run, cells } = await getRun(supabase, runId);
  const graders = await getGraderVersions(supabase, (await getVersionSpec(supabase, run.eval_version_id)).graders);
  return (
    <>
      <PageHeader
        eyebrow="Run"
        title={<span className="font-mono">run {run.id.slice(0, 6)}</span>}
        description={<span className="flex items-center gap-2"><Chip tone={run.status === "completed" ? "good" : run.status === "failed" ? "bad" : "info"}>{run.status}</Chip>{new Date(run.created_at).toLocaleString()} · {run.trigger}</span>}
        actions={<Link href={`/evals/${id}`} className="btn btn-secondary">Back to eval</Link>}
      />
      <Results cells={cells} graders={graders.map((g) => ({ versionId: g.id, name: g.name, version: g.version, engine: g.config.engine }))} />
    </>
  );
}
