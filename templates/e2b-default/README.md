# e2b-default — E2B Firecracker Sandbox Template

**Version:** 1.0.0  
**Runtime:** E2B (Firecracker microVM, ~150ms cold start)  
**Trust level:** Minimal (no egress, no host mounts, ALL caps dropped)

## What this is

The default Energy sandbox for agent task execution. Provides an isolated Firecracker microVM
via E2B with the strictest trust envelope available. Use this template when:

- An agent needs to run untrusted or LLM-generated code
- A workflow needs a clean, reproducible execution environment
- You want predictable cost ($0.05/vCPU-hr) and ~150ms startup

## Trust envelope (defaults — callers can only narrow)

| Property | Default | Override path |
|---|---|---|
| Network egress | **Disabled** | Add domains to `allowedEgressDomains` + write trust-gate doc |
| Host mounts | **Disabled** | Not available in E2B cloud |
| CPU | 1 vCPU | Increase `compute.cpu` in your override |
| Memory | 512 MB | Increase `compute.memoryMb` in your override |
| Timeout | 300 s (5 min) | Increase `compute.timeoutSeconds` |
| Linux caps | ALL dropped | Add specific caps to `capAdd` + trust-gate doc |

## Quick start (E2B SDK)

```typescript
import { Sandbox } from "@e2b/sdk";

// Uses this template's defaults
const sandbox = await Sandbox.create("e2b-default", {
  timeoutMs: 300_000,
});

const result = await sandbox.process.startAndWait("node script.js");
await sandbox.close();
```

For tasks that need npm registry access:

```typescript
// Widened envelope: npm registry only — requires trust-gate-v1.md
const sandbox = await Sandbox.create("e2b-default-npm", {  // separate template
  timeoutMs: 300_000,
});
```

## Validation

```bash
# From repo root
node eval/run.ts
# Expect: ✓ e2b-default: schema valid | trust invariants pass
```

## Changelog

| Version | Date | Change |
|---|---|---|
| 1.0.0 | 2026-06-03 | Initial template — minimal trust envelope |
