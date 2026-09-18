import { route } from "@/lib/server/http";
import { streamRun } from "@/lib/server/runner";

export const maxDuration = 300;

export const POST = route<{ id: string }>(async ({ supabase }, _request, { id }) => streamRun(supabase, id));
