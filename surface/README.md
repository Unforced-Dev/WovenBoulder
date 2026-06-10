# Woven Boulder — backed surface (server)

The backed-surface package for the Boulder civics site, built on
`@openparachute/surface-server` (the R4 kit; vendored — see
[vendor/README.md](./vendor/README.md)). **Additive to this repo**: the
existing static-gen site (`../build.js`) is untouched and keeps deploying
independently.

- `meta.json` — the surface-host P1 contract (the host reads it at the
  package ROOT). Declares `server.entry: server/index.ts`,
  `audience: "public"`, `vault_default: "boulder"`, no websocket capability.
- `server/index.ts` — `createBackend(ctx)` default export.
- `server/gate.ts` — **the one choke point**: every vault read the kit's
  projection pipeline or router performs goes through the gated vault
  wrapper (publicness gate → `$` query extensions → email strip).
- `server/projections.ts` — the nine projections (REST + MCP from one
  definition each).

## REST endpoints (as mounted under `/surface/woven-boulder`)

| Projection | Endpoint | Params |
|---|---|---|
| list-bodies | `GET /surface/woven-boulder/api/list-bodies` | — |
| recent-meetings | `GET …/api/recent-meetings` | `body?` (21-slug enum) · `type?` (6-type enum) · `from?`/`to?` (YYYY-MM-DD) · `limit?` (1–50, default 20) |
| meeting-brief | `GET …/api/meeting-brief` | `path` (vault path) — 404 when missing/non-public |
| meeting-transcript | `GET …/api/meeting-transcript` | `path` · `page?` (1-based, ~10KB pages) |
| issues | `GET …/api/issues` | `status?` (7-status enum) · `domain?` · `lead_body?` · `limit?` |
| issue-detail | `GET …/api/issue-detail` | `path` |
| domains | `GET …/api/domains` | — |
| search | `GET …/api/search` | `q` · `scope?` (meetings\|issues\|all) · `body?` · `limit?` |
| topic-feed | `GET …/api/topic-feed` | `topic` (topic-tag enum) · `limit?` |

All are `access: "public"`. Responses are the kit envelope
`{ projection, count, items }`; detail projections 404 (`{"error":"not_found"}`)
for missing and non-public notes identically. The MCP face is
`POST …/api/mcp` (stateless Streamable HTTP; same nine tools, same gate).
Operator-only: `POST …/api/admin/refresh` (hub-JWT Bearer).

## Dev

```bash
cd surface
bun install
bun test server/      # fixture-only — never the live vault
bun run typecheck
LIVE_SMOKE=1 bun scripts/live-smoke.ts   # optional, read-only, local hub
```
