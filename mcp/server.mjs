#!/usr/bin/env node
/**
 * Sandforge MCP Server (stdio transport)
 *
 * Exposes five tools over the Model Context Protocol. None of them creates a sandbox or spends money;
 * booting a template in E2B stays a deliberate CLI step (`sandforge boot`).
 *   - sandforge_validate        — run the template validator, return pass/fail + every check
 *   - sandforge_dispatch        — pick the right runtime template for a stated need
 *   - sandforge_list_templates  — the templates with runtime, egress and limits
 *   - sandforge_get_template    — one template's full JSON
 *   - sandforge_plan            — the exact E2B create options and probes a boot of a template would use
 *
 * Zero external deps. Uses the MCP stdio protocol (newline-delimited JSON-RPC 2.0).
 * Start: node mcp/server.mjs   (stdio)   or   npx -y -p github:naman10parikh/sandforge sandforge-mcp
 */

import { readFileSync } from "fs";
import { join } from "path";
import { createInterface } from "readline";
import { TEMPLATES_DIR, listTemplateNames, validateAll } from "../eval/run.mjs";
import { pickRuntime } from "../dispatch/pick-runtime.mjs";
import { loadTemplate, planBoot } from "../lib/boot.mjs";
import { appendRun } from "../observability/append-run.mjs";

const VERSION = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version;

// ─── Tool implementations ────────────────────────────────────────────────────

const text = (obj, isError = false) => ({ content: [{ type: "text", text: JSON.stringify(obj, null, 2) }], isError });

function toolValidate() {
  const r = validateAll();
  const output = r.results
    .flatMap((t) => [`[${t.name}]`, ...t.checks.map((c) => (c.ok ? `  ✓ ${c.label}` : `  ✗ ${c.label}: ${c.reason}`))])
    .join("\n");
  return { passed: r.failures === 0 && r.templates > 0, templates: r.templates, failures: r.failures, output };
}

function toolList() {
  return listTemplateNames().map((id) => {
    const t = JSON.parse(readFileSync(join(TEMPLATES_DIR, id, "template.json"), "utf8"));
    return {
      id,
      runtime: t.runtime,
      version: t.version,
      description: t.description,
      allowNetworkEgress: t.trustEnvelope.allowNetworkEgress,
      allowedEgressDomains: t.trustEnvelope.allowedEgressDomains,
      timeoutSeconds: t.compute.timeoutSeconds,
      estimatedHourlyCost: t.compute.estimatedHourlyCost,
    };
  });
}

function toolGet(id) {
  if (!listTemplateNames().includes(id)) return { error: `no template '${id}'; try sandforge_list_templates` };
  return JSON.parse(readFileSync(join(TEMPLATES_DIR, id, "template.json"), "utf8"));
}

function toolPlan(id) {
  if (!listTemplateNames().includes(id)) return { error: `no template '${id}'; try sandforge_list_templates` };
  const t = loadTemplate(id);
  if (t.failed.length > 0) return { error: `'${id}' fails validation`, failed: t.failed };
  if (t.template.runtime !== "e2b") return { error: `'${id}' targets ${t.template.runtime}; only e2b templates boot in E2B` };
  return { ...planBoot(t.template), boot: `sandforge boot ${id}  (needs E2B_API_KEY; one short sandbox)` };
}

// ─── MCP request handler ─────────────────────────────────────────────────────

const idArg = {
  type: "object",
  properties: { id: { type: "string", description: "A template id from sandforge_list_templates, such as 'e2b-default'." } },
  required: ["id"],
};

const TOOLS = [
  {
    name: "sandforge_validate",
    description: "Run the Sandforge template validator (schema, trust invariants, required files). Returns pass/fail and every check.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "sandforge_dispatch",
    description: "Pick the right Sandforge sandbox runtime template for a stated use-case.",
    inputSchema: {
      type: "object",
      properties: {
        useCase: {
          type: "string",
          description: "Describe what the sandbox needs to do (e.g. 'run a short eval script', 'local dev environment for VSCode').",
        },
      },
      required: ["useCase"],
    },
  },
  {
    name: "sandforge_list_templates",
    description: "List the sandbox templates with their runtime, network egress, timeout and cost.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "sandforge_get_template",
    description: "Return one template's full definition, including its trust envelope.",
    inputSchema: idArg,
  },
  {
    name: "sandforge_plan",
    description: "Show the exact E2B Sandbox.create options and the probes that `sandforge boot` would run for an e2b template. Creates nothing.",
    inputSchema: idArg,
  },
];

function callTool(name, args) {
  if (name === "sandforge_validate") {
    const r = toolValidate();
    return text(r, !r.passed);
  }
  if (name === "sandforge_dispatch") return text(pickRuntime(args.useCase));
  if (name === "sandforge_list_templates") return text(toolList());
  if (name === "sandforge_get_template") {
    const r = toolGet(String(args.id ?? ""));
    return text(r, Boolean(r.error));
  }
  if (name === "sandforge_plan") {
    const r = toolPlan(String(args.id ?? ""));
    return text(r, Boolean(r.error));
  }
  return null;
}

const respond = (id, result) => JSON.stringify({ jsonrpc: "2.0", id, result });
const fail = (id, code, message) => JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } });

// ─── Stdio loop ───────────────────────────────────────────────────────────────

const rl = createInterface({ input: process.stdin });
rl.on("line", (line) => {
  if (!line.trim()) return;
  let req;
  try {
    req = JSON.parse(line);
  } catch (e) {
    process.stdout.write(fail(null, -32700, `Parse error: ${e.message}`) + "\n");
    return;
  }
  if (req.id === undefined || req.id === null) return; // a notification: nothing to answer
  if (req.method === "initialize") {
    process.stdout.write(respond(req.id, { protocolVersion: "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "sandforge", version: VERSION } }) + "\n");
  } else if (req.method === "tools/list") {
    process.stdout.write(respond(req.id, { tools: TOOLS }) + "\n");
  } else if (req.method === "tools/call") {
    const name = req.params?.name;
    const result = callTool(name, req.params?.arguments ?? {});
    appendRun(`mcp:${name}`, result && !result.isError ? "pass" : "fail", name ?? "");
    process.stdout.write((result ? respond(req.id, result) : fail(req.id, -32601, `Unknown tool: ${name}`)) + "\n");
  } else if (req.method === "ping") {
    process.stdout.write(respond(req.id, {}) + "\n");
  } else {
    process.stdout.write(fail(req.id, -32601, `Method not found: ${req.method}`) + "\n");
  }
});
rl.on("close", () => process.exit(0));
