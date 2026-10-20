---
name: template-scaffold
description: Add a new sandbox template (e2b, devcontainer, microsandbox, daytona or fly-machines) that starts from the strictest trust envelope and passes the validator. Use when asked to add, scaffold or create a template for a runtime.
---

# Skill: template-scaffold

## Trigger

Use this skill when asked to:
- "add a new sandbox template"
- "scaffold a template for X runtime"
- "create a microsandbox template"
- "add a fly-machines template"

## Steps

1. **Identify the runtime**
   Valid runtimes (from `eval/schema/template.schema.json`):
   `e2b` | `devcontainer` | `microsandbox` | `daytona` | `fly-machines`

   If runtime is unclear, run the dispatch selector first:
   ```bash
   node dispatch/pick-runtime.mjs "<describe the use-case>"
   ```

2. **Create the directory**
   ```bash
   mkdir templates/{id}
   ```
   `id` must be kebab-case and match the directory name exactly.

3. **Copy the closest base template**
   ```bash
   cp templates/e2b-default/template.json templates/{id}/template.json
   ```
   Then edit:
   - `id` → match directory name
   - `runtime` → correct runtime
   - `description` → 20-300 chars describing this template's purpose
   - `compute.*` → appropriate resource limits for this use-case
   - `trustEnvelope.*` → start from strictest defaults (see invariants below)
   - `preinstalledTools` → what this runtime needs
   - `usagePattern` → when callers should use this template

4. **Trust envelope defaults (NON-NEGOTIABLE starting point)**
   ```json
   "trustEnvelope": {
     "allowNetworkEgress": false,
     "allowedEgressDomains": [],
     "allowHostMounts": false,
     "readOnlyMounts": [],
     "secretSlots": [],
     "capDrop": ["ALL"],
     "capAdd": [],
     "notes": "Strictest default."
   }
   ```
   Widening any of these requires a `trust-gate-v1.md` file in the template dir
   and human DRI review. Do NOT widen without the gate doc.

5. **Add a README.md**
   ```bash
   cp templates/e2b-default/README.md templates/{id}/README.md
   # Then edit to describe the new template
   ```

6. **For devcontainer runtime only**: add `devcontainer.json`
   ```bash
   cp templates/devcontainer-default/devcontainer.json templates/{id}/devcontainer.json
   # Edit image, features, and mounts as needed
   ```

7. **Run the eval**
   ```bash
   node eval/run.mjs
   ```
   Fix any failures before proceeding.

   For an `e2b` template, also check the plan and prove it once in a live VM (see the `sandbox-boot` skill):
   ```bash
   node bin/sandforge.mjs plan {id}     # the Sandbox.create options and probes; creates nothing
   node bin/sandforge.mjs boot {id}     # needs E2B_API_KEY; one short sandbox
   ```
   Declare only what the boot shows (tool versions, vCPU count). If the VM disagrees, fix the template.

8. **Commit**
   ```
   feat(templates): add {id} template
   ```

## Output format

```
templates/{id}/
  template.json   ← validated by eval/run.mjs
  README.md       ← human guide
  [devcontainer.json]  ← only if runtime=devcontainer
  [trust-gate-v1.md]   ← only if trust envelope is widened
```

## Model tier

Reasoning (choose trust settings): sonnet or higher.
File writes: any.
