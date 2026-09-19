import { z } from "zod";

/** Shared (client + server) shapes. Everything crossing the API boundary is parsed with these. */

export const MAX_CELLS = 500;
export const MAX_DATASET_ROWS = 2000;
export const REGRESSION_DROP = 0.1; // on the 0–1 score scale
export const REFERENCE_KEY = "reference"; // dataset column holding the expected answer

const text = (max: number) => z.string().max(max);
const id = z.string().min(1).max(64);

export const paramsSchema = z.object({
  temperature: z.number().min(0).max(2).default(0.7),
  top_p: z.number().min(0).max(1).default(1),
  max_tokens: z.number().int().min(1).max(8000).default(600),
});
export type Params = z.infer<typeof paramsSchema>;

const base = { id, name: z.string().min(1).max(60), enabled: z.boolean().default(true) };

export const factorSchema = z.discriminatedUnion("kind", [
  z.object({ ...base, kind: z.literal("models"), values: z.array(z.string().min(1).max(120)).max(12) }),
  // name is the template variable key
  z.object({ ...base, kind: z.literal("variable"), values: z.array(text(4000)).max(50) }),
  z.object({
    ...base,
    kind: z.literal("sweep"),
    param: z.enum(["temperature", "top_p", "max_tokens"]),
    from: z.number(),
    to: z.number(),
    steps: z.number().int().min(1).max(10),
  }),
  // system prompt variants
  z.object({ ...base, kind: z.literal("prompt"), values: z.array(text(20000)).max(10) }),
  z.object({
    ...base,
    kind: z.literal("cases"),
    datasetId: z.string().uuid(),
    tag: z.string().max(60).nullable().default(null),
    sample: z.enum(["first", "random", "all"]).default("first"),
    n: z.number().int().min(1).max(MAX_CELLS).default(5),
  }),
]);
export type Factor = z.infer<typeof factorSchema>;
export type FactorKind = Factor["kind"];

export const evalSpecSchema = z.object({
  systemPrompt: text(20000).default(""),
  userTemplate: text(20000).default(""),
  model: z.string().max(120).default("openai/gpt-4.1-nano"),
  params: paramsSchema.default(paramsSchema.parse({})),
  fixed: z.record(z.string().max(80), text(4000)).default({}),
  factors: z.array(factorSchema).max(12).default([]),
  /** Pinned grader_version ids; the first is the headline score. */
  graders: z.array(z.string().uuid()).max(8).default([]),
  passThreshold: z.number().min(0).max(1).default(0.7),
  seed: z.string().max(40).default("eval"),
});
export type EvalSpec = z.infer<typeof evalSpecSchema>;

// ── Graders ─────────────────────────────────────────────────────────────

export const criterionSchema = z.object({
  id,
  name: z.string().min(1).max(60),
  weight: z.number().positive().max(100).default(1),
  instructions: z.string().min(1).max(1000),
  /** Ordered worst → best. Each level must describe a concrete situation and stand on its own. */
  levels: z.array(z.string().min(1).max(400)).min(2).max(10),
});
export type Criterion = z.infer<typeof criterionSchema>;

/** Declarative only. There is deliberately no "expression" check: user input is never evaluated as code. */
export const checkSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("max_words"), max: z.number().int().min(1) }),
  z.object({ type: z.literal("min_words"), min: z.number().int().min(1) }),
  z.object({ type: z.literal("contains"), text: z.string().min(1).max(400), caseSensitive: z.boolean().default(false) }),
  z.object({ type: z.literal("not_contains"), text: z.string().min(1).max(400), caseSensitive: z.boolean().default(false) }),
  z.object({ type: z.literal("regex"), pattern: z.string().min(1).max(200), flags: z.string().regex(/^[imsu]*$/).default("") }),
  z.object({ type: z.literal("equals_reference") }),
  z.object({ type: z.literal("valid_json") }),
  z.object({ type: z.literal("json_has_keys"), keys: z.array(z.string().min(1).max(80)).min(1).max(20) }),
]);
export type Check = z.infer<typeof checkSchema>;

export const noulCheckSchema = z.object({
  id,
  name: z.string().min(1).max(60),
  /** A yes/no question over `input`, `response` and `reference`. */
  instructions: z.string().min(1).max(1000),
  passWhen: z.enum(["yes", "no"]).default("yes"),
  threshold: z.number().min(0.5).max(0.99).default(0.5),
});
export type NoulCheck = z.infer<typeof noulCheckSchema>;

export const graderConfigSchema = z.discriminatedUnion("engine", [
  z.object({ engine: z.literal("code"), checks: z.array(checkSchema).min(1).max(12) }),
  z.object({
    engine: z.literal("judge"),
    model: z.string().min(1).max(120),
    temperature: z.number().min(0).max(1).default(0),
    samples: z.number().int().min(1).max(5).default(1),
    criteria: z.array(criterionSchema).min(1).max(8),
    passScore: z.number().min(0).max(1).default(0.7),
  }),
  z.object({
    engine: z.literal("jev"),
    criteria: z.array(criterionSchema).max(8).default([]),
    nouls: z.array(noulCheckSchema).max(8).default([]),
    passScore: z.number().min(0).max(1).default(0.7),
    /** Below this confidence a grade is flagged for human review. Tune on your own data. */
    flagBelowConfidence: z.number().min(0).max(1).default(0.6),
  }),
]).refine(
  (c) => c.engine !== "jev" || c.criteria.length + c.nouls.length > 0,
  "Add at least one criterion or yes/no check.",
);
export type GraderConfig = z.infer<typeof graderConfigSchema>;
export type Engine = GraderConfig["engine"];

export interface Grade {
  score: number | null; // 0–1
  pass: boolean | null;
  confidence: number | null;
  flagged: boolean;
  raw: Record<string, unknown>;
}

/** Weighted mean of per-criterion level positions, normalised to 0–1. */
export function compositeScore(criteria: Criterion[], levelScores: Record<string, number>): number | null {
  let total = 0;
  let weight = 0;
  for (const criterion of criteria) {
    const raw = levelScores[criterion.id];
    if (typeof raw !== "number" || Number.isNaN(raw)) continue;
    const top = criterion.levels.length - 1;
    total += criterion.weight * Math.min(1, Math.max(0, raw / top));
    weight += criterion.weight;
  }
  return weight ? total / weight : null;
}
