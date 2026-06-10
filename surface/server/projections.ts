/**
 * The nine Woven Boulder projections (kit P9: one definition → REST +
 * MCP). All `access: "public"` — this is an anonymous-dominant civic
 * site; the only non-public route is the operator admin refresh in
 * `index.ts`.
 *
 * Every projection's results pass the publicness gate + email strip:
 * the queries run against the GATED vault (`gate.ts`), the single choke
 * point. Shapes only copy fields — raw note objects never ride out, and
 * meeting CONTENT leaves only through the section-split paths
 * (`meeting-brief` → summary section; `meeting-transcript` → paginated
 * transcript section).
 *
 * Param-enum validation is enforced twice:
 *   - REST: `route-guards.ts` pre-validates and 400s with per-param
 *     issues (the kit's `invalid_params` shape).
 *   - MCP: the same constraints are asserted inside `query()` — a
 *     violation throws and surfaces as the kit's in-band tool error.
 */

import { defineProjection, type Note, type ProjectionDefinition } from "@openparachute/surface-server";
import type { GatedQuery } from "./gate.ts";
import {
  chunkText,
  extractSummary,
  extractTranscript,
  firstProseParagraph,
  summaryFallback,
  truncateBytes,
} from "./sections.ts";
import type { BodyRegistry } from "./registry.ts";
import type { GuardSpec } from "./route-guards.ts";
import {
  BODY_TAGS,
  ISSUE_STATUSES,
  MEETING_TYPES,
  SEARCH_SCOPES,
  TOPIC_TAGS,
  bodySlugOf,
  lastSegment,
  metaString,
  normalizeValue,
  topicsOf,
} from "./vocab.ts";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
/** Headroom factor for single-shot queries that get gate-filtered. */
const SEARCH_FETCH_LIMIT = 100;

/** Thrown from `query()` on a constraint violation (the MCP-face guard;
 * REST never reaches it — `route-guards.ts` pre-validates). */
export class ProjectionInputError extends Error {
  override name = "ProjectionInputError" as const;
}

function assertEnum(
  param: string,
  value: string | undefined,
  allowed: readonly string[],
): void {
  if (value === undefined) return;
  if (!allowed.includes(value)) {
    throw new ProjectionInputError(
      `${param} must be one of: ${allowed.join(", ")} (got "${value}")`,
    );
  }
}

function resolveLimit(value: number | undefined): number {
  if (value === undefined) return DEFAULT_LIMIT;
  if (!Number.isInteger(value) || value < 1 || value > MAX_LIMIT) {
    throw new ProjectionInputError(`limit must be an integer between 1 and ${MAX_LIMIT}`);
  }
  return value;
}

function assertPage(value: number | undefined): number {
  if (value === undefined) return 1;
  if (!Number.isInteger(value) || value < 1) {
    throw new ProjectionInputError("page must be an integer ≥ 1");
  }
  return value;
}

// ---------------------------------------------------------------------------
// Shared shape helpers
// ---------------------------------------------------------------------------

/** The other end of a link, as the projections expose it. */
function linkedEnds(note: Note, requiredTag: string): Array<{ path: string; title: string; date?: string; body?: string | null }> {
  const out: Array<{ path: string; title: string; date?: string; body?: string | null }> = [];
  for (const link of note.links ?? []) {
    const other = link.sourceId === note.id ? link.targetNote : link.sourceNote;
    if (!other || !Array.isArray(other.tags) || !other.tags.includes(requiredTag)) continue;
    if (typeof other.path !== "string") continue;
    const entry: { path: string; title: string; date?: string; body?: string | null } = {
      path: other.path,
      title: lastSegment(other.path),
    };
    const date = other.metadata?.date;
    if (typeof date === "string") entry.date = date;
    const slug = bodySlugOf(other as Note);
    if (slug !== null) entry.body = slug;
    out.push(entry);
  }
  return out;
}

