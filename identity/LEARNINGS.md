# LEARNINGS — Sandforge

> Corrections become rules here. Append only; a superseded rule is marked, never deleted.
> Search everything with `sandforge recall "<query>"`.

## 2026-10-19 — the first live boot and the standard pass

1. **A hook that reads an environment variable Claude Code never sets does nothing.** The June commit gate
   piped `$CLAUDE_TOOL_INPUT` into grep and ended in `|| true`, so it never ran the validator and could never
   block. Rule: a hook reads the event as JSON on stdin and blocks with exit 2 (`hooks/template-guard.mjs`);
   every hook is run once by a test.
2. **Two copies of one rule drift.** The CLI and the MCP server each carried dispatch rules, and they
   disagreed ("debug my app interactively" went to devcontainer in one, e2b in the other). Rule: one
   implementation (`dispatch/pick-runtime.mjs`), imported everywhere.
3. **Substring matching misroutes.** "social media scraper daemon" went to devcontainer because "ci" sits
   inside "social". Rule: match whole words, let the rule with the most matches win, and keep a golden case
   per runtime (`eval/golden.json`).
4. **No E2B template is named `e2b-default`.** E2B's default template is `base`, so the template could not
   have booted as written. Rule: an e2b template is proven by `sandforge boot`, not by reading it.
5. **Declare what the VM shows.** The first boot (321 ms to ready) found git 2.39.5 where the template said
   >=2.40, and 2 vCPU where it said 1. Both values were corrected in e2b-default 1.1.0. Rule: copy versions
   and compute from a boot.
6. **The VM is the boundary, not the capability list.** Inside E2B the code runs as `user` (uid 1000) with
   passwordless sudo, so `capDrop: ["ALL"]` is not enforced inside the VM. The trust fields stay as they are
   until a person decides whether e2b templates should declare capabilities at all.
7. **A contradiction waits for review.** devcontainer-default says `allowHostMounts: false` but mounts the
   workspace read-write through `readOnlyMounts` (`readOnly: false`). Trust fields change only through a
   trust gate, so this is recorded, not fixed.
8. **A schema rule the validator ignores is no rule.** `compute`, `trustEnvelope` and each tool entry say
   `additionalProperties: false`, but the validator never checked it, so a stray key such as
   `"allowHostMount": true` beside the real one passed and misled readers. Rule: the validator enforces it.
9. **A key in the shell turns a test into a bill.** The development shell exports `E2B_API_KEY`, so a live
   test gated only on the key would boot a sandbox on every `npm test`. Rule: a live boot needs an explicit
   opt-in (`SANDFORGE_LIVE_E2B=1`); CI never boots.
