import { describe, expect, it } from "vitest";

import { buildAxes, cellAt, cellMath, countCells, specIssues } from "@/lib/factors";
import { evalSpecSchema } from "@/lib/spec";

const datasetId = "00000000-0000-4000-8000-000000000001";
const rows = { [datasetId]: [1, 2, 3, 4].map((n) => ({ data: { ticket: `t${n}` }, tags: n % 2 ? ["odd"] : [] })) };
const spec = evalSpecSchema.parse({
  userTemplate: "Summarise {{ticket}} in a {{tone}} tone for {{audience}}",
  fixed: { audience: "execs" },
  factors: [
    { id: "m", kind: "models", name: "model", values: ["a/one", "b/two"] },
    { id: "t", kind: "variable", name: "tone", values: ["warm", "blunt"] },
    { id: "c", kind: "cases", name: "cases", datasetId, sample: "first", n: 3 },
    { id: "off", kind: "sweep", name: "temp", param: "temperature", from: 0, to: 1, steps: 3, enabled: false },
  ],
});

describe("factors", () => {
  const axes = buildAxes(spec, rows);

  it("multiplies enabled factors only", () => {
    expect(countCells(axes)).toBe(12);
    expect(cellMath(axes)).toBe("2 × 2 × 3 = 12");
  });

  it("decodes every index to a unique combination", () => {
    const seen = new Set(Array.from({ length: 12 }, (_, i) => JSON.stringify(cellAt(spec, axes, i).labels)));
    expect(seen.size).toBe(12);
    const last = cellAt(spec, axes, 11);
    expect(last.model).toBe("b/two");
    expect(last.userPrompt).toBe("Summarise t3 in a blunt tone for execs");
  });

  it("samples randomly but reproducibly, and filters by tag", () => {
    const random = { ...spec, factors: [{ ...spec.factors[2], sample: "random" as const, n: 2, tag: "odd" }] };
    const a = buildAxes(random, rows)[0].values.map((v) => v.vars?.ticket);
    expect(a).toEqual(buildAxes(random, rows)[0].values.map((v) => v.vars?.ticket));
    expect(a.every((t) => t === "t1" || t === "t3")).toBe(true);
  });

  it("blocks unbound variables and oversize runs", () => {
    expect(specIssues(spec, axes)).toEqual([]);
    const unbound = { ...spec, fixed: {} };
    expect(specIssues(unbound, buildAxes(unbound, rows)).join()).toContain("{{audience}}");
    const huge = { ...spec, factors: [{ ...spec.factors[1], values: Array.from({ length: 50 }, (_, i) => `${i}`) }, { id: "s", kind: "sweep" as const, name: "t", enabled: true, param: "temperature" as const, from: 0, to: 1, steps: 10 }, spec.factors[0]] };
    expect(specIssues(huge, buildAxes(huge, rows)).join()).toContain("cap");
  });
});
