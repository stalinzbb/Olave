export type VariableSource = "manual" | "random";
type VariableDefinition = { key: string };

/**
 * Template syntax:
 *   {{org.name}}          — insert variable "org.name" using its configured default source
 *   {{cause|random}}      — inline source override (manual | random)
 *   \{{                   — escaped literal "{{"
 * Variable keys are dot-separated identifier segments; dots are literal, not traversal.
 */

export const VARIABLE_KEY_PATTERN = /^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*$/;

export const INLINE_SOURCES: VariableSource[] = ["manual", "random"];

export interface TextToken {
  type: "text";
  value: string;
}

export interface VariableToken {
  type: "variable";
  key: string;
  /** Inline source override, if any. */
  source: VariableSource | null;
  /** The raw matched text, e.g. "{{cause|random}}". */
  raw: string;
  /** Character offset of the token in the source template. */
  index: number;
}

export type TemplateToken = TextToken | VariableToken;

export interface TemplateIssue {
  message: string;
  key?: string;
  index?: number;
}

export interface ParseResult {
  tokens: TemplateToken[];
  errors: TemplateIssue[];
}

const TOKEN_REGEX = /\\\{\{|\{\{([^{}]*)\}\}/g;

export function parseTemplate(source: string): ParseResult {
  const tokens: TemplateToken[] = [];
  const errors: TemplateIssue[] = [];
  const text = typeof source === "string" ? source : "";
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  TOKEN_REGEX.lastIndex = 0;
  while ((match = TOKEN_REGEX.exec(text)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({ type: "text", value: text.slice(lastIndex, match.index) });
    }
    lastIndex = match.index + match[0].length;

    if (match[0] === "\\{{") {
      tokens.push({ type: "text", value: "{{" });
      continue;
    }

    const inner = (match[1] ?? "").trim();
    const [rawKey, rawSource, ...extra] = inner.split("|").map((part) => part.trim());

    if (!rawKey || !VARIABLE_KEY_PATTERN.test(rawKey)) {
      errors.push({
        message: `Invalid variable reference "${match[0]}" — expected {{name}} or {{name|mode}} with dot-separated identifier segments.`,
        index: match.index,
      });
      tokens.push({ type: "text", value: match[0] });
      continue;
    }

    let source_: VariableSource | null = null;
    if (rawSource !== undefined || extra.length > 0) {
      if (extra.length > 0 || !INLINE_SOURCES.includes(rawSource as VariableSource)) {
        const detail =
          rawSource === "csv"
            ? "csv is a run-level mode and cannot be set inline"
            : `expected one of: ${INLINE_SOURCES.join(", ")}`;
        errors.push({
          message: `Invalid source "${rawSource ?? ""}" in "${match[0]}" — ${detail}.`,
          key: rawKey,
          index: match.index,
        });
        tokens.push({ type: "text", value: match[0] });
        continue;
      }
      source_ = rawSource as VariableSource;
    }

    tokens.push({ type: "variable", key: rawKey, source: source_, raw: match[0], index: match.index });
  }

  if (lastIndex < text.length) {
    tokens.push({ type: "text", value: text.slice(lastIndex) });
  }

  return { tokens, errors };
}

/** Unique variable keys referenced by a template, in order of first appearance. */
export function extractVariables(source: string): string[] {
  const keys: string[] = [];
  for (const token of parseTemplate(source).tokens) {
    if (token.type === "variable" && !keys.includes(token.key)) {
      keys.push(token.key);
    }
  }
  return keys;
}

export interface ValidationResult {
  valid: boolean;
  errors: TemplateIssue[];
  warnings: TemplateIssue[];
}

export function validateTemplate(
  source: string,
  definitions: VariableDefinition[] = [],
): ValidationResult {
  const { tokens, errors } = parseTemplate(source);
  const warnings: TemplateIssue[] = [];
  const defined = new Set(definitions.map((definition) => definition.key));
  const referenced = new Set<string>();

  for (const token of tokens) {
    if (token.type !== "variable") continue;
    referenced.add(token.key);
    if (!defined.has(token.key)) {
      errors.push({
        message: `Unknown variable "${token.key}" — define it in the eval before using it.`,
        key: token.key,
        index: token.index,
      });
    }
  }

  for (const definition of definitions) {
    if (!referenced.has(definition.key)) {
      warnings.push({
        message: `Variable "${definition.key}" is defined but never used in this template.`,
        key: definition.key,
      });
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

export interface RenderResult {
  output: string;
  /** Referenced variables with no value provided (rendered as empty strings). */
  missing: string[];
}

export function renderTemplate(source: string, values: Record<string, string> = {}): RenderResult {
  const { tokens } = parseTemplate(source);
  const missing: string[] = [];
  const output = tokens
    .map((token) => {
      if (token.type === "text") return token.value;
      const value = values[token.key];
      if (value === undefined || value === null) {
        if (!missing.includes(token.key)) missing.push(token.key);
        return "";
      }
      return value;
    })
    .join("");

  return { output, missing };
}
