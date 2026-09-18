import { expect, it } from "vitest";

import { redact } from "@/lib/redact";

it("removes bearer tokens, key-shaped strings, JWTs and literal secrets", () => {
  const secret = "my-custom-secret-value";
  const out = redact(
    `401 for Authorization: Bearer abc.def-123 key sk-or-v1-0123456789abcdef jwt eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.sig_value raw ${secret}`,
    [secret, undefined],
  );
  for (const leak of ["abc.def-123", "sk-or-v1", "eyJhbGci", secret]) expect(out).not.toContain(leak);
  expect(out).toContain("401");
});
