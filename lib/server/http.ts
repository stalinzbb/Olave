import "server-only";
import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { HttpError } from "@/lib/http-error";
import { redact } from "@/lib/redact";
import { env } from "@/lib/server/env";
import { requireUser, type Authed } from "@/lib/server/supabase";

export { HttpError };

export const safeMessage = (error: unknown) =>
  redact(error instanceof Error ? error.message : String(error), [
    env.OPENROUTER_API_KEY,
    env.TYPESAFE_API_KEY,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  ]);

export function errorResponse(error: unknown) {
  if (error instanceof HttpError) return NextResponse.json({ error: error.message }, { status: error.status });
  if (error instanceof ZodError) {
    const detail = error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
    return NextResponse.json({ error: `Invalid request — ${detail}`.slice(0, 500) }, { status: 422 });
  }
  console.error("[api]", safeMessage(error));
  return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
}

const MAX_BODY_BYTES = 2_000_000;

export async function readJson(request: Request): Promise<unknown> {
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) throw new HttpError(413, "Request body too large.");
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw new HttpError(400, "Body must be JSON.");
  }
}

type Context<P> = { params: Promise<P> };

/** Every API handler goes through here: auth first (fail closed), errors redacted on the way out. */
export function route<P = Record<string, never>>(
  handler: (authed: Authed, request: Request, params: P) => Promise<Response>,
) {
  return async (request: Request, context: Context<P>) => {
    try {
      // Session cookies are SameSite=Lax already; this also refuses any cross-origin write outright.
      const origin = request.headers.get("origin");
      if (request.method !== "GET" && origin && new URL(origin).host !== request.headers.get("host")) {
        throw new HttpError(403, "Cross-origin request refused.");
      }
      const authed = await requireUser();
      return await handler(authed, request, await context.params);
    } catch (error) {
      return errorResponse(error);
    }
  };
}
