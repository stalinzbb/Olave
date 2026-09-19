import { describe, expect, it } from "vitest";

import { compareRuns, type ScoredCell } from "@/lib/compare";
import { gradeWithCode } from "@/lib/server/graders/code";
import { buildQuestions, composeJevGrade, gradeWithJev } from "@/lib/server/graders/jev";
import { graderConfigSchema } from "@/lib/spec";

describe("code grader", () => {
  it("runs declarative checks and never evaluates input", () => {
    const grade = gradeWithCode(
      [
        { type: "max_words", max: 5 },
        { type: "contains", text: "REFUND", caseSensitive: false },
        { type: "json_has_keys", keys: ["a"] },
        { type: "regex", pattern: "(", flags: "" }, // invalid pattern fails closed instead of throwing
      ],
      "refund issued today",
      {},
    );
    expect(grade.score).toBe(0.5);
    expect(grade.pass).toBe(false);
    expect(graderConfigSchema.safeParse({ engine: "code", checks: [{ type: "expression", code: "process.exit()" }] }).success).toBe(false);
  });

  it("compares against the reference column", () => {
    expect(gradeWithCode([{ type: "equals_reference" }], " Paris ", { reference: "paris" }).pass).toBe(true);
    expect(gradeWithCode([{ type: "equals_reference" }], "Paris", {}).pass).toBe(false);
  });
});

describe("jev grader", () => {
  const config = {
    passScore: 0.7,
    flagBelowConfidence: 0.6,
    criteria: [
      { id: "faith", name: "Faithfulness", weight: 3, instructions: "How faithful is `response` to `input`?", levels: ["Invents facts", "Omits key facts", "Minor drift", "All facts kept", "All facts kept and nothing added"] },
      { id: "tone", name: "Tone", weight: 1, instructions: "How well does the tone fit?", levels: ["Wrong tone", "Mixed", "Right tone"] },
    ],
    nouls: [{ id: "pii", name: "Leaks PII", instructions: "Does `response` contain a phone number?", passWhen: "no" as const, threshold: 0.5 }],
  };

  it("asks one score question per criterion using the rubric levels, plus nouls", () => {
    const questions = buildQuestions(config);
    expect(Object.keys(questions)).toEqual(["c:faith", "c:tone", "n:pii"]);
    expect(questions["c:faith"]).toMatchObject({ type: "score", criteria: config.criteria[0].levels });
  });

  it("normalises by level count, applies weights, gates on nouls, flags low confidence", () => {
    const answers = {
      "c:faith": { type: "score" as const, score: 4, confidence: 0.9, probabilities: {} },
      "c:tone": { type: "score" as const, score: 1, confidence: 0.55, probabilities: {} },
      "n:pii": { type: "noul" as const, noul: 0.02 },
    };
    const grade = composeJevGrade(config, answers);
    expect(grade.score).toBeCloseTo((3 * 1 + 1 * 0.5) / 4);
    expect(grade.pass).toBe(true);
    expect(grade.confidence).toBe(0.55);
    expect(grade.flagged).toBe(true);
    expect(composeJevGrade(config, { ...answers, "n:pii": { type: "noul", noul: 0.9 } }).pass).toBe(false);
  });

  it("sends input/response/reference as named state", async () => {
    let seen: Record<string, string> = {};
    await gradeWithJev(config, { userPrompt: "Q", output: "A", vars: { reference: "R" } }, async (state) => {
      seen = state;
      return {};
    });
    expect(seen).toEqual({ input: "Q", response: "A", reference: "R" });
  });
});

describe("compareRuns", () => {
  const cell = (model: string, n: number, score: number): ScoredCell => ({
    id: `${model}${n}${score}`, labels: { model, cases: `case ${n}` }, score, pass: score >= 0.7, latencyMs: 100, cost: 0.01, output: "",
  });
  it("matches cells by labels, finds regressions and per-factor deltas", () => {
    const result = compareRuns(
      [cell("a", 1, 0.9), cell("a", 2, 0.8), cell("b", 1, 0.6)],
      [cell("a", 2, 0.78), cell("a", 1, 0.5), cell("b", 1, 0.7), cell("c", 1, 1)],
    );
    expect(result.matched).toBe(3);
    expect(result.regressions.map((r) => r.candidate.labels)).toEqual([{ model: "a", cases: "case 1" }]);
    expect(result.deltas.model.a).toBeCloseTo(-0.21);
    expect(result.deltas.model.b).toBeCloseTo(0.1);
  });
});
