import { REFERENCE_KEY, type Check, type Grade } from "@/lib/spec";

const words = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;
const normalise = (text: string) => text.trim().replace(/\s+/g, " ").toLowerCase();
const parseJson = (text: string): unknown => {
  const unfenced = text.trim().replace(/^```(?:json)?\s*|\s*```$/g, "");
  return JSON.parse(unfenced);
};

// ponytail: regexes are author-written and length-capped but not sandboxed;
// move to a worker with a timeout (or re2) if untrusted people can create graders.
const MAX_REGEX_INPUT = 20_000;

export function runCheck(check: Check, output: string, vars: Record<string, string>): boolean {
  switch (check.type) {
    case "max_words":
      return words(output) <= check.max;
    case "min_words":
      return words(output) >= check.min;
    case "contains":
    case "not_contains": {
      const [haystack, needle] = check.caseSensitive ? [output, check.text] : [output.toLowerCase(), check.text.toLowerCase()];
      return haystack.includes(needle) === (check.type === "contains");
    }
    case "regex":
      try {
        return new RegExp(check.pattern, check.flags).test(output.slice(0, MAX_REGEX_INPUT));
      } catch {
        return false;
      }
    case "equals_reference":
      return REFERENCE_KEY in vars && normalise(output) === normalise(vars[REFERENCE_KEY]);
    case "valid_json":
      try {
        parseJson(output);
        return true;
      } catch {
        return false;
      }
    case "json_has_keys":
      try {
        const value = parseJson(output);
        return typeof value === "object" && value !== null && check.keys.every((key) => key in value);
      } catch {
        return false;
      }
  }
}

export function gradeWithCode(checks: Check[], output: string, vars: Record<string, string>): Grade {
  const results = checks.map((check) => ({ check, ok: runCheck(check, output, vars) }));
  const passed = results.filter((result) => result.ok).length;
  return {
    score: passed / checks.length,
    pass: passed === checks.length,
    confidence: 1,
    flagged: false,
    raw: { checks: results },
  };
}
