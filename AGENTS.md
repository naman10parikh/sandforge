# AGENTS.md — Sandforge Repository Schema

> Tells LLM agents how this repository is structured and how to use it. This file is the one source;
> `CLAUDE.md` and `GEMINI.md` import it.

## What it does

Sandforge ships sandbox templates (an E2B Firecracker microVM and a devcontainer), each with a trust
envelope: network egress, mounts, secret slots, capabilities, limits and cost. It validates every template
against a schema and trust rules, picks the right runtime for a task, and boots an e2b template in a live
E2B microVM to check that the envelope holds.

## Domain

sandbox-infra

## Created

2026-06-03

## Tools and how to call them

| Command | What it does |
|---|---|
| `sandforge list` | the templates: id, runtime, egress, timeout, cost |
| `sandforge show <id>` | one template's JSON |
| `sandforge validate [<templates dir>]` | schema, trust invariants and files for every template (exit 1 on a failure) |
| `sandforge pick "<use case>"` | the runtime and template for a task |
| `sandforge plan <id\|path>` | the exact `Sandbox.create` options and probes a boot would use; creates nothing |
| `sandforge boot <id\|path>` | boots it in E2B, runs the probes, kills the VM (needs `E2B_API_KEY`; one short sandbox) |
| `sandforge recall "<query>"` | searches identity/, memory/, skills, sub-agents and template READMEs |

From a checkout use `node bin/sandforge.mjs ...`; from anywhere,
`npx -y -p github:naman10parikh/sandforge sandforge ...`. Add `--json` for data.

**MCP server** (`sandforge-mcp`, or `node mcp/server.mjs`): `sandforge_validate`, `sandforge_dispatch`,
`sandforge_list_templates`, `sandforge_get_template`, `sandforge_plan`. None of them boots a sandbox.

**Skills** (`skills/<name>/SKILL.md`): `template-validate` (check templates), `template-scaffold` (add a
template from the strictest envelope), `sandbox-boot` (prove an e2b template in a live VM).

**Sub-agents** (`.claude/agents/`): `trust-auditor` (read-only review of any trust change),
`template-forger` (writes templates; never widens a trust envelope).

**Hook** (`hooks/template-guard.mjs`): after an edit to a sandforge `template.json`, validate it; before a
`git commit`, validate every template under `templates/` and block the commit (exit 2) if one fails.

## Directory Structure

```
identity/               — Agent identity: SOUL, BRAND, MEMORY, HEARTBEAT, LEARNINGS
templates/              — The owned artifacts (one subdir per template)
  {name}/               — Template directory (id must match directory name)
    template.json       — Machine-readable spec (validates against eval/schema/)
    README.md           — Human-readable guide (required)
    devcontainer.json   — Only for runtime=devcontainer templates
    trust-gate-v{N}.md  — Required when widening the trust envelope
  archive/              — Deprecated templates (never deleted)
eval/                   — run.mjs (the validator), golden.mjs + golden.json (cases that must hold), schema/
lib/                    — boot.mjs (E2B boot and probes), recall.mjs (memory search)
dispatch/               — pick-runtime.mjs (runtime routing)
bin/sandforge.mjs       — the CLI
mcp/server.mjs          — the MCP server (stdio)
hooks/                  — template-guard.mjs and hooks.json (the plugin's hook)
observability/          — append-run.mjs and run-log.jsonl (append-only)
scripts/sdk-drift.mjs   — the nightly loop's check against the newest E2B SDK
skills/, .claude/agents/ — skills and sub-agents
memory/                 — Session logs (one file per day: session-YYYY-MM-DD.md)
tests/                  — node:test suites (npm test)
```

## Agent Navigation

**Start here:** `CLAUDE.md` → `identity/MEMORY.md` → `identity/LEARNINGS.md` → the task.

**Before any code change:** `npm test && npm run eval` (both must exit 0 after your change).

## What not to do

- Never widen a trust envelope (more egress, a new capability, a host mount, a new secret slot) without a
  `trust-gate-v{N}.md` in the template folder and a person's review. Check `identity/MEMORY.md`
  §Trust envelope invariants before touching `trustEnvelope` fields.
- Never add SYS_ADMIN, NET_ADMIN, SYS_PTRACE, SYS_MODULE, DAC_READ_SEARCH or ALL to `capAdd`.
- Never boot a sandbox in CI or in a loop: each boot spends money on the caller's E2B account.
- Never print, log or commit `E2B_API_KEY` or any secret; read it from the environment by name.
- Never delete a template; a deprecated one moves to `templates/archive/`.

## Session Log Convention

Each session writes to `memory/session-YYYY-MM-DD.md`:
```markdown
# Session — YYYY-MM-DD

## Did
- ...

## Why
- ...

## Evidence
- eval: node eval/run.mjs → exit 0 ✓

## Next
- ...
```

## Template Schema Convention

Every `template.json` must:
- Validate against `eval/schema/template.schema.json`
- Have `id` matching its parent directory name
- Have `status: "active"` (otherwise excluded from validation, should move to `archive/`)
- Pass all trust invariants documented in `identity/MEMORY.md`
