/**
 * The publicness gate — Woven Boulder's ONE choke point.
 *
 * Every projection result (REST and MCP alike) flows through
 * `createGatedVault`: the kit's projection pipeline and the router's
 * note resolution both read `ctx.vault`, and the backend hands them a
 * GATED wrapper instead of the raw client. Deny-by-default:
 *
 *   A note projects IFF
 *     - `path` starts with `"Boulder Civics/"`            AND
 *     - tags ∩ CONTENT_TYPE_ALLOWLIST ≠ ∅                 AND
 *     - tags ∩ TAG_DENYLIST = ∅.
 *
 * A non-conforming note is INVISIBLE: filtered from every list query,
 * `null` from `getNote` (a detail request 404s exactly like a
 * nonexistent note — no existence oracle). Linked-note summaries riding
 * `note.links` pass the same predicate or the link is dropped
 * (fail-closed: a link whose other end can't be checked is dropped too).
 *
 * Output hygiene rides the same choke point: every string in a
 * projected note (content, metadata values, link summaries, …) passes
 * `stripEmails` — the vault carries real addresses (e.g. Overview
 * `staff-liaison-email`) that must never reach the public site.
 *
 * The wrapper also executes the `$`-prefixed QUERY EXTENSIONS the
 * projections declare — backend-side compensation for what the vault
 * cannot index (see each extension's note). `$` keys are stripped
 * before anything touches the wire.
 */

import type { Note, SurfaceHostContext } from "@openparachute/surface-server";
import type {
  NotesQuery,
  NotesQueryInput,
  SubscribeHandlers,
  SubscribeOptions,
} from "@openparachute/surface-client";
import { metaString, normalizeValue } from "./vocab.ts";

/** Only notes under this path prefix may ever project. */
export const PUBLIC_PATH_PREFIX = "Boulder Civics/";

/**
 * Content-type allowlist — a note must carry at least one. `reference`
 * covers the body Overview notes (and other curated reference pages).
 */
export const CONTENT_TYPE_ALLOWLIST = [
  "meeting-summary",
  "meeting-transcript",
  "ai-summary",
  "meeting-minutes",
  "meeting-agenda",
  "issue",
  "domain",
  "member-profile",
  "reference",
] as const;

/** Hard denylist — any of these tags makes a note invisible. */
export const TAG_DENYLIST = [
  "operations",
  "meta",
  "templates",
  "automation",
  "data-sources",
  "research",
] as const;

const ALLOW = new Set<string>(CONTENT_TYPE_ALLOWLIST);
const DENY = new Set<string>(TAG_DENYLIST);

/** The minimal shape the predicate needs (Note or link NoteSummary). */
export interface NoteLike {
  path?: string;
  tags?: string[];
}

/** The deny-by-default publicness predicate. */
export function noteIsPublic(note: NoteLike): boolean {
  if (typeof note.path !== "string" || !note.path.startsWith(PUBLIC_PATH_PREFIX)) return false;
  const tags = note.tags;
  if (!Array.isArray(tags) || tags.length === 0) return false;
  if (!tags.some((t) => ALLOW.has(t))) return false;
  if (tags.some((t) => DENY.has(t))) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Output hygiene — email stripping
// ---------------------------------------------------------------------------

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?\.[A-Za-z]{2,}/g;

/** Replace every email address in a string. */
export function stripEmails(s: string): string {
  return s.replace(EMAIL_RE, "[email removed]");
}

/** Recursively strip emails from every string in a JSON-ish value. */
export function sanitizeDeep<T>(value: T): T {
  if (typeof value === "string") return stripEmails(value) as unknown as T;
  if (Array.isArray(value)) return value.map((v) => sanitizeDeep(v)) as unknown as T;
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = sanitizeDeep(v);
    }
    return out as unknown as T;
  }
  return value;
}

/**
 * Sanitize ONE public note for projection: drop links whose other end
 * isn't itself public (or can't be verified — fail-closed), then strip
 * emails from every string. Pure — never mutates the input.
 */
export function sanitizeNote(note: Note): Note {
  let next: Note = note;
  if (Array.isArray(note.links)) {
    const links = note.links.filter((link) => {
      const other = link.sourceId === note.id ? link.targetNote : link.sourceNote;
      // No summary to check → cannot verify the other end → drop.
      if (!other) return false;
      return noteIsPublic(other);
    });
    next = { ...note, links };
  }
  return sanitizeDeep(next);
}

