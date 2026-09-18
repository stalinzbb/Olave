"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { api } from "@/lib/client-api";

export function DatasetUpload() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const file = data.get("file");
    if (!(file instanceof File) || !file.size) return setError("Choose a CSV file.");
    setBusy(true);
    setError("");
    try {
      await api("/api/datasets", "POST", { name: String(data.get("name") || file.name.replace(/\.csv$/i, "")), csv: await file.text() });
      form.reset();
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="card mb-6 flex flex-wrap items-end gap-3 p-4">
      <label className="flex flex-col gap-1"><span className="label">Name</span><input className="field" name="name" placeholder="tickets_sept" /></label>
      <label className="flex flex-col gap-1"><span className="label">CSV file</span><input className="field" type="file" name="file" accept=".csv,text/csv" required /></label>
      <button className="btn btn-primary" disabled={busy}>{busy ? "Uploading…" : "Upload"}</button>
      <p className="hint basis-full">Column headers become {"{{variables}}"}. Optional columns: <code>reference</code> (expected answer, used by graders) and <code>tags</code> (a|b|c, for tag filters). Up to 2,000 rows.</p>
      {error ? <p role="alert" className="basis-full text-sm text-bad">{error}</p> : null}
    </form>
  );
}
