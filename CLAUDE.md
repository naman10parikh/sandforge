@AGENTS.md

# Sandforge — Operating Handbook

> One repo = one sandbox/infra meta-harness. Sandforge owns the trust envelope.
> See `identity/SOUL.md` for full identity and `AGENTS.md` for the tools and the structure.

## What this is

The sandbox/infra employee: forge vetted compute templates, maintain the trust standard,
validate everything before it ships, and prove e2b templates in a live VM. Callers across the
Energy fleet use these templates to run code safely. See `TODOS.md` for the current work queue.

## The eval gate (NON-NEGOTIABLE)

`npm test && npm run eval` must exit 0 before any commit. This is the hard gate.
If it is red, fix it before any other work proceeds. In Claude Code the PreToolUse hook in
`.claude/settings.json` (`hooks/template-guard.mjs`) blocks a `git commit` while any template fails.

## Claude Code specifics

- `.mcp.json` loads the published server through npx (safe for anyone who installs the plugin).
  `claude --mcp-config .mcp.dev.json` loads this checkout's own server instead.
- `E2B_API_KEY` may already be in your shell. `npm test` never boots a sandbox; a live boot needs
  `sandforge boot <id>` or `SANDFORGE_LIVE_E2B=1 npm test`. Boot once, by hand, only when a template changed.
- Never set a model in a sub-agent or a setting; sub-agents run on the session's model.

## Operating principles

1. **Additive only.** Never delete templates or schema fields. Deprecated templates move to
   `templates/archive/`. Old schema versions are versioned, not overwritten.
2. **Surgical changes.** Touch only what the TODO requires. Match existing style.
3. **Trust escalation.** Any change that widens the trust envelope (more egress, new caps,
   secret slots on a template that had none) requires:
   - A `trust-gate-v{N}.md` doc in `templates/{name}/`
   - Human DRI review before merging
   Don't widen without review. Ever.
4. **Claim → work → close.** Every code change traces to a `[ ]` item in `TODOS.md`.
   Claim it, work it, close it with evidence (eval output). Then claim the next.
5. **Declare what the VM shows.** Tool versions and compute in an e2b template come from a boot,
   not from memory. Lessons go to `identity/LEARNINGS.md`.

## Commit convention

`feat(templates):` · `feat(eval):` · `feat(identity):` · `docs:` · `fix:` ·
`chore:` — so Git snap-back works per surface area. Keep the Co-Authored-By trailer your tool adds.

## Adding a new template

1. `mkdir templates/{name}`
2. Copy `templates/e2b-default/template.json` as a starting point
3. Set `id`, `runtime`, `description`, and trust envelope appropriately
4. Add a `README.md` (copy from an existing template and adapt)
5. If `runtime=devcontainer`, add a `devcontainer.json`
6. Run `node eval/run.mjs` — must be green
7. If `runtime=e2b`, run `node bin/sandforge.mjs plan {name}`, then boot it once (the `sandbox-boot` skill)
8. Commit: `feat(templates): add {name} template`

## Deprecating a template

1. Set `status: "deprecated"` in `template.json`
2. Move the entire directory to `templates/archive/{name}/`
3. Add a deprecation note to `README.md` with date + replacement
4. Run `node eval/run.mjs` — archived templates are excluded from validation
5. Document in `TODOS.md`

## Upstream sync

When `energy/.claude/harnesses/INFRA-STACK.md` changes:
1. Read the diff carefully
2. Update affected templates (additive only)
3. Update `TODOS.md` with the sync date
4. Run `node eval/run.mjs`

The nightly `.github/workflows/improve.yml` watches the other upstream, the E2B SDK
(`scripts/sdk-drift.mjs`), and opens an issue when it moves.

## Reuse (don't rebuild)

- E2B SDK: the `e2b` package (an optional dependency, loaded only by `lib/boot.mjs`)
- devcontainer spec: `https://containers.dev/implementors/json_reference/`
- Trust patterns: see `identity/MEMORY.md` §Trust envelope invariants
- Energy fleet rules: `energy/.claude/rules/` (especially `new-service-checklist.md`)
