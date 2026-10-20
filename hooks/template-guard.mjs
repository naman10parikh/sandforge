#!/usr/bin/env node
/**
 * template-guard — a Claude Code hook that keeps sandbox templates valid.
 *
 * PostToolUse (Write|Edit|MultiEdit): when the edited file is a sandforge template.json (it carries a
 *   trustEnvelope), validate it (schema, trust invariants, files). On failure, exit 2 so Claude sees why.
 * PreToolUse (Bash): when the command is a `git commit`, validate every sandforge template under the
 *   project's templates/ folder. On failure, exit 2, which blocks the commit.
 *
 * The event arrives as JSON on stdin. Anything else exits 0 at once.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import { dirname, join, resolve } from "path";
import { loadSchema, validateTemplateDir } from "../eval/run.mjs";

const isSandforgeTemplate = (file) => {
  try {
    return readFileSync(file, "utf8").includes('"trustEnvelope"');
  } catch {
    return false; // unreadable or gone: not ours to judge
  }
};

const report = (results, why) => {
  const failed = results.flatMap((r) => r.checks.filter((c) => !c.ok).map((c) => `  ✗ ${r.name}: ${c.label}: ${c.reason}`));
  if (failed.length === 0) return 0;
  process.stderr.write(`sandforge template-guard: ${why}\n${failed.join("\n")}\nFix the template, then run: node eval/run.mjs\n`);
  return 2;
};

function main(raw) {
  let event;
  try {
    event = JSON.parse(raw || "{}");
  } catch {
    return 0; // not an event we understand
  }
  const tool = event.tool_name ?? "";
  const input = event.tool_input ?? {};
  const project = process.env.CLAUDE_PROJECT_DIR || event.cwd || process.cwd();

  if (["Write", "Edit", "MultiEdit"].includes(tool)) {
    const file = input.file_path ? resolve(project, input.file_path) : "";
    if (!file.endsWith("template.json") || !isSandforgeTemplate(file)) return 0;
    return report([validateTemplateDir(dirname(file))], `${file} is not a valid sandbox template`);
  }

  if (tool === "Bash" && /\bgit\b(\s+-C\s+\S+)?\s+commit\b/.test(String(input.command ?? ""))) {
    const dir = join(project, "templates");
    if (!existsSync(dir)) return 0;
    const schema = loadSchema();
    const results = readdirSync(dir)
      .filter((n) => n !== "archive" && statSync(join(dir, n)).isDirectory() && isSandforgeTemplate(join(dir, n, "template.json")))
      .map((n) => validateTemplateDir(join(dir, n), schema));
    return report(results, "a template fails validation, so this commit is blocked");
  }
  return 0;
}

let raw = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (c) => (raw += c));
process.stdin.on("end", () => process.exit(main(raw)));
