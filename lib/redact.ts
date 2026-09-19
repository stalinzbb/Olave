const PATTERNS = [
  /Bearer\s+[A-Za-z0-9._~+/=-]+/gi,
  /\b(?:sk|pk|rk|ts)[-_][A-Za-z0-9_-]{8,}/g,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, // JWTs
];

/** Strip anything key-shaped, plus the literal secret values, before text is stored, logged or returned. */
export function redact(text: string, secrets: Array<string | undefined> = []): string {
  let out = text;
  for (const secret of secrets) {
    if (secret && secret.length >= 6) out = out.split(secret).join("[redacted]");
  }
  for (const pattern of PATTERNS) out = out.replace(pattern, "[redacted]");
  return out.slice(0, 500);
}
