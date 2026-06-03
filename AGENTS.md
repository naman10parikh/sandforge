# AGENTS.md — Sandforge Repository Schema

> Tells LLM agents how this repository is structured.
> Sandforge is a meta-harness — it is itself an agent-native repo.

## Domain

sandbox-infra

## Created

2026-06-03

## Directory Structure

```
identity/               — Agent identity (4 files: SOUL, BRAND, MEMORY, HEARTBEAT)
  SOUL.md               — Who Sandforge is, personality, hard boundaries
  BRAND.md              — Name rationale, tagline, look & feel
  MEMORY.md             — Bootstrap context: arch decisions, trust invariants, file map
  HEARTBEAT.md          — Cron-like health checks and anomaly protocols

templates/              — The owned artifacts (one subdir per template)
  {name}/               — Template directory (id must match directory name)
    template.json       — Machine-readable spec (validates against eval/schema/)
    README.md           — Human-readable guide (required)
    devcontainer.json   — Only for runtime=devcontainer templates
    trust-gate-v{N}.md  — Required when widening the trust envelope
  archive/              — Deprecated templates (never deleted)

eval/                   — Validator harness
  run.mjs               — The eval: run this; exits 0 = green, non-zero = failures
  schema/
    template.schema.json — JSON Schema Draft-07 for template.json files

memory/                 — Session logs (one file per day: session-YYYY-MM-DD.md)

CLAUDE.md               — Operating handbook (read first on every session)
AGENTS.md               — This file
TODOS.md                — Work queue (claim → work → close with evidence)
README.md               — Public-facing introduction
llms.txt                — LLM discovery index
```

## Agent Navigation

**Start here:** `CLAUDE.md` → `TODOS.md` → pick a `[ ]` item → work it.

**Before any code change:** `node eval/run.mjs` (must exit 0 after your change).

**Key constraint:** Trust envelope widening requires human DRI review. Check
`identity/MEMORY.md` §Trust envelope invariants before touching `trustEnvelope` fields.

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
