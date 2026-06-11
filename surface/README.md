# Woven Boulder — backed surface (server + SPA)

The backed-surface package for the Boulder civics site, built on
`@openparachute/surface-server` (the R4 kit, from npm — `^0.1.1`; the
original vendored-tarball pins were retired once the kit published).
**Additive to this repo**: the existing static-gen site (`../build.js`)
is untouched and keeps deploying independently.

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

## Releasing — the installable tarball

[`.github/workflows/release-surface.yml`](../.github/workflows/release-surface.yml)
runs on every **published GitHub release** (and `workflow_dispatch` for
testing, which uploads a run artifact instead): it runs the backend gates,
builds the web SPA, bundles the server entry into a **self-contained**
`server/index.js` (`bun build --target=bun` — the installer copies only
`dist/` + the entry's first path segment, so no `node_modules` ride along),
and attaches `woven-boulder-surface-<version>.tgz` to the release.

Tarball layout (derived from surface-host's URL-source installer —
`url-fetch.ts` + `admin-routes.ts` in parachute-surface):

```
package/              ← single top-level dir
  meta.json           ← server.entry rewritten to server/index.js,
                        version stamped from the release tag
  dist/index.html …   ← the built SPA (required by the installer)
  server/index.js     ← the bundled backend (plain files only — the
                        installer skips symlinks)
```

To cut a release: `gh release create v<X.Y.Z>` (or the GitHub UI) — the
workflow does the rest. The workflow doubles as the **template** for other
backed surfaces; the surface-specific bits live in its `env` block.

## Add Woven Boulder to your parachute

1. Copy the `woven-boulder-surface-<version>.tgz` **asset URL** from the
   latest [GitHub release](https://github.com/Unforced-Dev/WovenBoulder/releases).
2. In your Surface admin (`/surface/admin/`): **Add surface → URL**, paste
   the asset URL. The installer validates the bundle and the server block
   (the trust act: this mounts backend code in the surface daemon).
3. Give the surface its vault credential: in the **hub admin → Connections**,
   approve a `surface` module **vault read** credential for the vault that
   holds the Boulder civic notes (`vault_default` is `boulder`). The
   backend's projections only ever expose notes passing the publicness gate
   (`Boulder Civics/` + content-type allowlist), so a vault-wide read
   credential stays safe — but scope it down if your vault holds more.
4. The site is live at `/surface/woven-boulder/`; the public MCP endpoint is
   `POST /surface/woven-boulder/api/mcp`.
