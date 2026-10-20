# Sandforge Observability

Run-log for all template validations, dispatches, and scaffolds.

## Files

| File | Purpose |
|---|---|
| `run-log.jsonl` | Append-only log; one JSON record per line (newline-delimited JSON) |
| `append-run.mjs` | CLI appender — zero deps, writes one record to `run-log.jsonl` |

## Log format

Each line in `run-log.jsonl` is a JSON object:

```json
{
  "ts": "2026-06-03T12:00:00.000Z",
  "event": "validate",
  "command": "node eval/run.mjs",
  "result": "pass",
  "detail": "all 2 templates passed"
}
```

| Field | Values | Description |
|---|---|---|
| `ts` | ISO 8601 | When the event occurred |
| `event` | `validate` / `dispatch` / `plan` / `boot` / `mcp:<tool>` / `scaffold` / `trust-audit` / `init` | What happened |
| `command` | string | CLI command or skill invoked |
| `result` | `pass` / `fail` | Outcome |
| `detail` | string (≤200 chars) | Human-readable summary |

## Usage

```bash
# After running the validator:
node observability/append-run.mjs validate pass "all 2 templates passed"
node observability/append-run.mjs validate fail "1 failure in e2b-default: missing capAdd"

# After running dispatch:
node observability/append-run.mjs dispatch pass "picked e2b-default for agent eval task"

# After scaffolding a new template:
node observability/append-run.mjs scaffold pass "added microsandbox-default template"
```

## Invariants

- `run-log.jsonl` is append-only. Never delete lines.
- Every `node eval/run.mjs` invocation should be logged here.
- Log is human-readable with `cat observability/run-log.jsonl | jq .`

## Integration

Since CP158 the log writes itself: `sandforge validate`, `pick`, `plan` and `boot` and every MCP tool call append a record through `appendRun()` in `append-run.mjs` (a boot also records its cold start). Set `SANDFORGE_LOG=/path/file.jsonl` to write elsewhere; the tests do, so they never touch this file. The `skills/template-validate/SKILL.md` skill covers the manual command for a bare `node eval/run.mjs`.
