#!/usr/bin/env node
/**
 * Sandforge Observability — Append a run event to run-log.jsonl
 *
 * Zero external deps. Appends a single newline-delimited JSON record.
 *
 * Usage:
 *   node observability/append-run.mjs <event> <result> <detail>
 *
 * Examples:
 *   node observability/append-run.mjs validate pass "all 2 templates passed"
 *   node observability/append-run.mjs validate fail "1 failure in e2b-default"
 *   node observability/append-run.mjs dispatch pass "picked e2b for agent eval"
 *   node observability/append-run.mjs scaffold pass "added microsandbox-default"
 *
 * Fields in each record:
 *   ts       — ISO timestamp
 *   event    — one of: validate | dispatch | scaffold | trust-audit | init
 *   result   — "pass" | "fail"
 *   detail   — human-readable summary (max 200 chars)
 *   command  — the command run (optional, inferred from event)
 */

import { appendFileSync, realpathSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
// SANDFORGE_LOG points the log elsewhere (the tests use a temporary file).
export const logPath = () => process.env.SANDFORGE_LOG || resolve(__dirname, "run-log.jsonl");

const COMMAND_MAP = {
  validate: "sandforge validate (node eval/run.mjs)",
  dispatch: "sandforge pick (node dispatch/pick-runtime.mjs)",
  plan: "sandforge plan",
  boot: "sandforge boot",
  scaffold: "skills/template-scaffold/SKILL.md (manual)",
  "trust-audit": ".claude/agents/trust-auditor.md (manual)",
  init: "init",
};

/** Append one run record. The CLI, the MCP server and the hooks call this; it never throws. */
export function appendRun(event, result, detail = "", extra = {}) {
  const record = {
    ts: new Date().toISOString(),
    event: String(event).slice(0, 50),
    command: COMMAND_MAP[event] ?? String(event),
    result: result === "fail" ? "fail" : "pass",
    detail: String(detail).slice(0, 200),
    ...extra,
  };
  try {
    appendFileSync(logPath(), JSON.stringify(record) + "\n", "utf8");
  } catch (e) {
    process.stderr.write(`[observability] could not write ${logPath()}: ${e.message}\n`);
  }
  return record;
}

// Run only when executed directly (realpath: an npx bin is a symlink).
const invokedDirectly = (() => {
  try {
    return realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
})();
if (invokedDirectly) {
  const [, , event = "validate", result = "pass", detail = ""] = process.argv;
  const record = appendRun(event, result, detail);
  process.stdout.write(`[observability] logged: ${record.event} → ${record.result}\n`);
  process.exit(0);
}