function meetingCard(note: Note) {
  return {
    path: note.path ?? "",
    title: lastSegment(note.path),
    date: metaString(note, "date") ?? null,
    body: bodySlugOf(note),
    // DUAL-READ (migration complete 2026-06-10): `meeting_type` preferred,
    // kebab `meeting-type` fallback for unmigrated stragglers — metaField
    // checks the exact key first, then the other spelling.
    meetingType: metaString(note, "meeting_type") ?? null,
    recordingUrl: metaString(note, "recording-url") ?? null,
    hasSummary: (note.tags ?? []).includes("ai-summary"),
    hasTranscript: (note.tags ?? []).includes("meeting-transcript"),
  };
}

function issueCore(note: Note) {
  const status = metaString(note, "status");
  return {
    path: note.path ?? "",
    name: metaString(note, "name") ?? lastSegment(note.path),
    status: status !== undefined ? normalizeValue(status) : null,
    leadBody: metaString(note, "lead_body") ?? null,
    domain: metaString(note, "domain") ?? null,
  };
}

// ---------------------------------------------------------------------------
// The projections
// ---------------------------------------------------------------------------

export interface BuildProjectionsResult {
  projections: ProjectionDefinition[];
  /** Per-projection REST guards, keyed by kebab name (route-guards.ts). */
  guards: Record<string, GuardSpec>;
}