// ---------------------------------------------------------------------------
// Query extensions — backend-side compensation, executed at the choke point
// ---------------------------------------------------------------------------

/**
 * `$`-prefixed extension keys a projection's `query()` may declare.
 * Stripped before the wire; executed AFTER the publicness gate.
 */
export interface GatedQueryExtras {
  /** Keep only notes whose path matches this RegExp source. */
  $pathPattern?: string;
  /**
   * Meeting-date range (inclusive both ends; values are the strict
   * YYYY-MM-DD strings the vault carries, compared lexicographically).
   * Backend-side conservatively: `date` is declared indexed via the
   * meeting-transcript tag schema, and only `meeting_type` has been
   * live-verified to filter correctly across the summary-only meetings
   * (2026-06-10 — that filter now rides the indexed query in
   * `projections.ts`). Move this into `meta[date][gte/lte]` once a
   * date-range query is similarly verified against the live vault.
   */
  $dateFrom?: string;
  $dateTo?: string;
  /**
   * Issue-field filters — backend-side because 19 older issue notes use
   * kebab metadata keys (`lead-body`) where newer use underscore
   * (`lead_body`), and values drift in casing ("City Council" vs
   * "city-council"). Comparison is `normalizeValue` on both sides via
   * the kebab/underscore-tolerant `metaField`.
   */
  $issueStatus?: string;
  $issueLeadBody?: string;
  $issueDomain?: string;
  /** Keep only notes carrying at least one of these tags. */
  $tagAnyOf?: string[];
  /**
   * Order meeting-tagged notes before issue-tagged notes (stable within
   * each group) — the topic feed's "grouped by kind".
   */
  $groupByKind?: boolean;
  /** Sort by the `date` metadata string. Dateless notes sort last. */
  $sortByDate?: "asc" | "desc";
  /** Slice the FILTERED result to at most this many notes. */
  $take?: number;
  /**
   * Page through the full result set (the vault caps page sizes; list
   * projections that sort/filter backend-side need the whole set).
   */
  $paginateAll?: boolean;
}

export type GatedQuery = NotesQuery & GatedQueryExtras;

/** What the wrapper needs from the underlying vault client. */
export interface VaultReader {
  vaultName: string;
  queryNotes(params: NotesQueryInput): Promise<Note[]>;
  getNote(id: string): Promise<Note | null>;
  subscribe?(
    query: NotesQueryInput,
    handlers: SubscribeHandlers,
    opts?: SubscribeOptions,
  ): () => void;
}

/** Page size + safety cap for `$paginateAll`. */
const PAGE_SIZE = 200;
const MAX_PAGES = 50;

export interface GatedVault {
  vaultName: string;
  queryNotes(params: NotesQueryInput | GatedQuery): Promise<Note[]>;
  getNote(id: string): Promise<Note | null>;
  subscribe(
    query: NotesQueryInput,
    handlers: SubscribeHandlers,
    opts?: SubscribeOptions,
  ): () => void;
}

function splitExtras(input: NotesQueryInput): { base: NotesQueryInput; extras: GatedQueryExtras } {
  if (input instanceof URLSearchParams) return { base: input, extras: {} };
  const base: Record<string, unknown> = {};
  const extras: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (k.startsWith("$")) extras[k] = v;
    else base[k] = v;
  }
  return { base: base as NotesQueryInput, extras: extras as GatedQueryExtras };
}

