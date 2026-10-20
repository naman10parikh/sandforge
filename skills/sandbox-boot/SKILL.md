---
name: sandbox-boot
description: Boot an e2b sandbox template in a live E2B Firecracker microVM and check that its trust envelope holds (tools, egress, secrets). Use after adding or changing an e2b template, before relying on one, or when asked for its real cold start.
---

# Skill: sandbox-boot

## Trigger

Use this skill when asked to:
- "prove the template works" / "boot e2b-default"
- "does the egress block actually hold?"
- "what is the cold start?"
- after any change to an `e2b` template (a new tool, a new egress rule, a version bump)

Do not use it in CI on every push: each boot is one short sandbox on the caller's E2B account.

## Steps

1. **Check the template is green and see the plan.** The plan costs nothing.
   ```bash
   node bin/sandforge.mjs validate
   node bin/sandforge.mjs plan e2b-default
   ```
   The plan prints the exact `Sandbox.create` options: the E2B template name (`baseImage.source`, E2B's
   default is `base`), `timeoutMs` from `compute.timeoutSeconds`, and either `allowInternetAccess: false`
   (no egress) or `network.allowOut` plus `denyOut: ["0.0.0.0/0"]` (an allowlist). Then the probes.

2. **Make sure the key and the SDK are there.** Never print the key.
   ```bash
   test -n "$E2B_API_KEY" && echo "key set"
   npm install            # installs the optional e2b package
   ```

3. **Boot once.**
   ```bash
   node bin/sandforge.mjs boot e2b-default            # or --json for the full result
   ```
   It creates the VM, runs each probe, prints the cold start, and kills the VM in a `finally`, so a
   failed probe never leaves a sandbox running. The result goes to `observability/run-log.jsonl`.

4. **Read the probes.**
   - `✓ tool <name> <version>`: the tool is installed at the declared version.
   - `✓ egress closed`: a request to example.com failed, as the envelope says.
   - `✓ no undeclared secrets`: no variable named like a key, token or password beyond `secretSlots`.
   - `·` lines are notes (who runs the code, the vCPUs and memory seen inside). They never fail a boot.

5. **Act on a mismatch.**
   - A tool or compute value differs → change the template to what the VM shows, bump its `version`,
     add a changelog row in its README, and run `node eval/run.mjs`.
   - Egress open when declared closed, or an undeclared secret → stop. That is a trust failure: open a
     `trust-gate-v{N}.md` in the template folder and ask the trust-auditor sub-agent for a review.
   - Record anything learned in `identity/LEARNINGS.md`.

## Output format

```
Cold start 321 ms (sandbox <id>, killed after the probes)
  ✓ tool node >=18: v20.9.0
  ✓ egress closed (example.com): blocked (exit 28)
  ✓ no undeclared secrets in the environment: none
  · who runs the code: uid=1000(user) ...
The trust envelope holds.          (exit 0; exit 1 when any probe fails)
```