export function buildProjections(registry: BodyRegistry): BuildProjectionsResult {
  const listBodies = defineProjection({
    name: "listBodies",
    query: () =>
      ({
        tag: "reference",
        includeContent: false,
        $pathPattern: "^Boulder Civics/[^/]+/Overview$",
        $paginateAll: true,
      }) satisfies GatedQuery,
    shape: (note) => {
      const slug = bodySlugOf(note);
      return {
        name: metaString(note, "body") ?? lastSegment(note.path?.split("/Overview")[0]),
        slug,
        path: note.path ?? "",
        meetingSchedule: metaString(note, "meeting-schedule") ?? null,
        cityUrl: metaString(note, "city-url") ?? null,
        youtubePlaylist: metaString(note, "youtube-playlist") ?? null,
        meetingCount: slug !== null ? registry.meetingCount(slug) : 0,
      };
    },
    describe:
      "Boulder's governing bodies (City Council, boards, commissions): name, slug, meeting schedule, city page URL, YouTube playlist, and how many meetings are on record. Slugs feed the `body` param of other tools.",
    access: "public",
  });

  const recentMeetings = defineProjection({
    name: "recentMeetings",
    params: {
      body: "string?",
      type: "string?",
      from: "date?",
      to: "date?",
      limit: "number?",
    },
    query: (p) => {
      assertEnum("body", p.body, BODY_TAGS);
      assertEnum("type", p.type, MEETING_TYPES);
      const limit = resolveLimit(p.limit);
      const q: GatedQuery = {
        tag: p.body !== undefined ? ["meeting-summary", p.body] : "meeting-summary",
        ...(p.body !== undefined ? { tagMatch: "all" as const } : {}),
        includeContent: false,
        $paginateAll: true,
        $sortByDate: "desc",
        $take: limit,
      };
      // The type filter rides the INDEXED vault query (migration to
      // `meeting_type` completed + live-verified 2026-06-10). Kebab-only
      // stragglers won't match it — documented; card values still
      // dual-read (see meetingCard).
      if (p.type !== undefined) q.metadata = { meeting_type: { eq: p.type } };
      if (p.from !== undefined) q.$dateFrom = p.from;
      if (p.to !== undefined) q.$dateTo = p.to;
      return q;
    },
    shape: (note) => meetingCard(note),
    describe:
      "Recent public meetings, newest first. Filter by body slug (see list-bodies), meeting type (regular, study-session, special, retreat, joint, executive-session), and date range (YYYY-MM-DD, inclusive). Returns metadata cards only — use meeting-brief / meeting-transcript for content.",
    access: "public",
  });

  const meetingBrief = defineProjection({
    name: "meetingBrief",
    params: { path: "string" },
    query: (p) =>
      ({
        path: p.path,
        includeContent: true,
        includeLinks: true,
        limit: 1,
      }) satisfies GatedQuery,
    shape: (note) => {
      const content = note.content ?? "";
      const summary = extractSummary(content);
      return {
        ...meetingCard(note),
        status: metaString(note, "status") ?? null,
        topics: topicsOf(note),
        summary: summary ?? summaryFallback(content),
        summarySource: summary !== null ? "ai-summary" : "fallback",
        relatedIssues: linkedEnds(note, "issue"),
      };
    },
    describe:
      "One meeting's brief: metadata plus ONLY its AI-generated summary section (never the transcript — use meeting-transcript for that) and links to related issues. Param `path` is the vault path from recent-meetings.",
    access: "public",
  });

  const meetingTranscript = defineProjection({
    name: "meetingTranscript",
    params: { path: "string", page: "number?" },
    query: (p) => {
      assertPage(p.page);
      return {
        path: p.path,
        includeContent: true,
        limit: 1,
      } satisfies GatedQuery;
    },
    shape: (note, p) => {
      const transcript = extractTranscript(note.content ?? "");
      const chunks = transcript !== null ? chunkText(transcript) : [];
      const totalPages = chunks.length;
      const requested = assertPage(p.page as number | undefined);
      const page = totalPages === 0 ? 0 : Math.min(requested, totalPages);
      return {
        path: note.path ?? "",
        title: lastSegment(note.path),
        date: metaString(note, "date") ?? null,
        body: bodySlugOf(note),
        page,
        totalPages,
        transcript: page === 0 ? "" : (chunks[page - 1] ?? ""),
      };
    },
    describe:
      "One meeting's transcript section, paginated into ~10KB pages (page is 1-based; pages past the end clamp to the last page; totalPages 0 means no transcript). Param `path` is the vault path from recent-meetings.",
    access: "public",
  });

  const issues = defineProjection({
    name: "issues",
    params: {
      status: "string?",
      domain: "string?",
      lead_body: "string?",
      limit: "number?",
    },
    query: (p) => {
      assertEnum("status", p.status, ISSUE_STATUSES);
      const limit = resolveLimit(p.limit);
      const q: GatedQuery = {
        tag: "issue",
        includeContent: true,
        includeLinks: true,
        $paginateAll: true,
        $take: limit,
      };
      if (p.status !== undefined) q.$issueStatus = p.status;
      if (p.domain !== undefined) q.$issueDomain = p.domain;
      if (p.lead_body !== undefined) q.$issueLeadBody = p.lead_body;
      return q;
    },
    shape: (note) => ({
      ...issueCore(note),
      summary: firstProseParagraph(note.content ?? ""),
      relatedMeetingCount: linkedEnds(note, "meeting-summary").length,
    }),
    describe:
      "Tracked civic issues: name, status (proposed, in-progress, approved, implemented, ongoing, deferred, archived), lead body, domain, a one-paragraph summary, and how many meetings touch each. Filters tolerate the older notes' kebab metadata spellings.",
    access: "public",
  });

  const issueDetail = defineProjection({
    name: "issueDetail",
    params: { path: "string" },
    query: (p) =>
      ({
        path: p.path,
        includeContent: true,
        includeLinks: true,
        limit: 1,
      }) satisfies GatedQuery,
    shape: (note) => ({
      ...issueCore(note),
      topics: topicsOf(note),
      content: note.content ?? "",
      relatedMeetings: linkedEnds(note, "meeting-summary"),
    }),
    describe:
      "One issue in full: metadata, the complete issue note content, and resolved links to the meetings where it was discussed (with dates and bodies). Param `path` is the vault path from the issues tool.",
    access: "public",
  });

  const domains = defineProjection({
    name: "domains",
    query: () =>
      ({
        tag: "domain",
        includeContent: true,
        includeLinks: true,
        $paginateAll: true,
      }) satisfies GatedQuery,
    shape: (note) => {
      const name = metaString(note, "name") ?? lastSegment(note.path);
      return {
        name,
        slug: normalizeValue(name),
        path: note.path ?? "",
        blurb: firstProseParagraph(note.content ?? ""),
        issues: linkedEnds(note, "issue").map(({ path, title }) => ({ path, name: title })),
      };
    },
    describe:
      "The civic domains (Land Use, Housing, …): name, slug, a one-line blurb, and the issues filed under each.",
    access: "public",
  });

  const search = defineProjection({
    name: "search",
    params: { q: "string", scope: "string?", body: "string?", limit: "number?" },
    query: (p) => {
      assertEnum("scope", p.scope, SEARCH_SCOPES);
      assertEnum("body", p.body, BODY_TAGS);
      resolveLimit(p.limit);
      const tags: string[] = [];
      if (p.scope === "meetings") tags.push("meeting-summary");
      else if (p.scope === "issues") tags.push("issue");
      if (p.body !== undefined) tags.push(p.body);
      const q: GatedQuery = {
        // `search` is the vault's FTS param — not modeled by the typed
        // builder; unknown string keys pass through verbatim.
        search: p.q,
        includeContent: true,
        limit: SEARCH_FETCH_LIMIT, // headroom: the gate filters after the fetch
        $take: resolveLimit(p.limit),
      } as GatedQuery;
      if (tags.length > 0) {
        q.tag = tags;
        q.tagMatch = "all";
      }
      return q;
    },
    shape: (note, p) => ({
      path: note.path ?? "",
      title: lastSegment(note.path),
      tags: note.tags ?? [],
      date: metaString(note, "date") ?? null,
      snippet: snippetAround(note.content ?? "", String(p.q ?? "")),
    }),
    describe:
      "Full-text search across the public civic record. `scope` narrows to meetings or issues (default all); `body` narrows to one governing body. Returns paths, tags, dates and a short snippet — never full content.",
    access: "public",
  });

  const topicFeed = defineProjection({
    name: "topicFeed",
    params: { topic: "string", limit: "number?" },
    query: (p) => {
      assertEnum("topic", p.topic, TOPIC_TAGS);
      const limit = resolveLimit(p.limit);
      return {
        tag: p.topic,
        includeContent: false,
        $paginateAll: true,
        $tagAnyOf: ["meeting-summary", "issue"],
        $sortByDate: "desc",
        $groupByKind: true,
        $take: limit,
      } satisfies GatedQuery;
    },
    shape: (note) => {
      const kind = (note.tags ?? []).includes("issue") && !(note.tags ?? []).includes("meeting-summary")
        ? "issue"
        : "meeting";
      return kind === "issue"
        ? { kind, ...issueCore(note) }
        : { kind, ...meetingCard(note) };
    },
    describe:
      "Recent activity on one topic (land-use, housing, equity, …): the meetings and issues tagged with it, meetings first, newest first, each item marked with its kind.",
    access: "public",
  });

  const projections = [
    listBodies,
    recentMeetings,
    meetingBrief,
    meetingTranscript,
    issues,
    issueDetail,
    domains,
    search,
    topicFeed,
  ];

  const limitRange = { min: 1, max: MAX_LIMIT, integer: true };
  const guards: Record<string, GuardSpec> = {
    "recent-meetings": {
      enums: { body: BODY_TAGS, type: MEETING_TYPES },
      ranges: { limit: limitRange },
    },
    "meeting-brief": { detail: true },
    "meeting-transcript": { detail: true, ranges: { page: { min: 1, integer: true } } },
    issues: { enums: { status: ISSUE_STATUSES }, ranges: { limit: limitRange } },
    "issue-detail": { detail: true },
    search: { enums: { scope: SEARCH_SCOPES, body: BODY_TAGS }, ranges: { limit: limitRange } },
    "topic-feed": { enums: { topic: TOPIC_TAGS }, ranges: { limit: limitRange } },
  };

  return { projections, guards };
}

/** A short window of content around the first match of `q` (≤ ~280 chars). */
export function snippetAround(content: string, q: string): string {
  if (content.length === 0) return "";
  const haystack = content.toLowerCase();
  const needle = q.toLowerCase();
  const idx = needle.length > 0 ? haystack.indexOf(needle) : -1;
  const center = idx === -1 ? 0 : idx;
  const start = Math.max(0, center - 120);
  const end = Math.min(content.length, center + needle.length + 160);
  let snippet = content.slice(start, end).replace(/\s+/g, " ").trim();
  snippet = truncateBytes(snippet, 280);
  return `${start > 0 ? "…" : ""}${snippet}${end < content.length ? "…" : ""}`;
}
