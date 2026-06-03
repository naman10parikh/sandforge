# Sandforge

> The sandbox/infra employee of the Energy fleet.
> Owns the trust envelope — vetted compute templates + the validator that keeps them honest.

**Provisional name — flagged for chairman confirm/rename** (see `TODOS.md` §P1).

## What this is

Sandforge is the meta-harness that owns the "sandbox/infra" layer of the [Energy platform](https://github.com/naman10parikh/energy).
It provides:

1. **Vetted sandbox templates** — E2B Firecracker + devcontainer, each with an explicit trust envelope
2. **A template validator** (`eval/run.mjs`) — asserts every template is schema-valid, trust-invariant-passing, and structurally complete
3. **A trust standard** — codified invariants that every Energy sandbox must satisfy

When Darwin runs an eval, when Helios executes a trade script, when any Energy worker needs a
sandbox — they use the artifacts Sandforge maintains.

## Quick start

```bash
# Validate all templates (should exit 0)
node eval/run.mjs

# Use e2b-default in your code
# Copy templates/e2b-default/template.json into your project,
# then instantiate via E2B SDK — see templates/e2b-default/README.md
```

## Repository structure

```
identity/               — Agent identity (SOUL, BRAND, MEMORY, HEARTBEAT)
templates/              — Owned sandbox artifacts
  e2b-default/          — E2B Firecracker microVM (minimal trust, ~150ms cold start)
  devcontainer-default/ — devcontainer (local dev + CI, VSCode/Codespaces)
  archive/              — Deprecated templates (never deleted — additive only)
eval/                   — Validator harness
  run.mjs               — The eval: schema + trust invariants + runtime checks
  schema/               — template.schema.json (JSON Schema Draft-07)
memory/                 — Session logs
CLAUDE.md               — Operating handbook (read this first)
AGENTS.md               — Agent navigation schema
TODOS.md                — Open + done items
llms.txt                — LLM discovery index
```

## Trust invariants (enforced by eval)

Every template must:

- Declare `compute.timeoutSeconds` and `compute.estimatedHourlyCost`
- Set `trustEnvelope.allowNetworkEgress` explicitly
- If `allowNetworkEgress=false`, have an empty `allowedEgressDomains`
- If `allowNetworkEgress=true`, explain why in `trustEnvelope.notes`
- Declare `trustEnvelope.capAdd` (even if empty)
- Have status `active` (deprecated → `archive/`)

## Upstream spec

The canonical infra decision lives in the Energy repo:
`energy/.claude/harnesses/INFRA-STACK.md`

Sandforge implements that spec — when the spec changes, Sandforge updates its templates.

## Contributing

1. Read `CLAUDE.md` + `TODOS.md`
2. Claim a `[ ]` item in `TODOS.md`
3. Make your change (additive only — no deletions)
4. Run `node eval/run.mjs` — must exit 0 before committing
5. Conventional commit: `feat(templates):` / `feat(eval):` / `docs:` / `fix:`