function applyExtras(notes: Note[], extras: GatedQueryExtras): Note[] {
  let out = notes;

  if (extras.$pathPattern !== undefined) {
    const re = new RegExp(extras.$pathPattern);
    out = out.filter((n) => typeof n.path === "string" && re.test(n.path));
  }
  if (extras.$tagAnyOf !== undefined) {
    const want = new Set(extras.$tagAnyOf);
    out = out.filter((n) => (n.tags ?? []).some((t) => want.has(t)));
  }
  if (extras.$dateFrom !== undefined || extras.$dateTo !== undefined) {
    out = out.filter((n) => {
      const d = metaString(n, "date");
      if (d === undefined) return false;
      if (extras.$dateFrom !== undefined && d < extras.$dateFrom) return false;
      if (extras.$dateTo !== undefined && d > extras.$dateTo) return false;
      return true;
    });
  }
  if (extras.$issueStatus !== undefined) {
    const want = normalizeValue(extras.$issueStatus);
    out = out.filter((n) => {
      const v = metaString(n, "status");
      return v !== undefined && normalizeValue(v) === want;
    });
  }
  if (extras.$issueLeadBody !== undefined) {
    const want = normalizeValue(extras.$issueLeadBody);
    out = out.filter((n) => {
      const v = metaString(n, "lead_body");
      return v !== undefined && normalizeValue(v) === want;
    });
  }
  if (extras.$issueDomain !== undefined) {
    const want = normalizeValue(extras.$issueDomain);
    out = out.filter((n) => {
      const v = metaString(n, "domain");
      return v !== undefined && normalizeValue(v) === want;
    });
  }
  if (extras.$sortByDate !== undefined) {
    const dir = extras.$sortByDate === "asc" ? 1 : -1;
    out = [...out].sort((a, b) => {
      const da = metaString(a, "date");
      const db = metaString(b, "date");
      if (da === undefined && db === undefined) return 0;
      if (da === undefined) return 1; // dateless last, either direction
      if (db === undefined) return -1;
      return da < db ? -dir : da > db ? dir : 0;
    });
  }
  if (extras.$groupByKind === true) {
    const meetings = out.filter((n) => (n.tags ?? []).includes("meeting-summary"));
    const issues = out.filter(
      (n) => !(n.tags ?? []).includes("meeting-summary") && (n.tags ?? []).includes("issue"),
    );
    const rest = out.filter(
      (n) => !(n.tags ?? []).includes("meeting-summary") && !(n.tags ?? []).includes("issue"),
    );
    out = [...meetings, ...issues, ...rest];
  }
  if (extras.$take !== undefined) {
    out = out.slice(0, extras.$take);
  }
  return out;
}

/**
 * Wrap a vault client so every read passes the publicness gate + email
 * strip, and `$` query extensions execute backend-side. This is the
 * object handed (via the host-context spread) to the kit's projection
 * runner and router — there is no other read path.
 */
export function createGatedVault(inner: VaultReader): GatedVault {
  return {
    get vaultName(): string {
      return inner.vaultName;
    },

    async queryNotes(input: NotesQueryInput | GatedQuery): Promise<Note[]> {
      const { base, extras } = splitExtras(input);

      let fetched: Note[];
      if (extras.$paginateAll === true && !(base instanceof URLSearchParams)) {
        fetched = [];
        for (let page = 0; page < MAX_PAGES; page++) {
          const pageQuery = {
            ...(base as Record<string, unknown>),
            limit: PAGE_SIZE,
            offset: page * PAGE_SIZE,
          } as NotesQueryInput;
          const batch = await inner.queryNotes(pageQuery);
          fetched.push(...batch);
          if (batch.length < PAGE_SIZE) break;
        }
      } else {
        fetched = await inner.queryNotes(base);
      }

      // THE GATE — before any extension sees the notes.
      const visible = fetched.filter(noteIsPublic);
      const shapedSet = applyExtras(visible, extras);
      return shapedSet.map(sanitizeNote);
    },

    async getNote(id: string): Promise<Note | null> {
      const note = await inner.getNote(id);
      if (note === null || !noteIsPublic(note)) return null; // missing == denied
      return sanitizeNote(note);
    },

    subscribe(
      query: NotesQueryInput,
      handlers: SubscribeHandlers,
      opts?: SubscribeOptions,
    ): () => void {
      if (!inner.subscribe) throw new Error("underlying vault client has no subscribe()");
      // Pass-through: subscriptions are an internal mechanism (grant
      // cache, registries) — nothing from them is projected directly.
      return inner.subscribe(query, handlers, opts ?? {});
    },
  };
}

/**
 * A host context whose vault reads are gated. Everything else (store,
 * layer, clientIp, config, log, mount, shutdownSignal) passes through.
 */
export function gatedContext(ctx: SurfaceHostContext, gated: GatedVault): SurfaceHostContext {
  return { ...ctx, vault: gated as unknown as SurfaceHostContext["vault"] };
}
