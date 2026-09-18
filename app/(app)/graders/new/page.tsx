import { DEFAULT_CONFIG, GraderEditor } from "@/components/grader-editor";
import { PageHeader } from "@/components/kit";
import { listModels } from "@/lib/server/openrouter";
import { requireUser } from "@/lib/server/supabase";
import type { Engine } from "@/lib/spec";

const NAMES: Record<Engine, string> = { jev: "Faithfulness (Jev)", judge: "Faithfulness (judge)", code: "Word limit" };

export default async function NewGraderPage({ searchParams }: { searchParams: Promise<{ engine?: string }> }) {
  await requireUser();
  const requested = (await searchParams).engine;
  const engine: Engine = requested === "judge" || requested === "code" ? requested : "jev";
  const models = engine === "judge" ? (await listModels()).map((m) => m.id) : [];
  return (
    <>
      <PageHeader eyebrow="Graders" title={`New ${engine} grader`} />
      <GraderEditor graderId={null} initial={{ name: NAMES[engine], description: "", config: DEFAULT_CONFIG[engine] }} models={models} />
    </>
  );
}
