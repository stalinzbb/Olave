import { GraderEditor } from "@/components/grader-editor";
import { DEFAULT_CONFIG } from "@/lib/grader-defaults";
import { PageHeader } from "@/components/kit";
import { listPlatformModels } from "@/lib/server/data";
import { requireUser } from "@/lib/server/supabase";
import type { Engine } from "@/lib/spec";

const NAMES: Record<Engine, string> = { jev: "Summary quality (Jev)", judge: "Summary quality (judge)", code: "Word limit" };

export default async function NewGraderPage({ searchParams }: { searchParams: Promise<{ engine?: string }> }) {
  const { supabase } = await requireUser();
  const requested = (await searchParams).engine;
  const engine: Engine = requested === "judge" || requested === "code" ? requested : "jev";
  const models = engine === "judge" ? (await listPlatformModels(supabase)).map((m) => m.id) : [];
  return (
    <>
      <PageHeader eyebrow="Graders" title={`New ${engine} grader`} />
      <GraderEditor graderId={null} initial={{ name: NAMES[engine], description: "", config: DEFAULT_CONFIG[engine] }} models={models} />
    </>
  );
}
