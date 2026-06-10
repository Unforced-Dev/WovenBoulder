# Woven Boulder — backed surface (server + SPA)

The backed-surface package for the Boulder civics site, built on
`@openparachute/surface-server` (the R4 kit; vendored — see
[vendor/README.md](./vendor/README.md)). **Additive to this repo**: the
existing static-gen site (`../build.js`) is untouched and keeps deploying
independently.

- `meta.json` — the surface-host P1 contract (the host reads it at the
  package ROOT — verified against the pinned host's `ui-registry.ts` +
  `meta-schema.ts`, which also require a `dist/index.html` to register the
  surface). Declares `server.entry: server/index.ts`,
  `audience: "public"`, `vault_default: "boulder"`, no websocket capability.
- `server/index.ts` — `createBackend(ctx)` default export.
- `server/gate.ts` — **the one choke point**: every vault read the kit's
  projection pipeline or router performs goes through the gated vault
  wrapper (publicness gate → `$` query extensions → email strip).
- `server/projections.ts` — the nine projections (REST + MCP from one
  definition each).
- `web/` — the public frontend (Vite + React SPA). It consumes ONLY the
  projection REST endpoints below via plain anonymous fetch — no vault
  API, no tokens. Built output lands in `dist/` (committed — the bundle
  surface-host serves at the mount root, with SPA fallback for deep
  links like `/meetings/city-council/2026-04-23`).

## REST endpoints (as mounted under `/surface/woven-boulder`)

| Projection | Endpoint | Params |
|---|---|---|
| list-bodies | `GET /surface/woven-boulder/api/list-bodies` | — |
| recent-meetings | `GET …/api/recent-meetings` | `body?` (21-slug enum) · `type?` (6-type enum — rides the INDEXED `meta[meeting_type][eq]` query; card values dual-read `meeting_type` → kebab fallback) · `from?`/`to?` (YYYY-MM-DD) · `limit?` (1–50, default 20) |
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

## Frontend (web/)

Pages: Home (latest meetings, in-progress issues, domain tiles, search) ·
`/bodies` + `/bodies/:slug` (profile, year-grouped archive cursor-paginated
via `from`/`to`, issues where lead) · `/meetings/:body/:date` (brief FIRST
with Decisions & Votes hoisted; transcript lazy-loaded page-by-page — never
eager; YouTube click-to-load embed; related issues) · `/issues` (+ detail) ·
`/domains` (+ detail) · `/topics/:tag` · `/search` · `/about` (data sources,
AI-transparency note, the public MCP endpoint).

Meetings without an AI summary (57% of the record) get an explicit "no
summary yet" treatment over the short fallback excerpt — never silently
presented as a summary. Detail routes carry the vault `path` in router
state for internal navigation and re-resolve from the projections on deep
links.

## Dev

```bash
cd surface
bun install
bun test server/      # backend suite; fixture-only — never the live vault
bun run typecheck
LIVE_SMOKE=1 bun scripts/live-smoke.ts   # optional, read-only, local hub
```

Frontend, against **fixtures** (no vault needed):

```bash
bun scripts/dev-backend.ts        # real backend over constructed fixtures, :8787
cd web && bun install
bun run dev                       # Vite proxies /surface/woven-boulder/api → :8787
# open http://localhost:5173/surface/woven-boulder/
```

Frontend, against the **live vault** (env-gated, read-only — mints an
ephemeral `vault:boulder:read` token via the parachute CLI):

```bash
LIVE_DEV=1 bun scripts/dev-backend.ts
cd web && bun run dev
```

Frontend gates + build:

```bash
cd web
bun run test         # vitest: typed client + meeting-page split rendering
bun run typecheck
bun run build        # emits ../dist (commit it — the served bundle)
```

`bunx vite preview` serves the built `dist/` with the same API proxy for a
production-shaped smoke.
