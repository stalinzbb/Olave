import { NextResponse } from "next/server";

import { route } from "@/lib/server/http";

export const DELETE = route<{ id: string }>(async ({ supabase }, _request, { id }) => {
  const removed = await supabase.from("datasets").delete().eq("id", id);
  if (removed.error) throw new Error(removed.error.message);
  return NextResponse.json({ ok: true });
});
