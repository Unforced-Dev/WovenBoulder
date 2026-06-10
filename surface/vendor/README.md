# Vendored kit tarballs (pinned)

`@openparachute/surface-server` is **unpublished** as of 2026-06-10, and the
npm-published `@openparachute/surface@0.3.0` / `@openparachute/surface-client@0.2.0`
tarballs **predate** the R2/R3a source those versions carry in-repo (npm
`surface@0.3.0` was cut before the R3a host-contract files
`backend-types.ts`/`host-context.ts` landed; npm `surface-client@0.2.0` was
published 2026-06-03, before the R2 typed-query/`subscribe` graduation the kit
type-imports). So all three are vendored here as tarballs for a reproducible
build.

**Pinned from:** `parachute-surface` branch `main`, commit **`ba10f47`**
(`feat(surface-server): the kit — createSurfaceAuth, SurfaceAuthz +
conformance suite, projections→REST+MCP (R4) (#93)`).

Produced with:

```bash
git clone -b main file:///Users/parachute/ParachuteComputer/parachute-surface /tmp/ps-pin-r5
cd /tmp/ps-pin-r5 && bun install
cd packages/surface-client && bun run build       # dist/ needed by its files[]
cd ../surface-server && bun pm pack --destination .
cd ../surface-host   && bun pm pack --destination .
cd ../surface-client && bun pm pack --destination .
```

When `@openparachute/surface-server` ships to npm, replace the `file:`
dependencies in `../package.json` with normal version ranges and delete this
directory.
