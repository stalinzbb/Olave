import { NextResponse } from "next/server";

import { route } from "@/lib/server/http";

export const POST = route(async ({ supabase }) => {
  await supabase.auth.signOut();
  return NextResponse.json({ ok: true });
});
