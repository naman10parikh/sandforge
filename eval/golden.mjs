#!/usr/bin/env node
/**
 * Sandforge golden cases: known-bad templates must fail for the stated reason, use cases must route to the
 * stated runtime, and templates must produce the stated E2B options. Exit 0 when every case matches.
 * Run: node eval/golden.mjs   (npm run eval runs the validator first, then this)
 */
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { TEMPLATES_DIR, validateTemplateDir } from "./run.mjs";
import { pickRuntime } from "../dispatch/pick-runtime.mjs";
import { toE2BOptions } from "../lib/boot.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const golden = JSON.parse(readFileSync(join(here, "golden.json"), "utf8"));
const base = JSON.parse(readFileSync(join(TEMPLATES_DIR, "e2b-default", "template.json"), "utf8"));

/** A copy of e2b-default with dotted-path edits applied. */
function patched({ set = {}, delete: del = [] } = {}) {
  const t = structuredClone(base);
  const walk = (path) => {
    const keys = path.split(".");
    const last = keys.pop();
    return [keys.reduce((o, k) => o[k], t), last];
  };
  for (const [path, value] of Object.entries(set)) {
    const [obj, key] = walk(path);
    obj[key] = value;
  }
  for (const path of del) {
    const [obj, key] = walk(path);
    delete obj[key];
  }
  return t;
}

const isSubset = (want, have) =>
  Object.entries(want).every(([k, v]) => (v && typeof v === "object" ? isSubset(v, have?.[k] ?? {}) && (!Array.isArray(v) || JSON.stringify(v) === JSON.stringify(have?.[k])) : have?.[k] === v));

const results = [];
const root = mkdtempSync(join(tmpdir(), "sandforge-golden-"));
try {
  for (const c of golden.templates) {
    const dir = join(root, "e2b-default"); // the folder name the base template's id expects
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir);
    copyFileSync(join(TEMPLATES_DIR, "e2b-default", "README.md"), join(dir, "README.md"));
    writeFileSync(join(dir, "template.json"), JSON.stringify(patched(c), null, 2));
    const failed = validateTemplateDir(dir).checks.filter((x) => !x.ok).map((x) => x.reason);
    const ok = c.expect === null ? failed.length === 0 : failed.some((r) => r.includes(c.expect));
    results.push({ kind: "template", name: c.name, ok, got: failed.join(" | ") || "pass" });
  }
} finally {
  rmSync(root, { recursive: true, force: true });
}

for (const c of golden.dispatch) {
  const got = pickRuntime(c.useCase).runtime;
  results.push({ kind: "dispatch", name: `"${c.useCase}" → ${c.runtime}`, ok: got === c.runtime, got });
}

for (const c of golden.plan) {
  const got = toE2BOptions(patched(c));
  results.push({ kind: "plan", name: c.name, ok: isSubset(c.options, got), got: JSON.stringify(got) });
}

const misses = results.filter((r) => !r.ok);
for (const r of misses) console.error(`  ✗ ${r.kind}: ${r.name}\n      got: ${r.got}`);
console.log(`sandforge golden: ${results.length - misses.length}/${results.length} cases match`);
process.exit(misses.length === 0 ? 0 : 1);
