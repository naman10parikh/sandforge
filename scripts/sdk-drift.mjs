#!/usr/bin/env node
/**
 * sdk-drift — compare what sandforge's boot relies on with the newest E2B SDK release.
 *
 * sandforge passes E2B's Sandbox.create a handful of options (template, timeoutMs, metadata,
 * allowInternetAccess, network.allowOut, network.denyOut) and assumes E2B's default template is `base`.
 * This script reads the newest `e2b` version from the npm registry and that version's published types from
 * unpkg, then checks: the version is inside package.json's range, every option is still declared, and the
 * documented default template is still `base`.
 *
 * Usage: node scripts/sdk-drift.mjs [--out proposal.md] [--help]
 * Exit 0: no drift. Exit 3: drift, and a proposal is written to --out. Exit 1: the lookup failed.
 */
import { readFileSync, writeFileSync } from "fs";

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(readFileSync(new URL(import.meta.url), "utf8").split("*/")[0].replace(/^#!.*\n\/\*\*\n?/, "").replace(/^ \* ?/gm, ""));
  process.exit(0);
}

const OPTIONS = ["template?:", "timeoutMs?:", "metadata?:", "allowInternetAccess?:", "allowOut?:", "denyOut?:"];
const outIdx = process.argv.indexOf("--out");
const out = outIdx > 0 ? process.argv[outIdx + 1] : null;
const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const range = pkg.optionalDependencies?.e2b ?? "";

const get = async (url) => {
  const r = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!r.ok) throw new Error(`${url} answered ${r.status}`);
  return r;
};

/** Is `version` inside a caret range such as ^2.56.0? */
export function inCaret(version, caret) {
  const [M, m, p] = version.split(".").map(Number);
  const [rM, rm, rp] = caret.replace(/^\^/, "").split(".").map(Number);
  if (M !== rM) return false;
  return m > rm || (m === rm && p >= rp);
}

let latest;
let types;
try {
  latest = (await (await get("https://registry.npmjs.org/e2b/latest")).json()).version;
  types = await (await get(`https://unpkg.com/e2b@${latest}/dist/index.d.mts`)).text();
} catch (e) {
  console.error(`sdk-drift: lookup failed: ${e.message}`);
  process.exit(1);
}

const findings = [];
if (!inCaret(latest, range)) findings.push(`The newest e2b is ${latest}, outside package.json's range ${range}.`);
const missing = OPTIONS.filter((o) => !types.includes(o));
if (missing.length) findings.push(`e2b ${latest}'s types no longer declare: ${missing.join(", ")} (lib/boot.mjs passes them to Sandbox.create).`);
if (!types.includes("@default 'base'")) findings.push(`e2b ${latest} no longer documents 'base' as the default template (templates/e2b-default sets baseImage.source to "base").`);

if (findings.length === 0) {
  console.log(`sdk-drift: e2b ${latest} is inside ${range}; all ${OPTIONS.length} options sandforge passes are declared; the default template is still 'base'.`);
  process.exit(0);
}

const proposal = `## E2B SDK drift found by sandforge's nightly loop

${findings.map((f) => `- ${f}`).join("\n")}

### Proposed change

1. Update \`optionalDependencies.e2b\` in package.json and \`OPTIONS\` here if names moved.
2. Adjust \`toE2BOptions\` in \`lib/boot.mjs\` to the new option names; keep \`npm test\` and \`npm run eval\` green.
3. Boot once by hand (\`sandforge boot e2b-default\`, needs E2B_API_KEY) and correct the template to what the VM shows.

A person reviews and lands this; the loop never merges.
`;
if (out) writeFileSync(out, proposal);
console.log(proposal);
process.exit(3);
