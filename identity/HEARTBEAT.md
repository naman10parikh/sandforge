# HEARTBEAT — Sandforge

> Cron-like health checks. Each entry: what to check, frequency, action on anomaly.

## Checks

| Check | Frequency | How | Action on anomaly |
|---|---|---|---|
| Eval green | On every commit (CI) | `node eval/run.ts` exits 0 | Block merge; log to TODOS.md |
| Template schema valid | On every commit (CI) | Zod parse of each `template.json` | Block merge; file bug |
| E2B SDK version | Monthly | `npm outdated` in `eval/` | Update + re-run eval |
| Trust invariant audit | Monthly | Manual review of each `template.json` against invariants in MEMORY.md | File trust-gate if widening found |
| Cost baseline drift | Monthly | Review `estimatedHourlyCost` in templates against real E2B invoices | Update estimate; flag if >20% drift |
| Archive stale templates | Quarterly | Templates in `templates/archive/` older than 90 days with no reverse link | Document in TODOS.md, propose purge |

## Anomaly protocol

1. Log the anomaly with a timestamped entry in `memory/session-YYYY-MM-DD.md`
2. Create a `[ ]` item in `TODOS.md` with severity tag
3. If trust-related: escalate to human DRI before any code change
4. If eval-red: fix before any new work proceeds (eval-green is a hard gate)
