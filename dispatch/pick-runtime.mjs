#!/usr/bin/env node
/**
 * Sandforge Runtime Dispatcher
 *
 * Picks the right sandbox runtime template for a stated use-case.
 * Returns the recommended template and reasoning.
 *
 * Usage:
 *   node dispatch/pick-runtime.mjs "run a short eval script"
 *   node dispatch/pick-runtime.mjs "local VSCode dev environment"
 *   node dispatch/pick-runtime.mjs  (interactive prompt if no arg)
 *
 * Exit 0 always — this is a recommendation tool, not a gate.
 */

import { createInterface } from "readline";
import { realpathSync } from "fs";
import { fileURLToPath } from "url";

// ─── Dispatch rules ───────────────────────────────────────────────────────────
// Ordered strictest first. The rule with the most keyword matches wins; a tie goes to the earlier rule.

export const RULES = [
  {
    runtime: "e2b",
    template: "e2b-default",
    label: "E2B Firecracker microVM (~150ms cold start, minimal trust)",
    keywords: [
      "e2b", "firecracker", "microvm", "agent", "eval", "task", "script",
      "short", "ephemeral", "short-lived", "darwin", "helios", "worker",
      "execute", "run code", "sandboxed",
    ],
    when: "Short-lived task execution (<5 min). Agent eval runs. Script execution. Code generation + test cycles.",
  },
  {
    runtime: "devcontainer",
    template: "devcontainer-default",
    label: "devcontainer (local dev, VSCode, Codespaces, CI)",
    keywords: [
      "devcontainer", "local", "vscode", "codespace", "codespaces", "ci",
      "dev", "development", "debug", "interactive", "persistent dev",
    ],
    when: "Local development, CI pipelines, VSCode devcontainers, GitHub Codespaces.",
  },
  {
    runtime: "microsandbox",
    template: null,
    label: "microsandbox (OSS self-host, libkrun, Apache-2.0)",
    keywords: [
      "microsandbox", "self-host", "selfhost", "libkrun", "open-source", "oss",
      "on-prem", "on-premise", "no-vendor", "break-even",
    ],
    when: "Self-hosted deployments where E2B vendor lock-in is unacceptable. Break-even ~11k sandbox-hrs/mo vs E2B.",
  },
  {
    runtime: "daytona",
    template: null,
    label: "Daytona (workspace orchestration)",
    keywords: ["daytona", "workspace", "remote dev", "remote workspace"],
    when: "Remote development workspaces with Daytona orchestration.",
  },
  {
    runtime: "fly-machines",
    template: null,
    label: "Fly Machines (persistent, long-running servers)",
    keywords: [
      "fly", "fly.io", "persistent", "long-running", "server", "daemon",
      "24/7", "always-on", "websocket", "stateful",
    ],
    when: "Long-running or persistent services (servers, daemons, websocket endpoints).",
  },
];

const DEFAULT_RULE = RULES[0]; // e2b-default as fallback

// ─── Matching logic ───────────────────────────────────────────────────────────

// Whole words only: "ci" must not match "social", "dev" must not match "device".
const hasWord = (text, k) => new RegExp(`(^|[^a-z0-9])${k.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}($|[^a-z0-9])`).test(text);

/** The rule with the most keyword matches wins; a tie goes to the earlier (stricter) rule. */
export function pickRuntime(useCase) {
  const lower = (useCase || "").toLowerCase();

  let best = null;
  for (const rule of RULES) {
    const matched = rule.keywords.filter((k) => hasWord(lower, k));
    if (matched.length > 0 && (!best || matched.length > best.matched.length)) best = { rule, matched };
  }
  if (best) {
    const { rule, matched } = best;
    return {
      runtime: rule.runtime,
      template: rule.template,
      label: rule.label,
      when: rule.when,
      matchedKeyword: matched[0],
      matchedKeywords: matched,
      templatePath: rule.template ? `templates/${rule.template}/template.json` : null,
      reasoning: `Matched ${matched.map((k) => `"${k}"`).join(", ")} → runtime '${rule.runtime}'.`,
    };
  }

  return {
    runtime: DEFAULT_RULE.runtime,
    template: DEFAULT_RULE.template,
    label: DEFAULT_RULE.label,
    when: DEFAULT_RULE.when,
    matchedKeyword: null,
    templatePath: `templates/${DEFAULT_RULE.template}/template.json`,
    reasoning: "No keyword matched — defaulting to e2b-default (strictest, most general).",
  };
}

// ─── CLI output ───────────────────────────────────────────────────────────────

function printResult(useCase, result) {
  console.log(`\nSandforge Runtime Dispatcher`);
  console.log(`Use-case: "${useCase}"`);
  console.log(`${"─".repeat(50)}`);
  console.log(`  Runtime : ${result.runtime}`);
  console.log(`  Template: ${result.template ?? "(no template yet — stub needed)"}`);
  console.log(`  Label   : ${result.label}`);
  console.log(`  When    : ${result.when}`);
  console.log(`  Reason  : ${result.reasoning}`);
  if (result.templatePath) {
    console.log(`  Path    : ${result.templatePath}`);
  }
  console.log();
}

// ─── Main ─────────────────────────────────────────────────────────────────────

// Run only when executed directly (the CLI and MCP server import pickRuntime).
const invokedDirectly = (() => {
  try {
    return realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
})();
const arg = process.argv[2];

if (!invokedDirectly) {
  // imported: nothing to run
} else if (arg) {
  const result = pickRuntime(arg);
  printResult(arg, result);
  process.exit(0);
} else {
  // Interactive mode
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  rl.question("Describe your use-case: ", (useCase) => {
    rl.close();
    const result = pickRuntime(useCase);
    printResult(useCase, result);
    process.exit(0);
  });
}
