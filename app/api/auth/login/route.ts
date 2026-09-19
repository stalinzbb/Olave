import { NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, readJson } from "@/lib/server/http";
import { getSupabase } from "@/lib/server/supabase";

const body = z.object({ email: z.string().email().max(200), password: z.string().min(1).max(200) });

// The one handler that cannot require a session. Sign-in happens server-side so the browser
// never talks to Supabase directly; signups are disabled in Supabase, so only invited users exist.
export async function POST(request: Request) {
  try {
    const input = body.parse(await readJson(request));
    const supabase = await getSupabase();
    const { error } = await supabase.auth.signInWithPassword(input);
    // Same message whether the email exists or not.
    if (error) return NextResponse.json({ error: "Email or password is incorrect." }, { status: 401 });
    // Signed in to Supabase but not in `members`: RLS would show them an empty app, so say why and end the session.
    const member = await supabase.rpc("is_member");
    if (!member.error && member.data === false) {
      await supabase.auth.signOut();
      return NextResponse.json({ error: "This account is not a member of this workspace." }, { status: 403 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
