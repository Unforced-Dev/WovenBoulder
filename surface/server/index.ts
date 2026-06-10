/**
 * Woven Boulder — the backed-surface server entry (surface-runtime P1).
 *
 * The host imports this module and calls the default export once per
 * mount with the injected `SurfaceHostContext` (P2). Composition:
 *
 *   raw ctx.vault ──▶ createGatedVault ──▶ gated ctx ──▶ projections + router
 *                       (the ONE choke point: publicness gate,
 *                        email strip, $-extension execution)
 *
 *   - **Auth** (kit P7): anon-dominant — every projection is `public`.
 *     The operator branch (hub JWT via scope-guard) comes free from the
 *     kit and gates the single admin route. No capability links in v1.
 *   - **Authz** (kit P8): the GrantStore is constructed but NOT started
 *     — v1 grants no audience resources and declares no `note`-kind
 *     routes, so `can()` is unreachable; if it ever runs against the
 *     unstarted store it fail-closes (deny / single-flight revalidate),
 *     never stale-allows. Start the store when the first granted route
 *     lands.
 *   - **Projections** (kit P9): the nine domain queries in
 *     `projections.ts`, REST + MCP from one definition, wrapped with
 *     REST enum/range 400s and detail 404s (`route-guards.ts`).
 *
 * No module-level side effects (the P1 contract): everything starts
 * inside the factory and stops on `ctx.shutdownSignal` / `shutdown()`.
 */

import type { SurfaceBackend, SurfaceHostContext } from "@openparachute/surface";
import {
  createSurfaceAuth,
  createSurfaceAuthz,
  createSurfaceProjections,
  createSurfaceRouter,
  GrantStore,
  type RateLimitOptions,
  type SurfaceAuthOptions,
  type SurfaceRoute,
} from "@openparachute/surface-server";
import { createGatedVault, gatedContext, type VaultReader } from "./gate.ts";
import { buildProjections } from "./projections.ts";
import { createBodyRegistry } from "./registry.ts";
import { guardProjectionRoutes } from "./route-guards.ts";

export interface BuildBackendOptions {
  /** Test seams forwarded to `createSurfaceAuth` (e.g. `validateHubJwt`). */
  authOptions?: SurfaceAuthOptions;
  /** Router rate-limit tuning (tests raise it; production uses kit defaults). */
  rateLimit?: RateLimitOptions | false;
  /** Body-registry refresh interval override. */
  registryRefreshMs?: number;
}

/** Inner factory — the default export plus seams the tests need. */
export async function buildBackend(
  ctx: SurfaceHostContext,
  opts: BuildBackendOptions = {},
): Promise<SurfaceBackend> {
  const gated = createGatedVault(ctx.vault as unknown as VaultReader);
  const gatedCtx = gatedContext(ctx, gated);

  const auth = createSurfaceAuth(ctx, opts.authOptions ?? {});
  const grants = new GrantStore(ctx); // not started — see the module header
  const authz = createSurfaceAuthz(grants);

  const registry = createBodyRegistry(gated, {
    log: ctx.log,
    signal: ctx.shutdownSignal,
    ...(opts.registryRefreshMs !== undefined ? { refreshMs: opts.registryRefreshMs } : {}),
  });
  await registry.start();

  const { projections, guards } = buildProjections(registry);
  const compiled = createSurfaceProjections(gatedCtx, {
    projections,
    serverName: "woven-boulder",
    serverVersion: "0.1.0",
    instructions:
      "Public projections over Boulder's civic record: governing bodies, meetings (briefs + paginated transcripts), tracked issues, domains, topics, and full-text search. All tools are read-only and anonymous-friendly.",
  });

  const routes: SurfaceRoute[] = [
    ...guardProjectionRoutes(compiled.routes, guards),
    {
      method: "POST",
      path: "/api/admin/refresh",
      access: { kind: "operator" },
      handler: async () => {
        await registry.refresh();
        return Response.json({ ok: true });
      },
    },
  ];

  const router = createSurfaceRouter(gatedCtx, auth, authz, {
    routes,
    ...(opts.rateLimit !== undefined ? { rateLimit: opts.rateLimit } : {}),
  });

  return {
    fetch: router.fetch,
    shutdown: async () => {
      registry.stop();
    },
  };
}

/** The P1 entry contract: `createBackend(ctx)` as the default export. */
export default function createBackend(ctx: SurfaceHostContext): Promise<SurfaceBackend> {
  return buildBackend(ctx);
}
