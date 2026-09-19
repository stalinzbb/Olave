"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: form.get("email"), password: form.get("password") }),
    });
    setBusy(false);
    if (!response.ok) {
      setError(((await response.json().catch(() => ({}))) as { error?: string }).error ?? "Could not sign in.");
      return;
    }
    router.replace("/evals");
    router.refresh();
  }

  return (
    <main className="grid min-h-full place-items-center p-4">
      {/* method="post": without it, a page whose JavaScript failed to load would submit as GET and put the password in the URL. */}
      <form onSubmit={submit} method="post" action="/api/auth/login" className="card flex w-full max-w-sm flex-col gap-4 p-6 shadow-low">
        <div>
          <p className="text-xs font-medium text-accent">LLM Evals</p>
          <h1 className="text-2xl font-semibold">Sign in</h1>
          <p className="hint mt-1">Access is by invitation. Ask the workspace owner to add your email.</p>
        </div>
        <label className="flex flex-col gap-1">
          <span className="label">Email</span>
          <input className="field" type="email" name="email" autoComplete="username" required />
        </label>
        <label className="flex flex-col gap-1">
          <span className="label">Password</span>
          <input className="field" type="password" name="password" autoComplete="current-password" required />
        </label>
        {error ? <p role="alert" className="text-sm text-bad">{error}</p> : null}
        <button className="btn btn-primary" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
      </form>
    </main>
  );
}
