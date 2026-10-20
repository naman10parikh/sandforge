import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { checkTrustInvariants, listTemplateNames, validateAll, validateSchema, loadSchema } from "../eval/run.mjs";
import { pickRuntime } from "../dispatch/pick-runtime.mjs";
import { judge, planBoot, probesFor, toE2BOptions, versionSatisfies, bootInE2B } from "../lib/boot.mjs";
import { recall } from "../lib/recall.mjs";

const e2b = JSON.parse(readFileSync(new URL("../templates/e2b-default/template.json", import.meta.url), "utf8"));
const dev = JSON.parse(readFileSync(new URL("../templates/devcontainer-default/template.json", import.meta.url), "utf8"));
const clone = (t) => structuredClone(t);

test("every shipped template passes the validator", () => {
  const r = validateAll();
  assert.deepEqual(listTemplateNames(), ["devcontainer-default", "e2b-default"]);
  assert.equal(r.failures, 0, JSON.stringify(r.results.map((x) => x.checks.filter((c) => !c.ok))));
});

test("the schema check honours additionalProperties: false", () => {
  const t = clone(e2b);
  t.compute.gpu = 1;
  assert.ok(validateSchema(t, loadSchema()).some((e) => e.includes('unknown field "gpu"')));
});

test("dangerous capabilities are refused, safe ones pass", () => {
  for (const cap of ["SYS_ADMIN", "net_admin", "CAP_SYS_PTRACE", "ALL"]) {
    const t = clone(e2b);
    t.trustEnvelope.capAdd = [cap];
    assert.ok(checkTrustInvariants(t).some((e) => e.includes("dangerous")), cap);
  }
  const ok = clone(e2b);
  ok.trustEnvelope.capAdd = ["CHOWN"];
  assert.deepEqual(checkTrustInvariants(ok), []);
});

test("dispatch matches whole words, and most matches win", () => {
  assert.equal(pickRuntime("social media scraper daemon").runtime, "fly-machines"); // "ci" inside "social" no longer counts
  assert.equal(pickRuntime("a device driver test").runtime, "e2b"); // "dev" inside "device" no longer counts
  assert.equal(pickRuntime("long-running agent server").runtime, "fly-machines");
  assert.equal(pickRuntime("").template, "e2b-default");
});

test("a closed template boots with internet access off, in E2B's base template", () => {
  assert.deepEqual(toE2BOptions(e2b), {
    template: "base",
    timeoutMs: 300_000,
    metadata: { sandforge: `e2b-default@${e2b.version}` },
    allowInternetAccess: false,
  });
});

test("an allowlist becomes network.allowOut plus deny-all; devcontainer templates never boot", () => {
  const t = clone(e2b);
  t.trustEnvelope.allowNetworkEgress = true;
  t.trustEnvelope.allowedEgressDomains = ["pypi.org"];
  const o = toE2BOptions(t);
  assert.deepEqual(o.network, { allowOut: ["pypi.org"], denyOut: ["0.0.0.0/0"] });
  assert.equal(o.allowInternetAccess, undefined);
  assert.ok(probesFor(t).some((p) => p.kind === "egress-open"));
  assert.throws(() => toE2BOptions(dev), /only e2b templates boot/);
});

test("the plan lists one probe per tool plus egress, secrets and notes", () => {
  const p = planBoot(e2b);
  assert.equal(p.probes.length, e2b.preinstalledTools.length + 4);
  assert.ok(p.probes.every((x) => !x.command.includes("2>/dev/null") && !x.command.includes("exit 0")));
});

test("versions compare the way templates declare them", () => {
  assert.equal(versionSatisfies("v20.9.0", ">=18"), true);
  assert.equal(versionSatisfies("Python 3.11.6", ">=3.11"), true);
  assert.equal(versionSatisfies("git version 2.39.5", ">=2.40"), false);
  assert.equal(versionSatisfies("v22.3.0", "22"), true);
  assert.equal(versionSatisfies("v20.1.0", "22"), false);
});

test("probes are judged against the declaration, and a secret's value is never echoed", () => {
  const [node] = probesFor(e2b);
  assert.equal(judge(node, { exitCode: 127, stderr: "node: command not found" }, e2b).ok, false);
  const egress = probesFor(e2b).find((p) => p.kind === "egress-closed");
  assert.equal(judge(egress, { exitCode: 0, stdout: "/usr/bin/curl" }, e2b).ok, false);
  assert.equal(judge(egress, { exitCode: 28 }, e2b).ok, true);
  const secrets = probesFor(e2b).find((p) => p.kind === "secrets");
  const leak = judge(secrets, { exitCode: 0, stdout: "HOME\nOPENAI_API_KEY\nPATH\n" }, e2b);
  assert.equal(leak.ok, false);
  assert.equal(leak.detail, "undeclared: OPENAI_API_KEY");
  const t = clone(e2b);
  t.trustEnvelope.secretSlots = ["OPENAI_API_KEY"];
  assert.equal(judge(secrets, { exitCode: 0, stdout: "OPENAI_API_KEY\n" }, t).ok, true);
});

test("a boot without E2B_API_KEY refuses cleanly and creates nothing", async () => {
  const saved = process.env.E2B_API_KEY;
  delete process.env.E2B_API_KEY;
  try {
    const r = await bootInE2B(e2b);
    assert.equal(r.ok, false);
    assert.match(r.error, /E2B_API_KEY/);
  } finally {
    if (saved !== undefined) process.env.E2B_API_KEY = saved;
  }
});

// A live boot costs one sandbox, so it runs only when asked for: SANDFORGE_LIVE_E2B=1 and a key.
test("e2b-default boots in a live E2B microVM and its envelope holds", { skip: !(process.env.SANDFORGE_LIVE_E2B === "1" && process.env.E2B_API_KEY) && "set SANDFORGE_LIVE_E2B=1 and E2B_API_KEY to boot" }, async () => {
  const r = await bootInE2B(e2b);
  assert.equal(r.error, undefined);
  assert.ok(r.coldStartMs > 0);
  assert.equal(r.ok, true, JSON.stringify(r.probes));
});

test("recall finds the trust rules and the boot lessons", () => {
  const hits = recall("egress allowInternetAccess");
  assert.ok(hits.length > 0);
  assert.ok(hits.some((h) => h.file.startsWith("identity/") || h.file.startsWith("skills/")));
});
