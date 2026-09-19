import "server-only";
import { z } from "zod";

const schema = z.object({
  OPENROUTER_API_KEY: z.string().min(1).optional(),
  TYPESAFE_API_KEY: z.string().min(1).optional(),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1).optional(),
});

const blankToUndefined = (value: string | undefined) => (value?.trim() ? value.trim() : undefined);

/** The only place secrets are read. Importing this from client code fails the build. */
export const env = schema.parse({
  OPENROUTER_API_KEY: blankToUndefined(process.env.OPENROUTER_API_KEY),
  TYPESAFE_API_KEY: blankToUndefined(process.env.TYPESAFE_API_KEY),
  NEXT_PUBLIC_SUPABASE_URL: blankToUndefined(process.env.NEXT_PUBLIC_SUPABASE_URL),
  // Supabase renamed the public "anon" key to "publishable", and its Vercel integration writes the
  // *_PUBLISHABLE_DEFAULT_KEY name. All three are the same kind of key: public, and governed by RLS.
  // (Each must be spelled out: Next inlines NEXT_PUBLIC_* by literal name at build time.)
  NEXT_PUBLIC_SUPABASE_ANON_KEY:
    blankToUndefined(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) ??
    blankToUndefined(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) ??
    blankToUndefined(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY),
});

/** Booleans only: the sole shape in which key state may leave the server. */
export function connectionStatus() {
  return {
    openrouter: Boolean(env.OPENROUTER_API_KEY),
    typesafe: Boolean(env.TYPESAFE_API_KEY),
    supabase: Boolean(env.NEXT_PUBLIC_SUPABASE_URL && env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  };
}
