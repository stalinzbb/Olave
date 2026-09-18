import { route } from "@/lib/server/http";
import { createRun, streamRun } from "@/lib/server/runner";

export const maxDuration = 300;

export const POST = route<{ id: string }>(async ({ supabase }, _request, { id }) => {
  const { runId } = await createRun(supabase, id);
  return streamRun(supabase, runId);
});
