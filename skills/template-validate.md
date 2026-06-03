# Skill: template-validate

## Trigger

Use this skill when asked to:
- "validate templates"
- "run the eval"
- "check if templates are green"
- "is the eval passing?"
- before any commit that touches `templates/` or `eval/`

## Steps

1. **Run the validator**
   ```bash
   node eval/run.mjs
   ```
   Expected: exit 0, every template shows `✓` on all checks.

2. **Interpret output**
   - `✓ All N template(s) passed validation.` → green, safe to commit.
   - `✗ M failure(s) across N template(s).` → red, fix before proceeding.
     Common fixes:
     - Missing required field → add to `template.json`
     - `id` mismatch → ensure template dir name == `template.json` `id`
     - Trust invariant violation → see `identity/MEMORY.md §Trust envelope invariants`
     - `status != active` → move to `templates/archive/` or set status correctly

3. **Append result to observability log**
   ```bash
   node observability/append-run.mjs validate "exit 0" "all templates passed"
   ```
   (Or record manually if the append script is unavailable.)

4. **Fix and re-run** until exit 0. Do not commit with a red eval.

## Output format

```
node eval/run.mjs
→ exit 0   ✓ green — safe to commit
→ exit 1   ✗ red  — list failures, fix, re-run
```

## Model tier

Execution: any (this is a CLI invocation, not a reasoning task).
