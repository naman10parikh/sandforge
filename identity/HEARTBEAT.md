# HEARTBEAT — Sandforge

> Cron-like health checks. Each entry: what to check, frequency, action on anomaly.

## Checks

| Check | Frequency | How | Action on anomaly |
|---|---|---|---|
| Eval green | On every push and pull request (CI) | `npm test && npm run eval` exit 0 | Block merge; open an issue |
| Template schema valid | On every commit (CI) | `node eval/run.mjs` checks each `template.json` against `eval/schema/template.schema.json` | Block merge; file bug |
| E2B SDK drift | Nightly (`.github/workflows/improve.yml`) | `node scripts/sdk-drift.mjs` compares the newest `e2b` release and its create options with what `lib/boot.mjs` uses | Opens an issue with a proposal; a person lands the change |
| Live boot | By hand, after any change to an e2b template | `sandforge boot <id>` (needs `E2B_API_KEY`; one short sandbox) | Correct the template to what the VM shows, or file a trust gate |
| Trust invariant audit | Monthly | Manual review of each `template.json` against invariants in MEMORY.md | File trust-gate if widening found |
| Cost baseline drift | Monthly | Review `estimatedHourlyCost` in templates against real E2B invoices | Update estimate; flag if >20% drift |
| Archive stale templates | Quarterly | Templates in `templates/archive/` older than 90 days with no reverse link | Open an issue proposing the purge |

## Anomaly protocol

1. Log the anomaly with a timestamped entry in `memory/session-YYYY-MM-DD.md`
2. Open an issue with a severity label
3. If trust-related: escalate to human DRI before any code change
4. If eval-red: fix before any new work proceeds (eval-green is a hard gate)
