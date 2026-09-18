import { NextResponse } from "next/server";

import { getRun } from "@/lib/server/data";
import { route } from "@/lib/server/http";

export const GET = route<{ id: string }>(async ({ supabase }, _request, { id }) => NextResponse.json(await getRun(supabase, id)));
