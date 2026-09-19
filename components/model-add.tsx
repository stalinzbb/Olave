"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { api } from "@/lib/client-api";

export function ModelAdd({ catalogue }: { catalogue: Array<{ id: string; label: string }> }) {
  const router = useRouter();
  const [id, setId] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/api/models", "POST", { id: id.trim() });
      setId("");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not add that model.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="card mb-6 flex flex-wrap items-end gap-3 p-4">
      <label className="flex min-w-64 flex-1 flex-col gap-1">
        <span className="label">Add a model</span>
        <input className="field font-mono text-xs" list="catalogue" value={id} onChange={(e) => setId(e.target.value)} placeholder="search the OpenRouter catalogue, e.g. gemini" required />
        <datalist id="catalogue">{catalogue.map((model) => <option key={model.id} value={model.id} label={model.label} />)}</datalist>
      </label>
      <button className="btn btn-primary" disabled={busy || !id.trim()}>{busy ? "Adding…" : "Add"}</button>
      <p className="hint basis-full">{catalogue.length} models available, cheapest first. Prices are per 1M tokens, input / output.</p>
      {error ? <p role="alert" className="basis-full text-sm text-bad">{error}</p> : null}
    </form>
  );
}
