import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Refreshes the Supabase session, turns away signed-out visitors, and sets a per-request nonce CSP.
// Defence in depth only: every route handler and page calls requireUser() itself.
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isApi = pathname.startsWith("/api/");
  const isPublic = pathname === "/login" || pathname === "/api/auth/login";

  const nonce = btoa(crypto.randomUUID());
  const dev = process.env.NODE_ENV !== "production";
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    `connect-src 'self'${dev ? " ws:" : ""}`, // the browser never calls Supabase or a model provider directly
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  headers.set("content-security-policy", csp);

  const finish = (response: NextResponse) => {
    response.headers.set("content-security-policy", csp);
    return response;
  };
  const deny = () => {
    if (isApi) return finish(NextResponse.json({ error: "Sign in required." }, { status: 401 }));
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return finish(NextResponse.redirect(url));
  };

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  // Same three accepted names as lib/server/env.ts (which cannot be imported here).
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY;
  if (!url || !anonKey) return isPublic ? finish(NextResponse.next({ request: { headers } })) : deny(); // fail closed

  let response = NextResponse.next({ request: { headers } });
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet) => {
        for (const { name, value } of toSet) request.cookies.set(name, value);
        const refreshed = new Headers(headers);
        refreshed.set("cookie", request.cookies.toString());
        response = NextResponse.next({ request: { headers: refreshed } });
        for (const { name, value, options } of toSet) response.cookies.set(name, value, options);
      },
    },
  });
  const { data } = await supabase.auth.getUser();
  if (!data.user && !isPublic) return deny();
  return finish(response);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
