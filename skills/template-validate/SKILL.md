---
name: template-validate
description: Check sandbox templates against sandforge's schema and trust rules. Use before any commit that touches templates/ or eval/, when asked whether the templates are green, or to check a folder of your own templates.
---

# Skill: template-validate

## Trigger

Use this skill when asked to:
- "validate templates"
- "run the eval"
- "check if templates are green"
- "is the eval passing?"
- before any commit that touches `templates/` or `eval/`
- to check templates you wrote in another project (`sandforge validate <their templates folder>`)

## Steps

1. **Run the validator**
   ```bash
   node eval/run.mjs                      # this repository's templates
   npx -y -p github:naman10parikh/sandforge sandforge validate ./templates   # any folder of templates
   ```
   Expected: exit 0, every template shows `✓` on all checks. `sandforge validate` also writes the
   result to the run log; add `--json` for the checks as data.

2. **Interpret output**
   - `✓ All N template(s) passed validation.` → green, safe to commit.
   - `✗ M failure(s) across N template(s).` → red, fix before proceeding.
     Common fixes:
     - Missing required field → add to `template.json`
     - `unknown field` → a typo in `compute`, `trustEnvelope` or a tool entry (those objects allow no extra keys)
     - `id` mismatch → ensure template dir name == `template.json` `id`
     - Trust invariant violation → see `identity/MEMORY.md §Trust envelope invariants`
     - `capAdd grants dangerous capabilities` → remove SYS_ADMIN, NET_ADMIN, SYS_PTRACE, SYS_MODULE,
       DAC_READ_SEARCH or ALL; no template may add them
     - `status != active` → move to `templates/archive/` or set status correctly

3. **Run the golden cases** when you changed the validator itself
   ```bash
   npm run eval     # the validator over templates/, then eval/golden.mjs: known-bad templates must fail for the stated reason
   ```

4. **Append result to observability log** (only when you ran `node eval/run.mjs` by hand)
   ```bash
   node observability/append-run.mjs validate pass "all templates passed"
   ```

5. **Fix and re-run** until exit 0. Do not commit with a red eval. The repository's PreToolUse hook
   (`hooks/template-guard.mjs`) blocks a `git commit` while any template is red.

## Output format

```
node eval/run.mjs
→ exit 0   ✓ green — safe to commit
→ exit 1   ✗ red  — list failures, fix, re-run
```

## Model tier

Execution: any (this is a CLI invocation, not a reasoning task).
