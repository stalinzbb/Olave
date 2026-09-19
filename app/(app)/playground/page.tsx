import Link from "next/link";

import { Empty, PageHeader } from "@/components/kit";
import { Playground } from "@/components/playground";
import { listPlatformModels } from "@/lib/server/data";
import { requireUser } from "@/lib/server/supabase";

export default async function PlaygroundPage() {
  const { supabase } = await requireUser();
  const models = (await listPlatformModels(supabase)).map((model) => model.id); // default first
  return (
    <>
      <PageHeader eyebrow="Workspace" title="Playground" description="One prompt, one run. Try it on up to four models side by side, then save it as an eval when it is worth measuring." />
      {models.length === 0 ? (
        <Empty title="No models yet">Add a model under <Link className="text-accent underline" href="/models">Library → Models</Link> first.</Empty>
      ) : (
        <Playground models={models} defaultModel={models[0]} />
      )}
    </>
  );
}
