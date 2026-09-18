"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { api } from "@/lib/client-api";
import { evalSpecSchema } from "@/lib/spec";

const STARTER = evalSpecSchema.parse({
  systemPrompt: "You are a support analyst. Be accurate and concise.",
  userTemplate: "Summarise this support ticket in a {{tone}} tone, in at most 40 words.\n\nTicket: {{ticket}}",
  fixed: { ticket: "I was charged twice for order #4821 on 3 May ($49.00 each). Please refund one charge." },
  factors: [
    { id: "models", kind: "models", name: "model", values: ["openai/gpt-4o-mini", "anthropic/claude-haiku-4.5"] },
    { id: "tone", kind: "variable", name: "tone", values: ["warm", "blunt"] },
  ],
});

export function NewEvalButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className="btn btn-primary"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          const { id } = await api<{ id: string }>("/api/evals", "POST", { name: "Untitled eval", spec: STARTER });
          router.push(`/evals/${id}/studio`);
        } catch (error) {
          alert(error instanceof Error ? error.message : "Could not create the eval.");
          setBusy(false);
        }
      }}
    >
      New eval
    </button>
  );
}

/** A button that calls one API endpoint, then refreshes (or navigates). Destructive ones confirm first. */
export function ActionButton({ path, method = "POST", body, label, confirmText, className = "btn btn-secondary btn-sm", then }: {
  path: string;
  method?: "POST" | "DELETE";
  body?: unknown;
  label: string;
  confirmText?: string;
  className?: string;
  then?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className={className}
      disabled={busy}
      onClick={async () => {
        if (confirmText && !confirm(confirmText)) return;
        setBusy(true);
        try {
          await api(path, method, body);
          if (then) router.push(then);
          router.refresh();
        } catch (error) {
          alert(error instanceof Error ? error.message : "That did not work.");
        } finally {
          setBusy(false);
        }
      }}
    >
      {label}
    </button>
  );
}

export function RunPicker({ evalId, runs }: { evalId: string; runs: Array<{ id: string; label: string }> }) {
  const router = useRouter();
  const [picked, setPicked] = useState<string[]>([]);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-ink-2">Compare:</span>
      {runs.slice(0, 8).map((run) => (
        <label key={run.id} className="flex items-center gap-1 text-xs">
          <input type="checkbox" checked={picked.includes(run.id)} onChange={(e) => setPicked((now) => (e.target.checked ? [...now, run.id].slice(-2) : now.filter((id) => id !== run.id)))} />
          {run.label}
        </label>
      ))}
      <button type="button" className="btn btn-secondary btn-sm" disabled={picked.length !== 2} onClick={() => router.push(`/evals/${evalId}?tab=compare&a=${picked[0]}&b=${picked[1]}`)}>
        Compare A → B
      </button>
    </div>
  );
}
