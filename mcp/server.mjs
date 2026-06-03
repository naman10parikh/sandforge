#!/usr/bin/env node
/**
 * Sandforge MCP Server (stdio transport)
 *
 * Exposes two tools over the Model Context Protocol:
 *   - sandforge_validate  — run eval/run.mjs, return pass/fail + output
 *   - sandforge_dispatch  — pick the right runtime template for a stated need
 *
 * Zero external deps. Uses the MCP stdio protocol (newline-delimited JSON-RPC 2.0).
 * Start: node mcp/server.mjs   (stdio)
 */

import { execSync } from "child_process";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");

// ─── MCP protocol helpers ─────────────────────────────────────────────────────

function send(obj) {
  process.stdout.write(JSON.stringify(obj) + "\n");
}

function sendError(id, code, message) {
  send({ jsonrpc: "2.0", id, error: { code, message } });
}

function sendResult(id, result) {
  send({ jsonrpc: "2.0", id, result });
}

// ─── Tool implementations ────────────────────────────────────────────────────

function toolValidate() {
  try {
    const output = execSync("node eval/run.mjs", {
      cwd: REPO_ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { passed: true, output: output.trim() };
  } catch (err) {
    const output = (err.stdout || "") + (err.stderr || "");
    return { passed: false, output: output.trim() };
  }
}

function toolDispatch(useCase) {
  // Load dispatch logic inline (no circular dep on dispatch/pick-runtime.mjs)
  const rules = [
    { runtime: "e2b", keywords: ["e2b", "firecracker", "microvm", "short-lived", "eval", "task", "script", "agent"], template: "e2b-default" },
    { runtime: "devcontainer", keywords: ["devcontainer", "local", "vscode", "codespaces", "ci", "dev", "development"], template: "devcontainer-default" },
    { runtime: "microsandbox", keywords: ["microsandbox", "self-host", "libkrun", "open-source", "oss"], template: null },
    { runtime: "daytona", keywords: ["daytona", "workspace", "remote dev"], template: null },
    { runtime: "fly-machines", keywords: ["fly", "fly.io", "persistent", "long-running", "server"], template: null },
  ];

  const lower = (useCase || "").toLowerCase();
  for (const rule of rules) {
    if (rule.keywords.some((k) => lower.includes(k))) {
      return {
        runtime: rule.runtime,
        template: rule.template,
        reasoning: `Matched keyword in use-case for runtime '${rule.runtime}'.`,
        templatePath: rule.template ? `templates/${rule.template}/template.json` : null,
      };
    }
  }
  return {
    runtime: "e2b",
    template: "e2b-default",
    reasoning: "No keyword match — defaulting to e2b-default (strictest, most general).",
    templatePath: "templates/e2b-default/template.json",
  };
}

// ─── MCP request handler ─────────────────────────────────────────────────────

const TOOLS = [
  {
    name: "sandforge_validate",
    description: "Run the Sandforge template validator (eval/run.mjs). Returns pass/fail and full output.",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
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
];

function handleRequest(req) {
  const { id, method, params } = req;

  if (method === "initialize") {
    return sendResult(id, {
      protocolVersion: "2024-11-05",
      capabilities: { tools: {} },
      serverInfo: { name: "sandforge", version: "1.0.0" },
    });
  }

  if (method === "tools/list") {
    return sendResult(id, { tools: TOOLS });
  }

  if (method === "tools/call") {
    const { name, arguments: args } = params || {};
    if (name === "sandforge_validate") {
      const result = toolValidate();
      return sendResult(id, {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        isError: !result.passed,
      });
    }
    if (name === "sandforge_dispatch") {
      const result = toolDispatch(args?.useCase);
      return sendResult(id, {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        isError: false,
      });
    }
    return sendError(id, -32601, `Unknown tool: ${name}`);
  }

  if (method === "notifications/initialized") {
    return; // no response needed
  }

  return sendError(id, -32601, `Unknown method: ${method}`);
}

// ─── Stdio loop ───────────────────────────────────────────────────────────────

let buffer = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  const lines = buffer.split("\n");
  buffer = lines.pop(); // keep incomplete last line
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const req = JSON.parse(trimmed);
      handleRequest(req);
    } catch (e) {
      send({ jsonrpc: "2.0", id: null, error: { code: -32700, message: `Parse error: ${e.message}` } });
    }
  }
});

process.stdin.on("end", () => process.exit(0));
