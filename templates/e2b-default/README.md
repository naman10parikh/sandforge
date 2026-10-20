# e2b-default — E2B Firecracker Sandbox Template

**Version:** 1.1.0  
**Runtime:** E2B (Firecracker microVM; the live boot on 2026-10-19 was ready in 321 ms)  
**Trust level:** Minimal (no egress, no host mounts, ALL caps dropped)

## What this is

The default Energy sandbox for agent task execution. Provides an isolated Firecracker microVM
via E2B with the strictest trust envelope available. Use this template when:

- An agent needs to run untrusted or LLM-generated code
- A workflow needs a clean, reproducible execution environment
- You want predictable cost ($0.05/vCPU-hr) and a sub-second start

## Trust envelope (defaults — callers can only narrow)

| Property | Default | Override path |
|---|---|---|
| Network egress | **Disabled** | Add domains to `allowedEgressDomains` + write trust-gate doc |
| Host mounts | **Disabled** | Not available in E2B cloud |
| CPU | 2 vCPU (what E2B's `base` template gives) | Build a custom E2B template |
| Memory | 512 MB | Increase `compute.memoryMb` in your override |
| Timeout | 300 s (5 min) | Increase `compute.timeoutSeconds` |
| Linux caps | ALL dropped | Add specific caps to `capAdd` + trust-gate doc |

## Quick start (E2B SDK)

`sandforge plan e2b-default` prints the exact options sandforge passes. With the `e2b` package:

```typescript
import { Sandbox } from "e2b";

// This template's envelope: E2B's base template, 5-minute timeout, no internet
const sandbox = await Sandbox.create({
  template: "base",
  timeoutMs: 300_000,
  allowInternetAccess: false,
});
try {
  const result = await sandbox.commands.run("node --version");
  console.log(result.stdout);
} finally {
  await sandbox.kill();
}
```

A template that allows a few hosts maps to `network: { allowOut: [...hosts], denyOut: ["0.0.0.0/0"] }`
instead. Widening egress needs its own template and a `trust-gate-v{N}.md` (see TODOS S2.1).

## Prove it live

```bash
export E2B_API_KEY=...        # your key; sandforge reads it from the environment only
npx -y -p github:naman10parikh/sandforge -p e2b sandforge boot e2b-default
```

The boot creates one microVM with the options above, checks each declared tool and version, confirms
that a request to an outside host fails, lists the environment's variable names to confirm no undeclared
secret is present, then kills the VM. It costs one short sandbox on your E2B account.

What the boot on 2026-10-19 showed (one run, `observability/run-log.jsonl`):

| Probe | Result |
|---|---|
| node >=18 | v20.9.0 |
| python3 >=3.11 (optional) | 3.11.6 |
| git | 2.39.5; the template said >=2.40, so 1.1.0 declares >=2.39 |
| Egress to example.com | blocked (curl timed out) |
| Undeclared secrets | none |
| Who runs the code | uid 1000 `user`, in the sudo group, passwordless sudo |
| Compute inside | 2 vCPU, 473 MiB usable; the template said 1 vCPU, so 1.1.0 declares 2 |

The default user can become root inside the VM, so `capDrop: ["ALL"]` is a promise the Firecracker VM
boundary keeps, not one enforced inside it. The trust fields are unchanged until a person reviews them.

## Validation

```bash
# From repo root
node eval/run.mjs
# Expect: ✓ e2b-default: schema valid | trust invariants pass
```

## Changelog

| Version | Date | Change |
|---|---|---|
| 1.1.0 | 2026-10-19 | `baseImage.source` is now `base`, E2B's real default template (no E2B template is named `e2b-default`). git is declared >=2.39 and cpu 2, the values the live boot found. The quick start uses the current SDK (`e2b`, `commands.run`, `kill`). |
| 1.0.0 | 2026-06-03 | Initial template — minimal trust envelope |
