import type { ReactNode } from "react";

import type { FactorKind } from "@/lib/spec";

/** Small presentational pieces shared by server and client components. No state, no hooks. */

const TONES = {
  neutral: "bg-line text-ink",
  gray: "bg-gray-bg text-gray",
  good: "bg-ok-bg text-ok",
  bad: "bg-bad-bg text-bad",
  warn: "bg-warn-bg text-warn",
  info: "bg-info-bg text-info",
  accent: "bg-accent-soft text-accent",
} as const;
export type Tone = keyof typeof TONES;

/** The design's factor colour code, used everywhere a factor is named. */
export const FACTOR_TONE: Record<FactorKind, Tone> = {
  models: "info",
  variable: "accent",
  sweep: "warn",
  prompt: "bad",
  cases: "good",
};

export function Chip({ tone = "neutral", children, title }: { tone?: Tone; children: ReactNode; title?: string }) {
  return (
    <span title={title} className={`inline-flex h-5 items-center gap-1 rounded-inner px-2 text-xs font-medium whitespace-nowrap ${TONES[tone]}`}>
      {children}
    </span>
  );
}

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow: string; title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="flex min-w-0 flex-col gap-1.5">
        <p className="text-xs font-medium text-accent">{eyebrow}</p>
        <h1 className="text-[29px] leading-[1.38] font-normal text-balance">{title}</h1>
        {description ? <p className="max-w-[70ch] text-ink-2">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: Tone }) {
  const colour = tone === "good" ? "text-ok" : tone === "bad" ? "text-bad" : "text-ink";
  return (
    <div className="card p-3">
      <p className="text-xs text-ink-2">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${colour}`}>{value}</p>
      {sub ? <p className="hint mt-0.5">{sub}</p> : null}
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="card flex flex-col items-center gap-3 px-6 py-10 text-center">
      <p className="text-[17px] font-semibold">{title}</p>
      {children ? <div className="max-w-[60ch] text-ink-2">{children}</div> : null}
    </div>
  );
}

export function Banner({ tone, title, children }: { tone: "warn" | "bad" | "good" | "info"; title: string; children?: ReactNode }) {
  return (
    <div role={tone === "bad" ? "alert" : "status"} className={`rounded-box px-4 py-3 ${TONES[tone]}`}>
      <p className="font-semibold">{title}</p>
      {children ? <div className="mt-0.5 text-xs leading-5">{children}</div> : null}
    </div>
  );
}

/** Signed horizontal bar for a −1…+1 delta or a 0…1 score. */
export function Bar({ value, signed = false }: { value: number | null; signed?: boolean }) {
  if (value === null) return <div className="h-2 rounded-full bg-tint" />;
  const width = `${Math.min(100, Math.abs(value) * (signed ? 200 : 100))}%`;
  const colour = signed ? (value < 0 ? "bg-bad" : "bg-ok") : "bg-accent";
  return (
    <div className={`flex h-2 rounded-full bg-tint ${signed && value < 0 ? "justify-end" : ""}`}>
      <div className={`h-2 rounded-full ${colour}`} style={{ width }} />
    </div>
  );
}
