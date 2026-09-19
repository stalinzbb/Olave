import Link from "next/link";

import { ActionButton } from "@/components/actions";
import { GraderEditor } from "@/components/grader-editor";
import { Chip, PageHeader } from "@/components/kit";
import { must } from "@/lib/server/data";
import { listModels } from "@/lib/server/openrouter";
import { requireUser } from "@/lib/server/supabase";
import { evalSpecSchema, graderConfigSchema } from "@/lib/spec";

export default async function GraderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requireUser();
  const grader = must(await supabase.from("graders").select("id, name, description, engine, grader_versions(id, version, config, created_at)").eq("id", id).maybeSingle(), "Grader") as unknown as {
    id: string; name: string; description: string; engine: string;
    grader_versions: Array<{ id: string; version: number; config: unknown; created_at: string }>;
  };
  const versions = [...grader.grader_versions].sort((a, b) => b.version - a.version);
  const config = graderConfigSchema.parse(versions[0].config);

  // Which evals pin which version of this grader (latest spec version of each eval).
  const evals = must(await supabase.from("evals").select("id, name, eval_versions(version, spec)"), "Evals") as unknown as Array<{ id: string; name: string; eval_versions: Array<{ version: number; spec: unknown }> }>;
  const usedBy = evals.flatMap((item) => {
    const latest = [...item.eval_versions].sort((a, b) => b.version - a.version)[0];
    const pinned = versions.find((v) => evalSpecSchema.parse(latest?.spec ?? {}).graders.includes(v.id));
    return pinned ? [{ id: item.id, name: item.name, version: pinned.version }] : [];
  });

  return (
    <>
      <PageHeader
        eyebrow="Graders"
        title={<>{grader.name} <span className="font-mono text-base text-ink-2">v{versions[0].version}</span></>}
        description={<span className="flex items-center gap-2"><Chip tone="gray">{grader.engine}</Chip>{versions.length} version{versions.length === 1 ? "" : "s"}</span>}
        actions={<ActionButton path={`/api/graders/${id}`} method="DELETE" label="Delete" confirmText={`Delete "${grader.name}"? Grades it produced are deleted too.`} className="btn btn-ghost" then="/graders" />}
      />
      <GraderEditor key={versions[0].id} graderId={id} initial={{ name: grader.name, description: grader.description, config }} models={config.engine === "judge" ? (await listModels()).map((m) => m.id) : []} />
      <section className="mt-8">
        <h2 className="mb-2 font-semibold">Used by</h2>
        {usedBy.length === 0 ? <p className="text-ink-2">No eval pins this grader yet. Pin it from an eval’s Graders tab in Studio.</p> : (
          <ul className="card divide-y divide-line">
            {usedBy.map((item) => (
              <li key={item.id} className="flex items-center gap-2 px-3 py-2">
                <Link href={`/evals/${item.id}/studio`} className="font-medium hover:underline">{item.name}</Link>
                <Chip tone={item.version === versions[0].version ? "good" : "warn"}>pinned v{item.version}{item.version === versions[0].version ? "" : ` · latest is v${versions[0].version}`}</Chip>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
