#!/usr/bin/env node
/**
 * sandforge — sandbox templates with a trust envelope, validated and booted in E2B.
 *
 *   sandforge list | show <id> | validate [dir] | pick "<use case>" | plan <id|path> | boot <id|path> | recall "<q>"
 */
import { readFileSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";
import { TEMPLATES_DIR, listTemplateNames, main as validateMain, validateAll } from "../eval/run.mjs";
import { pickRuntime } from "../dispatch/pick-runtime.mjs";
import { bootInE2B, loadTemplate, planBoot } from "../lib/boot.mjs";
import { recall } from "../lib/recall.mjs";
import { appendRun } from "../observability/append-run.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const VERSION = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).version;
const [cmd, ...rest] = process.argv.slice(2);
const json = rest.includes("--json");
const positional = rest.filter((a) => !a.startsWith("--"));

const HELP = `sandforge ${VERSION} — sandbox templates with a trust envelope, validated and booted in E2B

Usage:
  sandforge list                         the templates: id, runtime, egress, timeout
  sandforge show <id>                    print a template's JSON
  sandforge validate [<templates dir>]   check every template: schema, trust rules, files
  sandforge pick "<use case>" [--json]   pick the runtime and template for a task
  sandforge plan <id|path> [--json]      the E2B options and probes a boot would use (creates nothing)
  sandforge boot <id|path> [--json]      boot it in a live E2B microVM, run the probes, kill the VM
                                         (needs E2B_API_KEY and the optional e2b package; one short sandbox)
  sandforge recall "<query>"             search sandforge's own memory, skills and templates
  sandforge --version | --help

MCP server: sandforge-mcp (sandforge_validate, sandforge_dispatch, sandforge_list_templates,
            sandforge_get_template, sandforge_plan)`;

const out = (obj) => console.log(JSON.stringify(obj, null, 2));
const usage = (msg) => {
  console.error(`${msg}\n\n${HELP}`);
  process.exit(2);
};

function load(ref) {
  if (!ref) usage("Name a template (an id from `sandforge list`, or a path).");
  const t = loadTemplate(ref);
  if (t.error) {
    console.error(t.error);
    process.exit(2);
  }
  return t;
}

async function run() {
  if (!cmd || cmd === "--help" || cmd === "-h" || cmd === "help") return console.log(HELP);
  if (cmd === "--version" || cmd === "-v") return console.log(VERSION);

  if (cmd === "list") {
    const rows = listTemplateNames().map((id) => {
      const t = JSON.parse(readFileSync(join(TEMPLATES_DIR, id, "template.json"), "utf8"));
      const egress = t.trustEnvelope.allowNetworkEgress ? `open to ${t.trustEnvelope.allowedEgressDomains.length || "all"} hosts` : "closed";
      return { id, runtime: t.runtime, version: t.version, egress, timeoutSeconds: t.compute.timeoutSeconds, cost: t.compute.estimatedHourlyCost };
    });
    if (json) return out(rows);
    for (const r of rows) console.log(`${r.id.padEnd(22)} ${r.runtime.padEnd(13)} egress ${r.egress.padEnd(20)} timeout ${r.timeoutSeconds}s  ${r.cost}`);
    return;
  }

  if (cmd === "show") {
    return console.log(readFileSync(join(load(positional[0]).dir, "template.json"), "utf8").trimEnd());
  }

  if (cmd === "validate") {
    const dir = positional[0] ? resolve(positional[0]) : TEMPLATES_DIR;
    if (json) {
      const r = validateAll(dir);
      appendRun("validate", r.failures === 0 ? "pass" : "fail", `${r.templates} template(s), ${r.failures} failure(s)`);
      out(r);
      process.exitCode = r.failures === 0 && r.templates > 0 ? 0 : 1;
      return;
    }
    const code = validateMain(dir);
    appendRun("validate", code === 0 ? "pass" : "fail", `exit ${code} for ${dir === TEMPLATES_DIR ? "templates/" : dir}`);
    process.exitCode = code;
    return;
  }

  if (cmd === "pick") {
    const useCase = positional.join(" ");
    if (!useCase) usage('Describe the task, for example: sandforge pick "run an untrusted eval script"');
    const r = pickRuntime(useCase);
    appendRun("dispatch", "pass", `${r.runtime} for: ${useCase}`);
    if (json) return out(r);
    console.log(`${r.runtime} → ${r.template ?? "(no template yet)"}\n${r.label}\nWhen: ${r.when}\nWhy: ${r.reasoning}`);
    return;
  }

  if (cmd === "plan" || cmd === "boot") {
    const t = load(positional[0]);
    if (t.failed.length > 0) {
      console.error(`'${positional[0]}' fails validation, so it will not ${cmd}:`);
      for (const c of t.failed) console.error(`  ✗ ${c.label}: ${c.reason}`);
      process.exitCode = 1;
      return;
    }
    if (t.template.runtime !== "e2b") {
      console.error(`'${t.template.id}' targets ${t.template.runtime}; only e2b templates boot in E2B.`);
      process.exitCode = 2;
      return;
    }
    if (cmd === "plan") {
      const p = planBoot(t.template);
      appendRun("plan", "pass", `${p.template}@${p.version}: ${p.probes.length} probes`);
      if (json) return out(p);
      console.log(`Sandbox.create(${JSON.stringify(p.options)})\nProbes:`);
      for (const pr of p.probes) console.log(`  - ${pr.name}: ${pr.command}`);
      return;
    }
    if (!json) console.log(`Booting ${t.template.id}@${t.template.version} in E2B...`);
    const r = await bootInE2B(t.template);
    appendRun("boot", r.ok ? "pass" : "fail", r.error ?? `${r.probes.filter((p) => p.ok).length}/${r.probes.length} probes, cold start ${r.coldStartMs} ms`, r.ok ? { coldStartMs: r.coldStartMs } : {});
    process.exitCode = r.ok ? 0 : 1;
    if (json) return out(r);
    if (r.error) return console.error(`Boot failed: ${r.error}`);
    console.log(`Cold start ${r.coldStartMs} ms (sandbox ${r.sandboxId}, killed after the probes)`);
    for (const p of r.probes) console.log(`  ${p.note ? "·" : p.ok ? "✓" : "✗"} ${p.name}: ${p.detail}`);
    console.log(r.ok ? "The trust envelope holds." : "The template's declaration and the live VM disagree.");
    return;
  }

  if (cmd === "recall") {
    const q = positional.join(" ");
    if (!q) usage('Give a query, for example: sandforge recall "egress allowlist"');
    const hits = recall(q);
    if (json) return out(hits);
    if (hits.length === 0) return console.log("No match.");
    for (const h of hits) console.log(`${h.file} › ${h.heading}\n  ${h.snippet}`);
    return;
  }

  usage(`Unknown command: ${cmd}`);
}

run().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
