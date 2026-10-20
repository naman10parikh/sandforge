import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const scratch = mkdtempSync(join(tmpdir(), "sandforge-test-"));
const env = { ...process.env, SANDFORGE_LOG: join(scratch, "runs.jsonl") };

const run = (bin, args, input, extraEnv = env) =>
  spawnSync(process.execPath, [join(root, bin), ...args], { encoding: "utf8", input, env: extraEnv, cwd: scratch });
const cli = (...args) => run("bin/sandforge.mjs", args);

test("--help and --version answer", () => {
  assert.match(cli("--help").stdout, /sandforge plan <id\|path>/);
  assert.equal(cli("--version").stdout.trim(), JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version);
});

test("list, validate, pick and plan work and are logged", () => {
  const list = JSON.parse(cli("list", "--json").stdout);
  assert.deepEqual(list.map((t) => t.id), ["devcontainer-default", "e2b-default"]);
  assert.equal(cli("validate").status, 0);
  assert.equal(JSON.parse(cli("pick", "run an untrusted eval script", "--json").stdout).runtime, "e2b");
  const plan = JSON.parse(cli("plan", "e2b-default", "--json").stdout);
  assert.equal(plan.options.allowInternetAccess, false);
  const events = readFileSync(env.SANDFORGE_LOG, "utf8").trim().split("\n").map((l) => JSON.parse(l).event);
  assert.ok(["validate", "dispatch", "plan"].every((e) => events.includes(e)), events.join(","));
});

test("validate fails a folder with a bad template, and plan refuses it", () => {
  const dir = join(scratch, "templates", "risky");
  mkdirSync(dir, { recursive: true });
  const t = JSON.parse(readFileSync(join(root, "templates/e2b-default/template.json"), "utf8"));
  t.id = "risky";
  t.trustEnvelope.capAdd = ["SYS_ADMIN"];
  writeFileSync(join(dir, "template.json"), JSON.stringify(t));
  copyFileSync(join(root, "templates/e2b-default/README.md"), join(dir, "README.md"));
  const v = cli("validate", join(scratch, "templates"));
  assert.equal(v.status, 1);
  assert.match(v.stderr, /dangerous capabilities/);
  const p = cli("plan", dir);
  assert.equal(p.status, 1);
  assert.match(p.stderr, /fails validation/);
});

test("devcontainer templates do not boot; a keyless boot refuses", () => {
  assert.equal(cli("plan", "devcontainer-default").status, 2);
  const noKey = { ...env };
  delete noKey.E2B_API_KEY;
  const r = run("bin/sandforge.mjs", ["boot", "e2b-default"], undefined, noKey);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /E2B_API_KEY is not set/);
});

test("recall searches, an unknown command is a usage error", () => {
  assert.match(cli("recall", "trust", "gate").stdout, /›/);
  assert.equal(cli("frobnicate").status, 2);
});

test("the MCP server lists five tools, answers calls, and stays silent on notifications", () => {
  const lines = [
    { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "0" } } },
    { jsonrpc: "2.0", method: "notifications/initialized" },
    { jsonrpc: "2.0", id: 2, method: "tools/list" },
    { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "sandforge_plan", arguments: { id: "e2b-default" } } },
    { jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "sandforge_get_template", arguments: { id: "nope" } } },
    { jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "sandforge_dispatch", arguments: { useCase: "debug my app interactively" } } },
  ];
  const r = run("mcp/server.mjs", [], lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
  const out = r.stdout.trim().split("\n").map((l) => JSON.parse(l));
  assert.deepEqual(out.map((o) => o.id), [1, 2, 3, 4, 5]);
  assert.deepEqual(out[1].result.tools.map((t) => t.name), ["sandforge_validate", "sandforge_dispatch", "sandforge_list_templates", "sandforge_get_template", "sandforge_plan"]);
  assert.equal(JSON.parse(out[2].result.content[0].text).options.template, "base");
  assert.equal(out[3].result.isError, true);
  assert.equal(JSON.parse(out[4].result.content[0].text).runtime, "devcontainer");
});

test("the template guard blocks a commit and flags an edit when a template is bad", () => {
  const project = join(scratch, "project");
  const dir = join(project, "templates", "bad");
  mkdirSync(dir, { recursive: true });
  const t = JSON.parse(readFileSync(join(root, "templates/e2b-default/template.json"), "utf8"));
  t.id = "bad";
  t.trustEnvelope.allowedEgressDomains = ["evil.example"];
  writeFileSync(join(dir, "template.json"), JSON.stringify(t));
  copyFileSync(join(root, "templates/e2b-default/README.md"), join(dir, "README.md"));
  const hookEnv = { ...env, CLAUDE_PROJECT_DIR: project };
  const commit = run("hooks/template-guard.mjs", [], JSON.stringify({ tool_name: "Bash", tool_input: { command: "git commit -m wip" } }), hookEnv);
  assert.equal(commit.status, 2);
  assert.match(commit.stderr, /commit is blocked/);
  const edit = run("hooks/template-guard.mjs", [], JSON.stringify({ tool_name: "Edit", tool_input: { file_path: join(dir, "template.json") } }), hookEnv);
  assert.equal(edit.status, 2);
  // Not ours: another tool's template.json, an unrelated command, this repository's own green templates
  writeFileSync(join(project, "template.json"), "{\"name\": \"a cookiecutter file\"}");
  assert.equal(run("hooks/template-guard.mjs", [], JSON.stringify({ tool_name: "Write", tool_input: { file_path: join(project, "template.json") } }), hookEnv).status, 0);
  assert.equal(run("hooks/template-guard.mjs", [], JSON.stringify({ tool_name: "Bash", tool_input: { command: "ls" } }), hookEnv).status, 0);
  assert.equal(run("hooks/template-guard.mjs", [], JSON.stringify({ tool_name: "Bash", tool_input: { command: "git commit -m ok" } }), { ...env, CLAUDE_PROJECT_DIR: root }).status, 0);
});
