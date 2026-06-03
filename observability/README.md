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
| `event` | `validate` / `dispatch` / `scaffold` / `trust-audit` / `init` | What happened |
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

The `skills/template-validate.md` skill instructs callers to append to this log after every eval run. The MCP server's `sandforge_validate` tool also returns the pass/fail result that can be forwarded here.
