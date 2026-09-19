import "server-only";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { cookies } from "next/headers";

import { HttpError } from "@/lib/http-error";
import { env } from "@/lib/server/env";

export type Authed = { supabase: SupabaseClient; user: User };

/** Per-request client carrying the user's session, so RLS applies. There is no service-role client. */
export async function getSupabase(): Promise<SupabaseClient> {
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    throw new HttpError(503, "Supabase is not configured.");
  }
  const cookieStore = await cookies();
  return createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        try {
          for (const { name, value, options } of toSet) cookieStore.set(name, value, options);
        } catch {
          // Server Components cannot set cookies; proxy.ts refreshes the session instead.
        }
      },
    },
  });
}

export async function requireUser(): Promise<Authed> {
  const supabase = await getSupabase();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new HttpError(401, "Sign in required.");
  // A clear message for a signed-in non-member. This is UX only: the real control is RLS
  // (supabase/migrations/0003_hardening.sql), which returns them nothing either way.
  const member = await supabase.rpc("is_member");
  if (!member.error && member.data === false) throw new HttpError(403, "Your account is not a member of this workspace.");
  return { supabase, user: data.user };
}
