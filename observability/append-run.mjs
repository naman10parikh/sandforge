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

import { appendFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOG_PATH = resolve(__dirname, "run-log.jsonl");

const COMMAND_MAP = {
  validate: "node eval/run.mjs",
  dispatch: "node dispatch/pick-runtime.mjs",
  scaffold: "skills/template-scaffold.md (manual)",
  "trust-audit": "sub_agents/trust-auditor.md (manual)",
  init: "init",
};

const [, , event = "validate", result = "pass", detail = ""] = process.argv;

const record = {
  ts: new Date().toISOString(),
  event: event.slice(0, 50),
  command: COMMAND_MAP[event] ?? event,
  result: result === "fail" ? "fail" : "pass",
  detail: detail.slice(0, 200),
};

appendFileSync(LOG_PATH, JSON.stringify(record) + "\n", "utf8");
process.stdout.write(`[observability] logged: ${record.event} → ${record.result}\n`);
process.exit(0);
