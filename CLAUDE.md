# Sandforge — Operating Handbook

> One repo = one sandbox/infra meta-harness. Sandforge owns the trust envelope.
> See `identity/SOUL.md` for full identity and `README.md` for structure overview.

## What this is

The sandbox/infra employee: forge vetted compute templates, maintain the trust standard,
validate everything before it ships. Callers across the Energy fleet use these templates
to run code safely. See `TODOS.md` for the current work queue.

## The eval gate (NON-NEGOTIABLE)

`node eval/run.mjs` must exit 0 before any commit. This is the hard gate.
If the eval is red, fix it before any other work proceeds.

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

## Commit convention

`feat(templates):` · `feat(eval):` · `feat(identity):` · `docs:` · `fix:` ·
`chore:` — so Git snap-back works per surface area.

Trailer on every commit:
```
Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
```

## Adding a new template

1. `mkdir templates/{name}`
2. Copy `templates/e2b-default/template.json` as a starting point
3. Set `id`, `runtime`, `description`, and trust envelope appropriately
4. Add a `README.md` (copy from an existing template and adapt)
5. If `runtime=devcontainer`, add a `devcontainer.json`
6. Run `node eval/run.mjs` — must be green
7. Commit: `feat(templates): add {name} template`

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

## Reuse (don't rebuild)

- E2B SDK: `@e2b/sdk` (energy already has this)
- devcontainer spec: `https://containers.dev/implementors/json_reference/`
- Trust patterns: see `identity/MEMORY.md` §Trust envelope invariants
- Energy fleet rules: `energy/.claude/rules/` (especially `new-service-checklist.md`)
