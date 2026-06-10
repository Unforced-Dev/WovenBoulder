/**
 * Body registry — per-body meeting counts for the `list-bodies`
 * projection.
 *
 * The kit's projection pipeline is one-query → map(shape), so an
 * aggregate (count of meeting notes per body) can't ride a single
 * projection query. The registry precomputes it: a paginated
 * metadata-only sweep of `meeting-summary` notes THROUGH THE GATED
 * VAULT (so counts never include non-public notes), grouped by body
 * tag. Refreshed on an interval keyed to the host's shutdown signal,
 * and on demand via the operator-only `/api/admin/refresh` route.
 */

import type { SurfaceLogger } from "@openparachute/surface-server";
import type { GatedQuery, GatedVault } from "./gate.ts";
import { bodySlugOf } from "./vocab.ts";

const DEFAULT_REFRESH_MS = 30 * 60 * 1000;

export interface BodyRegistryOptions {
  log: SurfaceLogger;
  signal: AbortSignal;
  refreshMs?: number;
}

export interface BodyRegistry {
  /** Await the first sweep (errors are logged, not thrown — a vault
   * hiccup at mount must not take the surface down; counts stay 0 and
   * the interval retries). */
  start(): Promise<void>;
  /** Force a sweep now (the admin refresh route). Throws on failure. */
  refresh(): Promise<void>;
  meetingCount(bodySlug: string): number;
  stop(): void;
}

export function createBodyRegistry(vault: GatedVault, opts: BodyRegistryOptions): BodyRegistry {
  let counts = new Map<string, number>();
  let timer: ReturnType<typeof setInterval> | null = null;
  const refreshMs = opts.refreshMs ?? DEFAULT_REFRESH_MS;

  async function refresh(): Promise<void> {
    const meetings = await vault.queryNotes({
      tag: "meeting-summary",
      $paginateAll: true,
    } satisfies GatedQuery);
    const next = new Map<string, number>();
    for (const note of meetings) {
      const slug = bodySlugOf(note);
      if (slug === null) continue;
      next.set(slug, (next.get(slug) ?? 0) + 1);
    }
    counts = next;
  }

  function stop(): void {
    if (timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  }

  return {
    async start(): Promise<void> {
      try {
        await refresh();
      } catch (err) {
        opts.log.error(`body registry initial sweep failed: ${(err as Error).message ?? err}`);
      }
      timer = setInterval(() => {
        refresh().catch((err) => {
          opts.log.warn(`body registry refresh failed: ${(err as Error).message ?? err}`);
        });
      }, refreshMs);
      // Don't keep the process alive for a cache refresh.
      (timer as unknown as { unref?: () => void }).unref?.();
      opts.signal.addEventListener("abort", stop, { once: true });
    },
    refresh,
    meetingCount(bodySlug: string): number {
      return counts.get(bodySlug) ?? 0;
    },
    stop,
  };
}
