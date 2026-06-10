/**
 * Test fixtures: a fake `SurfaceHostContext` over a REAL
 * `SurfaceStateStore` (temp SQLite) and a scriptable fake vault with a
 * mini query engine — enough of the vault's notes-query semantics
 * (tag/tagMatch, exact path, FTS substring, limit/offset,
 * includeContent/includeLinks) that the gated wrapper's real queries
 * exercise realistically against constructed fixtures. NEVER the live
 * vault.
 *
 * Shape mirrors the kit's own `__tests__/helpers.ts` (the fake vault is
 * cast through `unknown` because `ScopedVaultClient` carries
 * ECMAScript-private fields; the kit only calls the public surface).
 */

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { type SurfaceHostContext, SurfaceStateStore } from "@openparachute/surface";
import type { HubJwtClaims } from "@openparachute/scope-guard";
import type {
  Note,
  NotesQuery,
  NotesQueryInput,
  SubscribeHandlers,
  SubscribeOptions,
} from "@openparachute/surface-client";
import type { SurfaceBackend } from "@openparachute/surface";
import { buildBackend, type BuildBackendOptions } from "../index.ts";

export const MOUNT = "/surface/woven-boulder";
export const ORIGIN = "https://surface.test";

/** The operator bearer the test JWT validator accepts. */
export const OPERATOR_JWT = "test-operator-jwt";

// ---------------------------------------------------------------------------
// FakeVault — a mini notes-query engine over fixture notes
// ---------------------------------------------------------------------------

type QueryRecord = NotesQuery & { search?: string };

export class FakeVault {
  readonly vaultName = "boulder";
  notes = new Map<string, Note>();
  queryInputs: NotesQueryInput[] = [];
  subscriptions: Array<{ query: NotesQueryInput; handlers: SubscribeHandlers }> = [];

  seed(notes: Note[]): void {
    for (const n of notes) this.notes.set(n.id, n);
  }

  subscribe(
    query: NotesQueryInput,
    handlers: SubscribeHandlers,
    _opts: SubscribeOptions = {},
  ): () => void {
    this.subscriptions.push({ query, handlers });
    return () => {};
  }

