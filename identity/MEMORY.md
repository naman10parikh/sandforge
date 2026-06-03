# MEMORY — Sandforge

> Bootstrap context for every new Sandforge session. Keep under 2,000 tokens.
> Critical facts only. Update in-place; never create v2.

## Architecture decisions

| Decision | Rationale | Date |
|---|---|---|
| E2B as default sandbox runtime | ~150ms cold start, Firecracker microVM, $0.05/vCPU-hr, already specced in energy INFRA-STACK | 2026-06-03 |
| devcontainer as secondary template | Zero-cost local dev, VSCode/Codespaces compatible, wide adoption | 2026-06-03 |
| TypeScript for validator (`eval/run.ts`) | Matches energy fleet's default; strict mode; Zod for schema validation | 2026-06-03 |
| Eval-green gates commit | "It compiles" ≠ done; every template must pass validator before shipping | 2026-06-03 |
| Additive-only on templates | Deprecated templates archived to `templates/archive/`, never deleted | 2026-06-03 |

## Trust envelope invariants (NON-NEGOTIABLE)

1. **No network egress by default.** Templates start with `allowNetworkEgress: false`. Products that need outbound must explicitly set the scope (`npmRegistry`, `specificDomains`).
2. **No host mounts by default.** No volume mounts of host paths except explicitly declared read-only data directories.
3. **Resource caps always set.** Every template must declare `cpu`, `memoryMb`, `timeoutSeconds`, `estimatedHourlyCost`.
4. **No injected process env by default.** API keys / credentials are passed in via a defined `secretSlots` list, never as ambient env vars in the template definition.
5. **Versioned trust gates.** Any widening of the envelope above requires a `trust-gate-v{N}.md` doc reviewed by a human DRI.

## Active templates

| Template | Path | Status |
|---|---|---|
| e2b-default | `templates/e2b-default/` | active |
| devcontainer-default | `templates/devcontainer-default/` | active |

## Key file map

```
identity/        — SOUL, BRAND, MEMORY, HEARTBEAT
templates/       — owned artifacts (one subdir per template)
eval/            — validator harness (run.ts + schema + tests)
memory/          — session logs
CLAUDE.md        — operating handbook (this repo's CLAUDE.md)
AGENTS.md        — agent navigation schema
TODOS.md         — open + done items
README.md        — public-facing intro
llms.txt         — LLM discovery index
```

## Patterns to remember

- `eval/run.ts` is the canonical validator. `node eval/run.ts` exits 0 on green, non-zero on red.
- New templates go in `templates/{name}/`. They need: a spec JSON, a README, and a passing eval.
- Trust changes go through `trust-gate-v{N}.md` — don't widen the envelope without review.
- The energy INFRA-STACK.md (`energy/.claude/harnesses/INFRA-STACK.md`) is the upstream spec; Sandforge implements it.
