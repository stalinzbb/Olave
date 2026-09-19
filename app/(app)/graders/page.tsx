import Link from "next/link";

import { Chip, Empty, PageHeader } from "@/components/kit";
import { listGraders } from "@/lib/server/data";
import { requireUser } from "@/lib/server/supabase";

const ENGINES = [
  { engine: "jev", title: "Jev grader", body: "Typed rubric scores and yes/no checks with calibrated confidence. Fast enough to grade every cell." },
  { engine: "judge", title: "LLM judge", body: "A reasoning model scores the rubric and explains itself. Slower and costlier; good for nuance." },
  { engine: "code", title: "Code check", body: "Deterministic: word limits, regex, JSON shape, exact match against a reference." },
];

export default async function GradersPage() {
  const { supabase } = await requireUser();
  const graders = await listGraders(supabase);
  return (
    <>
      <PageHeader eyebrow="Library" title="Graders" description="Versioned scoring. Evals pin a grader version, so tightening a rubric never silently changes old results." />
      <div className="mb-6 grid gap-3 md:grid-cols-3">
        {ENGINES.map((item) => (
          <Link key={item.engine} href={`/graders/new?engine=${item.engine}`} className="card flex flex-col gap-1 p-4 hover:border-accent">
            <span className="font-semibold">+ {item.title}</span>
            <span className="hint">{item.body}</span>
          </Link>
        ))}
      </div>
      {graders.length === 0 ? <Empty title="No graders yet">Without a grader, outputs are stored but unscored.</Empty> : (
        <div className="card overflow-x-auto">
          <table className="w-full border-collapse">
            <thead><tr><th className="th">Grader</th><th className="th">Engine</th><th className="th">Latest</th><th className="th">Updated</th></tr></thead>
            <tbody>
              {graders.map((grader) => {
                const latest = [...grader.grader_versions].sort((a, b) => b.version - a.version)[0];
                return (
                  <tr key={grader.id} className="hover:bg-tint">
                    <td className="td"><Link href={`/graders/${grader.id}`} className="font-medium hover:underline">{grader.name}</Link><p className="hint">{grader.description}</p></td>
                    <td className="td"><Chip tone={grader.engine === "jev" ? "accent" : grader.engine === "judge" ? "info" : "gray"}>{grader.engine}</Chip></td>
                    <td className="td font-mono text-xs">v{latest?.version ?? 1}</td>
                    <td className="td text-xs text-ink-2">{latest ? new Date(latest.created_at).toLocaleDateString() : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
