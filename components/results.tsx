"use client";

import { useEffect, useMemo, useState } from "react";

import { Bar, Chip, Stat, type Tone } from "@/components/kit";
import { summarise } from "@/lib/compare";
import { fmtCost, fmtPct, fmtScore, headline, scoreTone, toScoredCells, type CellRow } from "@/lib/results";

export interface GraderName {
  versionId: string;
  name: string;
  version: number;
  engine: string;
}

const toneOf = (score: number | null): Tone => scoreTone(score) as Tone;
const mean = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : null);

export function Results({ cells, graders }: { cells: CellRow[]; graders: GraderName[] }) {
  const headlineId = graders[0]?.versionId;
  const factors = useMemo(() => [...new Set(cells.flatMap((cell) => Object.keys(cell.labels)))], [cells]);
  const [view, setView] = useState<"grid" | "table">("grid");
  const [rowAxis, setRowAxis] = useState("");
  const [colAxis, setColAxis] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const rows = factors.includes(rowAxis) ? rowAxis : (factors[0] ?? "");
  const cols = factors.includes(colAxis) && colAxis !== rows ? colAxis : (factors.find((f) => f !== rows) ?? "");
  const summary = summarise(toScoredCells(cells, headlineId));
  const open = cells.find((cell) => cell.id === openId) ?? null;
  const flagged = cells.filter((cell) => cell.grades.some((grade) => grade.flagged)).length;

  if (!cells.length) return <p className="p-6 text-ink-2">No results yet. Run the eval to fill this grid.</p>;

  const values = (factor: string) => [...new Set(cells.map((cell) => cell.labels[factor]).filter((v) => v !== undefined))];
  const group = (r: string, c: string) => cells.filter((cell) => (!rows || cell.labels[rows] === r) && (!cols || cell.labels[cols] === c));

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={graders[0] ? `Avg ${graders[0].name}` : "Avg score"} value={fmtScore(summary.score)} tone={toneOf(summary.score)} />
        <Stat label="Pass rate" value={fmtPct(summary.passRate)} sub={flagged ? `${flagged} flagged for review` : undefined} />
        <Stat label="p50 latency" value={summary.p50LatencyMs == null ? "—" : `${summary.p50LatencyMs} ms`} />
        <Stat label="Spend" value={fmtCost(summary.cost)} sub={`${cells.length} cells`} />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div role="tablist" aria-label="Results view" className="seg">
          {(["grid", "table"] as const).map((v) => (
            <button
              key={v}
              role="tab"
              aria-selected={view === v}
              onClick={() => setView(v)}
            >
              {v}
            </button>
          ))}
        </div>
        {view === "grid" && factors.length > 0 ? (
          <>
            <label className="flex items-center gap-1.5 text-xs text-ink-2">
              Rows
              <select className="field !w-auto" value={rows} onChange={(e) => setRowAxis(e.target.value)}>
                {factors.map((f) => <option key={f}>{f}</option>)}
              </select>
            </label>
            {factors.length > 1 ? (
              <label className="flex items-center gap-1.5 text-xs text-ink-2">
                Columns
                <select className="field !w-auto" value={cols} onChange={(e) => setColAxis(e.target.value)}>
                  {factors.filter((f) => f !== rows).map((f) => <option key={f}>{f}</option>)}
                </select>
              </label>
            ) : null}
            {factors.length > 2 ? <span className="text-xs text-ink-2">Averaged over: {factors.filter((f) => f !== rows && f !== cols).join(", ")}</span> : null}
          </>
        ) : null}
      </div>

      {view === "grid" ? (
        <div className="card overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="th">{rows || "cell"}</th>
                {(cols ? values(cols) : [""]).map((c) => <th key={c} className="th font-mono">{c || "score"}</th>)}
              </tr>
            </thead>
            <tbody>
              {(rows ? values(rows) : [""]).map((r) => (
                <tr key={r}>
                  <th scope="row" className="td text-left font-mono text-xs font-medium">{r || "all"}</th>
                  {(cols ? values(cols) : [""]).map((c) => {
                    const members = group(r, c);
                    const score = mean(members.map((m) => headline(m, headlineId).score).filter((s): s is number => s !== null));
                    const failed = members.filter((m) => m.status === "error").length;
                    return (
                      <td key={c} className="td">
                        <button type="button" onClick={() => setOpenId(members[0]?.id ?? null)} disabled={!members.length} className="flex w-full min-w-28 flex-col gap-1 rounded-el p-1.5 text-left hover:bg-tint">
                          <span className="flex items-center gap-2">
                            <Chip tone={toneOf(score)}>{fmtScore(score)}</Chip>
                            <span className="text-xs text-ink-2">{members.length} {members.length === 1 ? "cell" : "cells"}</span>
                            {failed ? <Chip tone="bad">{failed} failed</Chip> : null}
                          </span>
                          <span className="line-clamp-2 text-xs text-ink-2">{members[0]?.output ?? members[0]?.error ?? "pending…"}</span>
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="th">#</th>
                {factors.map((f) => <th key={f} className="th">{f}</th>)}
                <th className="th">Output</th>
                {graders.map((g) => <th key={g.versionId} className="th">{g.name}</th>)}
                <th className="th">Latency</th>
              </tr>
            </thead>
            <tbody>
              {cells.map((cell) => (
                <tr key={cell.id} onClick={() => setOpenId(cell.id)} className="cursor-pointer hover:bg-tint">
                  <td className="td font-mono text-xs text-ink-2">{cell.idx + 1}</td>
                  {factors.map((f) => <td key={f} className="td font-mono text-xs">{cell.labels[f]}</td>)}
                  <td className="td max-w-md">
                    <button type="button" className="line-clamp-2 text-left" onClick={() => setOpenId(cell.id)}>
                      {cell.status === "error" ? <span className="text-bad">{cell.error}</span> : (cell.output ?? "pending…")}
                    </button>
                  </td>
                  {graders.map((g) => {
                    const grade = cell.grades.find((entry) => entry.grader_version_id === g.versionId);
                    return (
                      <td key={g.versionId} className="td whitespace-nowrap">
                        <Chip tone={toneOf(grade?.score ?? null)}>{fmtScore(grade?.score)}</Chip>
                        {grade?.flagged ? <span className="ml-1 text-xs text-warn" title="Low confidence or grader problem">⚑</span> : null}
                      </td>
                    );
                  })}
                  <td className="td text-xs text-ink-2 tabular-nums">{cell.latency_ms == null ? "—" : `${cell.latency_ms} ms`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {open ? <CellDrawer cell={open} siblings={cells} graders={graders} onSelect={setOpenId} onClose={() => setOpenId(null)} /> : null}
    </div>
  );
}

function CellDrawer({ cell, siblings, graders, onSelect, onClose }: { cell: CellRow; siblings: CellRow[]; graders: GraderName[]; onSelect: (id: string) => void; onClose: () => void }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      const next = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
      const target = next ? siblings[siblings.findIndex((s) => s.id === cell.id) + next] : null;
      if (target) onSelect(target.id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cell.id, siblings, onSelect, onClose]);

  return (
    <>
    <div aria-hidden className="scrim" onClick={onClose} />
    <aside role="dialog" aria-modal="true" aria-label={`Cell ${cell.idx + 1}`} className="fixed inset-y-0 right-0 z-20 drawer flex w-full max-w-xl flex-col border-l border-line bg-surface shadow-low">
      <header className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <span className="font-mono text-xs text-ink-2">cell {cell.idx + 1} / {siblings.length}</span>
          {Object.entries(cell.labels).map(([factor, label]) => <Chip key={factor}>{factor}: {label}</Chip>)}
        </div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>Close</button>
      </header>
      <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
        <section>
          <h3 className="mb-1 text-xs font-semibold text-ink-2">Output · {cell.model}{cell.provider === "mock" ? " · mock" : ""}</h3>
          {/* Model output is untrusted: rendered as plain text, never as HTML. */}
          <p className="rounded-el bg-tint p-3 whitespace-pre-wrap">{cell.status === "error" ? cell.error : (cell.output ?? "pending…")}</p>
          <p className="hint mt-1 tabular-nums">
            {cell.prompt_tokens ?? "—"} in · {cell.completion_tokens ?? "—"} out · {cell.latency_ms ?? "—"} ms · {fmtCost(cell.cost === null ? null : Number(cell.cost))}
          </p>
        </section>
        <section>
          <h3 className="mb-2 text-xs font-semibold text-ink-2">Grades</h3>
          {graders.length === 0 ? <p className="hint">No graders pinned. Outputs are stored but unscored.</p> : null}
          <ul className="flex flex-col gap-3">
            {graders.map((g) => {
              const grade = cell.grades.find((entry) => entry.grader_version_id === g.versionId);
              const raw = (grade?.raw ?? {}) as { rationale?: string; skipped?: string; error?: string; levelScores?: Record<string, number>; nouls?: Array<{ name: string; yes: number | null; pass: boolean | null }>; checks?: Array<{ check: { type: string }; ok: boolean }> };
              return (
                <li key={g.versionId} className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{g.name}</span>
                    <Chip tone="gray">{g.engine} v{g.version}</Chip>
                    <span className="ml-auto tabular-nums">{fmtScore(grade?.score)}</span>
                    {grade?.pass != null ? <Chip tone={grade.pass ? "good" : "bad"}>{grade.pass ? "pass" : "fail"}</Chip> : null}
                  </div>
                  <Bar value={grade?.score ?? null} />
                  {grade?.confidence != null ? <p className="hint">confidence {grade.confidence.toFixed(2)}{grade.flagged ? " · flagged for human review" : ""}</p> : null}
                  {raw.skipped || raw.error ? <p className="hint text-warn">{raw.skipped ?? raw.error}</p> : null}
                  {raw.rationale ? <p className="hint">{raw.rationale}</p> : null}
                  {raw.levelScores ? <p className="hint font-mono">{Object.entries(raw.levelScores).map(([k, v]) => `${k} ${v.toFixed(1)}`).join(" · ")}</p> : null}
                  {raw.nouls?.length ? <p className="hint font-mono">{raw.nouls.map((n) => `${n.name}: ${n.yes == null ? "—" : `${Math.round(n.yes * 100)}% yes`} ${n.pass ? "✓" : "✗"}`).join(" · ")}</p> : null}
                  {raw.checks ? <p className="hint font-mono">{raw.checks.map((c) => `${c.check.type} ${c.ok ? "✓" : "✗"}`).join(" · ")}</p> : null}
                </li>
              );
            })}
          </ul>
        </section>
        <details>
          <summary className="cursor-pointer text-xs font-semibold text-ink-2">Resolved prompt</summary>
          {cell.system_prompt ? <pre className="code mt-2">{cell.system_prompt}</pre> : null}
          <pre className="code mt-2">{cell.user_prompt}</pre>
        </details>
      </div>
    </aside>
    </>
  );
}
