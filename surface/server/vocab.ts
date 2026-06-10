/**
 * Domain vocabulary for the Woven Boulder surface — the boulder vault's
 * 3-layer flat tag scheme, grounded against the live vault 2026-06-10
 * (read-only `GET /vault/boulder/api/tags`).
 *
 * Layers (all flat — the vault declares no `parent_names` hierarchy):
 *
 *   - content-type — what a note IS (meeting-summary = "is a meeting
 *     note", ai-summary = "actually has an AI summary section", issue,
 *     domain, reference, …).
 *   - body — which governing body it belongs to (21 tags, city-council
 *     828 … library-commission 3; `joint-meeting` is the 21st — the
 *     cross-body bucket).
 *   - topic — subject matter (land-use 162, housing 112, …).
 */

import type { Note } from "@openparachute/surface-server";

/** The 21 body tags (live-verified). Also the `body` param enum. */
export const BODY_TAGS = [
  "beverage-licensing-authority",
  "board-of-zoning-adjustment",
  "boulder-arts-commission",
  "boulder-junction-access-district",
  "boulder-urban-renewal-authority",
  "cannabis-licensing-advisory-board",
  "city-council",
  "design-advisory-board",
  "downtown-management-commission",
  "environmental-advisory-board",
  "housing-advisory-board",
  "human-relations-commission",
  "joint-meeting",
  "landmarks-board",
  "library-commission",
  "parks-recreation-advisory-board",
  "planning-board",
  "police-oversight-panel",
  "transportation-advisory-board",
  "university-hill-commission",
  "water-resources-advisory-board",
] as const;

/**
 * Topic tags. The 2026-06-10 schema notes name "13 topic tags"; the live
 * tag read found these 14 topical tags — we validate against the wider
 * set (excluding a real topic would be the worse failure; the enum's job
 * is to refuse garbage).
 */
export const TOPIC_TAGS = [
  "arts",
  "budget",
  "civic-engagement",
  "environment",
  "equity",
  "housing",
  "immigration",
  "land-use",
  "open-space",
  "parks",
  "public-safety",
  "surveillance",
  "transportation",
  "water",
] as const;

/**
 * Meeting types. MIGRATION COMPLETE (2026-06-10): the kebab
 * `meeting-type` metadata key was migrated to the indexed `meeting_type`
 * across all 1,526 carrier notes (0 failures, byte-verified), and
 * `meta[meeting_type][eq]` queries were live-verified across
 * tag=meeting-summary (study-session 192, retreat 22, executive-session
 * 4). So the type FILTER rides the indexed vault query
 * (`metadata: { meeting_type: { eq } }` in `projections.ts`), while
 * per-note value PROJECTION dual-reads — `meeting_type` preferred, kebab
 * `meeting-type` fallback (via `metaField`) — for any unmigrated
 * stragglers/fixtures. A kebab-only straggler still shows its type on
 * cards but won't match the indexed filter (documented, acceptable).
 */
export const MEETING_TYPES = [
  "regular",
  "study-session",
  "special",
  "retreat",
  "joint",
  "executive-session",
] as const;

/** Issue `status` enum (the canonical kebab spellings). */
export const ISSUE_STATUSES = [
  "proposed",
  "in-progress",
  "approved",
  "implemented",
  "ongoing",
  "deferred",
  "archived",
] as const;

/** `search` projection scopes. */
export const SEARCH_SCOPES = ["meetings", "issues", "all"] as const;

/**
 * Read a metadata field tolerating the vault's kebab/underscore drift:
 * 19 older issue notes carry kebab keys (`lead-body`, `first-discussed`)
 * where newer notes carry underscore keys (`lead_body`). Looks up the
 * exact key first, then the other spelling.
 */
export function metaField(note: Note, key: string): unknown {
  const meta = note.metadata;
  if (!meta) return undefined;
  if (meta[key] !== undefined) return meta[key];
  const variant = key.includes("_") ? key.replace(/_/g, "-") : key.replace(/-/g, "_");
  return meta[variant];
}

/** `metaField`, narrowed to a string (anything else → undefined). */
export function metaString(note: Note, key: string): string | undefined {
  const v = metaField(note, key);
  return typeof v === "string" ? v : undefined;
}

/** Last path segment — the note's human title in this vault's layout. */
export function lastSegment(path: string | undefined): string {
  if (!path) return "";
  const seg = path.split("/").filter((s) => s.length > 0).pop();
  return seg ?? "";
}

/**
 * Normalize a vocabulary value for tolerant comparison: lowercase,
 * any run of non-alphanumerics → `-`. Makes `"City Council"`,
 * `city-council` and `city_council` compare equal (the issue-field
 * value drift).
 */
export function normalizeValue(v: string): string {
  return v
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** The note's body slug — its first tag that is a known body tag. */
export function bodySlugOf(note: Note): string | null {
  for (const tag of note.tags ?? []) {
    if ((BODY_TAGS as readonly string[]).includes(tag)) return tag;
  }
  return null;
}

/** Topic tags carried by a note. */
export function topicsOf(note: Note): string[] {
  return (note.tags ?? []).filter((t) => (TOPIC_TAGS as readonly string[]).includes(t));
}