  async queryNotes(params: NotesQueryInput): Promise<Note[]> {
    this.queryInputs.push(params);
    const q = (params instanceof URLSearchParams
      ? Object.fromEntries(params)
      : params) as QueryRecord;

    let out = [...this.notes.values()].filter((n) => this.#matches(n, q));

    const offset = typeof q.offset === "number" ? q.offset : Number(q.offset ?? 0) || 0;
    const limit = typeof q.limit === "number" ? q.limit : Number(q.limit ?? 0) || undefined;
    out = out.slice(offset, limit !== undefined ? offset + limit : undefined);

    const includeContent = q.includeContent === true || (q.includeContent as unknown) === "true";
    const includeLinks = q.includeLinks === true || (q.includeLinks as unknown) === "true";
    return out.map((n) => {
      const clone: Note = structuredClone(n);
      if (!includeContent) delete clone.content;
      if (!includeLinks) delete clone.links;
      return clone;
    });
  }

  async getNote(id: string): Promise<Note | null> {
    const direct = this.notes.get(id);
    if (direct) return structuredClone(direct);
    for (const n of this.notes.values()) {
      if (n.path === id) return structuredClone(n);
    }
    return null;
  }

  #matches(note: Note, q: QueryRecord): boolean {
    if (q.tag !== undefined) {
      const tags = Array.isArray(q.tag) ? q.tag : String(q.tag).split(",");
      const noteTags = note.tags ?? [];
      const all = q.tagMatch === "all" || (q as Record<string, unknown>).tag_match === "all";
      const ok = all
        ? tags.every((t) => noteTags.includes(t))
        : tags.some((t) => noteTags.includes(t));
      if (!ok) return false;
    }
    if (q.path !== undefined && note.path !== q.path) return false;
    if (q.pathPrefix !== undefined && !(note.path ?? "").startsWith(q.pathPrefix)) return false;
    if (q.metadata !== undefined && !this.#matchesMetadata(note, q.metadata)) return false;
    if (q.search !== undefined) {
      const needle = q.search.toLowerCase();
      const hay = `${note.path ?? ""}\n${note.content ?? ""}`.toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    return true;
  }

  /**
   * Emulates the vault's metadata filtering closely enough for the
   * projections' indexed queries: operator objects (`{ eq: v }`) match
   * the EXACT metadata key only — like the real indexed generated
   * column, a kebab-only straggler does NOT match `meta[meeting_type]`.
   * Scalars are the JSON-scan shorthand equality, also exact-key.
   */
  #matchesMetadata(note: Note, filters: Record<string, unknown>): boolean {
    for (const [field, filter] of Object.entries(filters)) {
      const actual = note.metadata?.[field];
      if (filter !== null && typeof filter === "object" && !Array.isArray(filter)) {
        for (const [op, want] of Object.entries(filter as Record<string, unknown>)) {
          if (op === "exists") {
            if ((actual !== undefined) !== (want === true)) return false;
            continue;
          }
          if (actual === undefined) return false;
          const a = String(actual);
          const w = String(want);
          switch (op) {
            case "eq":
              if (a !== w) return false;
              break;
            case "ne":
              if (a === w) return false;
              break;
            case "gt":
              if (!(a > w)) return false;
              break;
            case "gte":
              if (!(a >= w)) return false;
              break;
            case "lt":
              if (!(a < w)) return false;
              break;
            case "lte":
              if (!(a <= w)) return false;
              break;
            case "in":
              if (!(want as unknown[]).map(String).includes(a)) return false;
              break;
            case "not_in":
              if ((want as unknown[]).map(String).includes(a)) return false;
              break;
            default:
              throw new Error(`FakeVault: unsupported metadata op "${op}"`);
          }
        }
      } else {
        // Scalar shorthand equality.
        if (actual === undefined || String(actual) !== String(filter)) return false;
      }
    }
    return true;
  }
}

// ---------------------------------------------------------------------------
// Fake host context + composed backend
// ---------------------------------------------------------------------------

export interface TestCtx {
  ctx: SurfaceHostContext;
  vault: FakeVault;
  store: SurfaceStateStore;
  controller: AbortController;
  logs: { warns: string[]; errors: string[]; logs: string[] };
}

export function makeTestCtx(opts: { vault?: FakeVault } = {}): TestCtx {
  const vault = opts.vault ?? new FakeVault();
  const dir = mkdtempSync(path.join(tmpdir(), "woven-boulder-test-"));
  const store = new SurfaceStateStore(path.join(dir, "state.sqlite"));
  const controller = new AbortController();
  const logs = { warns: [] as string[], errors: [] as string[], logs: [] as string[] };

  const ctx: SurfaceHostContext = {
    vault: vault as unknown as SurfaceHostContext["vault"],
    store,
    layer: (req: Request) => {
      const v = req.headers.get("x-parachute-layer");
      return v === "loopback" || v === "tailnet" || v === "public" ? v : "public";
    },
    clientIp: (req: Request) => req.headers.get("x-parachute-client-ip"),
    config: { all: () => ({}), get: () => undefined },
    log: {
      log: (...a: unknown[]) => logs.logs.push(a.join(" ")),
      warn: (...a: unknown[]) => logs.warns.push(a.join(" ")),
      error: (...a: unknown[]) => logs.errors.push(a.join(" ")),
    },
    mount: MOUNT,
    shutdownSignal: controller.signal,
  };

  return { ctx, vault, store, controller, logs };
}

/** Compose the real backend over a fixture vault, with test-friendly seams. */
export async function makeBackend(
  notes: Note[],
  overrides: BuildBackendOptions = {},
): Promise<{ backend: SurfaceBackend; t: TestCtx }> {
  const t = makeTestCtx();
  t.vault.seed(notes);
  const backend = await buildBackend(t.ctx, {
    authOptions: {
      validateHubJwt: async (token: string, aud: string): Promise<HubJwtClaims> => {
        if (token !== OPERATOR_JWT) throw new Error("bad operator token");
        return {
          sub: "operator-test",
          scopes: ["vault:boulder:write"],
          aud,
          jti: undefined,
          clientId: undefined,
        } as HubJwtClaims;
      },
    },
    rateLimit: { max: 100_000 }, // tests hammer one collective anon bucket
    registryRefreshMs: 60 * 60 * 1000,
    ...overrides,
  });
  return { backend, t };
}

/** GET a mount-relative path against the composed backend. */
export async function get(
  backend: SurfaceBackend,
  pathAndQuery: string,
  headers: Record<string, string> = {},
): Promise<Response> {
  return await backend.fetch(new Request(`${ORIGIN}${MOUNT}${pathAndQuery}`, { headers }));
}

/** POST a JSON-RPC body to the MCP endpoint. */
export async function mcp(
  backend: SurfaceBackend,
  body: unknown,
  headers: Record<string, string> = {},
): Promise<Response> {
  return await backend.fetch(
    new Request(`${ORIGIN}${MOUNT}/api/mcp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        ...headers,
      },
      body: JSON.stringify(body),
    }),
  );
}

/** Collect every string in a JSON-ish value (leak scans). */
export function allStrings(value: unknown, acc: string[] = []): string[] {
  if (typeof value === "string") acc.push(value);
  else if (Array.isArray(value)) for (const v of value) allStrings(v, acc);
  else if (value !== null && typeof value === "object") {
    for (const v of Object.values(value as Record<string, unknown>)) allStrings(v, acc);
  }
  return acc;
}
