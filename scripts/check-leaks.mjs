// Fails if anything secret-shaped reached the browser bundle. Run after `next build`.
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = ".next/static";
if (!existsSync(ROOT)) {
  console.error("check-leaks: run `next build` first.");
  process.exit(1);
}

const SECRET_ENV = ["OPENROUTER_API_KEY", "TYPESAFE_API_KEY", "SUPABASE_SERVICE_ROLE_KEY"];
const needles = [
  ...SECRET_ENV, // even the *name* appearing client-side means server code was bundled
  ...SECRET_ENV.map((name) => process.env[name]).filter((value) => value && value.length >= 8),
  "sk-or-",
  "api.typesafe.ai", // the TypeSafe SDK must only ever be bundled server-side
];
// The one allowed mention: the cURL placeholder in Studio, a shell variable with no value.
const ALLOWED = /Bearer \$OPENROUTER_API_KEY/g;

const walk = (dir) => readdirSync(dir).flatMap((name) => {
  const path = join(dir, name);
  return statSync(path).isDirectory() ? walk(path) : [path];
});

const hits = [];
for (const file of walk(ROOT).filter((path) => /\.(js|css|json|html|map)$/.test(path))) {
  const text = readFileSync(file, "utf8").replace(ALLOWED, "");
  for (const needle of needles) if (text.includes(needle)) hits.push(`${file}: ${needle.length > 24 ? "<secret value>" : needle}`);
}

if (hits.length) {
  console.error(`check-leaks: FAILED\n${hits.join("\n")}`);
  process.exit(1);
}
console.log("check-leaks: clean — no key names, key values or provider endpoints in the client bundle.");
