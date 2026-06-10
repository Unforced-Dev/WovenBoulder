/**
 * Formatting + labeling helpers: dates, slug humanization, meeting-type
 * and issue-status labels, slug normalization (mirrors the backend's
 * `normalizeValue`), and YouTube URL parsing.
 */

const MEETING_TYPE_LABELS: Record<string, string> = {
  regular: "Regular meeting",
  "study-session": "Study session",
  special: "Special meeting",
  retreat: "Retreat",
  joint: "Joint session",
  "executive-session": "Executive session",
};

const ISSUE_STATUS_LABELS: Record<string, string> = {
  proposed: "Proposed",
  "in-progress": "In progress",
  approved: "Approved",
  implemented: "Implemented",
  ongoing: "Ongoing",
  deferred: "Deferred",
  archived: "Archived",
};

/** A few body names that plain word-capitalization gets wrong. */
const BODY_NAME_OVERRIDES: Record<string, string> = {
  "joint-meeting": "Joint meetings",
  "parks-recreation-advisory-board": "Parks & Recreation Advisory Board",
};

const SMALL_WORDS = new Set(["of", "and", "the"]);

/** "city-council" → "City Council". */
export function humanizeSlug(slug: string): string {
  const override = BODY_NAME_OVERRIDES[slug];
  if (override !== undefined) return override;
  return slug
    .split("-")
    .map((w, i) =>
      i > 0 && SMALL_WORDS.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1),
    )
    .join(" ");
}

export function meetingTypeLabel(type: string | null): string {
  if (type === null) return "Meeting";
  return MEETING_TYPE_LABELS[type] ?? humanizeSlug(type);
}

export function issueStatusLabel(status: string | null): string {
  if (status === null) return "Unknown";
  return ISSUE_STATUS_LABELS[status] ?? humanizeSlug(status);
}

/** "2026-04-23" → "April 23, 2026" (local-safe: no TZ math on the string). */
export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr);
  if (!m) return dateStr;
  const [, y, mo, d] = m;
  const date = new Date(Number(y), Number(mo) - 1, Number(d));
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/**
 * Mirror of the backend's `normalizeValue`: lowercase, runs of
 * non-alphanumerics → "-". Used for issue/domain slugs in URLs.
 */
export function normalizeValue(v: string): string {
  return v
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Last path segment — the vault note's human title. */
export function lastSegment(path: string): string {
  const seg = path
    .split("/")
    .filter((s) => s.length > 0)
    .pop();
  return seg ?? "";
}

/** Extract a YouTube video id from watch/short/live URL shapes. */
export function youtubeVideoId(url: string | null): string | null {
  if (!url) return null;
  const watch = /[?&]v=([\w-]{6,})/.exec(url);
  if (watch?.[1]) return watch[1];
  const short = /youtu\.be\/([\w-]{6,})/.exec(url);
  if (short?.[1]) return short[1];
  const live = /youtube\.com\/(?:live|embed|shorts)\/([\w-]{6,})/.exec(url);
  if (live?.[1]) return live[1];
  return null;
}

/** Truncate prose at a word boundary with an ellipsis. */
export function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${cut.slice(0, lastSpace > max * 0.6 ? lastSpace : max).trimEnd()}…`;
}
