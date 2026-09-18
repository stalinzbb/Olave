import { describe, expect, it } from "vitest";

import {
  extractVariables,
  parseTemplate,
  renderTemplate,
  validateTemplate,
} from "@/lib/template";

type VariableDefinition = { key: string } & Record<string, unknown>;

function def(key: string, overrides: Partial<VariableDefinition> = {}): VariableDefinition {
  return {
    key,
    label: key,
    defaultSource: "manual",
    datasetId: null,
    defaultValue: "",
    required: true,
    ...overrides,
  };
}

describe("parseTemplate", () => {
  it("parses text and variable tokens", () => {
    const { tokens, errors } = parseTemplate("Hello {{org.name}}, join {{team.name}}!");
    expect(errors).toHaveLength(0);
    expect(tokens).toEqual([
      { type: "text", value: "Hello " },
      { type: "variable", key: "org.name", source: null, raw: "{{org.name}}", index: 6 },
      { type: "text", value: ", join " },
      { type: "variable", key: "team.name", source: null, raw: "{{team.name}}", index: 25 },
      { type: "text", value: "!" },
    ]);
  });

  it("parses inline source overrides", () => {
    const { tokens, errors } = parseTemplate("{{cause|random}} {{org.name|manual}}");
    expect(errors).toHaveLength(0);
    expect(tokens[0]).toMatchObject({ type: "variable", key: "cause", source: "random" });
    expect(tokens[2]).toMatchObject({ type: "variable", key: "org.name", source: "manual" });
  });

  it("treats escaped \\{{ as literal text", () => {
    const { tokens, errors } = parseTemplate("show \\{{literal}} and {{real}}");
    expect(errors).toHaveLength(0);
    expect(renderTemplate("show \\{{literal}} and {{real}}", { real: "X" }).output).toBe(
      "show {{literal}} and X",
    );
    expect(tokens.some((t) => t.type === "variable" && t.key === "real")).toBe(true);
  });

  it("rejects csv as inline source", () => {
    const { errors } = parseTemplate("{{cause|csv}}");
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain("run-level");
  });

  it("rejects unknown inline sources and malformed keys", () => {
    expect(parseTemplate("{{cause|banana}}").errors).toHaveLength(1);
    expect(parseTemplate("{{ }}").errors).toHaveLength(1);
    expect(parseTemplate("{{a..b}}").errors).toHaveLength(1);
    expect(parseTemplate("{{a b}}").errors).toHaveLength(1);
  });

  it("leaves malformed references as literal text", () => {
    const { tokens } = parseTemplate("keep {{a..b}} raw");
    expect(tokens.map((t) => (t.type === "text" ? t.value : "")).join("")).toBe(
      "keep {{a..b}} raw",
    );
  });

  it("handles empty and non-string input", () => {
    expect(parseTemplate("").tokens).toEqual([]);
    expect(parseTemplate(undefined as unknown as string).tokens).toEqual([]);
  });
});

describe("extractVariables", () => {
  it("returns unique keys in first-appearance order", () => {
    expect(extractVariables("{{b}} {{a}} {{b|random}} {{c}}")).toEqual(["b", "a", "c"]);
  });
});

describe("validateTemplate", () => {
  it("flags undefined variables as errors", () => {
    const result = validateTemplate("{{org.name}} {{missing}}", [def("org.name")]);
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].key).toBe("missing");
  });

  it("flags unused definitions as warnings only", () => {
    const result = validateTemplate("{{org.name}}", [def("org.name"), def("unused")]);
    expect(result.valid).toBe(true);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].key).toBe("unused");
  });

  it("surfaces parse errors", () => {
    const result = validateTemplate("{{cause|csv}}", [def("cause")]);
    expect(result.valid).toBe(false);
  });
});

describe("renderTemplate", () => {
  it("substitutes values", () => {
    const { output, missing } = renderTemplate("Hi {{org.name}} — {{cause}}!", {
      "org.name": "North Ridge",
      cause: "travel fees",
    });
    expect(output).toBe("Hi North Ridge — travel fees!");
    expect(missing).toEqual([]);
  });

  it("renders missing values as empty and reports them", () => {
    const { output, missing } = renderTemplate("A {{x}} B {{y}}", { x: "1" });
    expect(output).toBe("A 1 B ");
    expect(missing).toEqual(["y"]);
  });

  it("allows empty string values without flagging missing", () => {
    const { output, missing } = renderTemplate("[{{x}}]", { x: "" });
    expect(output).toBe("[]");
    expect(missing).toEqual([]);
  });
});
