/**
 * Section splitting + transcript pagination.
 *
 * Meeting notes in the boulder vault are ONE markdown note containing a
 * `## AI-Generated Summary` section and a `## Transcript` section
 * (median 137KB, max 420KB). Projections MUST section-split — raw full
 * meeting content never rides out:
 *
 *   - `meeting-brief` emits ONLY the summary section (fallback: the
 *     first 2KB of content before `## Transcript`).
 *   - `meeting-transcript` emits ONLY the transcript section, paginated
 *     into ~10KB chunks.
 */

const SUMMARY_HEADING_RE = /^##\s+AI-Generated Summary\s*$/m;
const TRANSCRIPT_HEADING_RE = /^##\s+Transcript\s*$/m;
const NEXT_H2_RE = /^##\s/m;

export const SUMMARY_FALLBACK_BYTES = 2048;
export const TRANSCRIPT_CHUNK_BYTES = 10 * 1024;

/** Body of the section opened by `headingRe`, up to the next `## ` heading. */
function extractSection(content: string, headingRe: RegExp): string | null {
  const m = headingRe.exec(content);
  if (!m || m.index === undefined) return null;
  const afterHeading = content.indexOf("\n", m.index);
  const start = afterHeading === -1 ? content.length : afterHeading + 1;
  const rest = content.slice(start);
  const next = NEXT_H2_RE.exec(rest);
  const body = next ? rest.slice(0, next.index) : rest;
  return body.trim();
}

/** The `## AI-Generated Summary` section body, or null when absent. */
export function extractSummary(content: string): string | null {
  return extractSection(content, SUMMARY_HEADING_RE);
}

/** The `## Transcript` section body, or null when absent. */
export function extractTranscript(content: string): string | null {
  return extractSection(content, TRANSCRIPT_HEADING_RE);
}

/**
 * Fallback brief when a meeting note has no summary heading: the first
 * `SUMMARY_FALLBACK_BYTES` bytes of content BEFORE the transcript
 * section (UTF-8-safe, cut at a character boundary), title line dropped.
 */
export function summaryFallback(content: string): string {
  const t = TRANSCRIPT_HEADING_RE.exec(content);
  let head = t && t.index !== undefined ? content.slice(0, t.index) : content;
  head = head.replace(/^#[^\n]*\n/, "").trim();
  return truncateBytes(head, SUMMARY_FALLBACK_BYTES).trim();
}

/** Truncate to at most `maxBytes` UTF-8 bytes on a character boundary. */
export function truncateBytes(s: string, maxBytes: number): string {
  if (Buffer.byteLength(s, "utf8") <= maxBytes) return s;
  let out = "";
  let used = 0;
  for (const ch of s) {
    const b = Buffer.byteLength(ch, "utf8");
    if (used + b > maxBytes) break;
    out += ch;
    used += b;
  }
  return out;
}

/**
 * Split text into chunks of at most `maxBytes` UTF-8 bytes, preferring
 * line boundaries. A single line larger than the budget is hard-split
 * on character boundaries. Empty text → zero chunks.
 */
export function chunkText(text: string, maxBytes: number = TRANSCRIPT_CHUNK_BYTES): string[] {
  const trimmed = text.trim();
  if (trimmed.length === 0) return [];

  const chunks: string[] = [];
  let current = "";
  let currentBytes = 0;

  const pushCurrent = () => {
    if (currentBytes > 0) {
      chunks.push(current);
      current = "";
      currentBytes = 0;
    }
  };

  for (const line of trimmed.split("\n")) {
    let piece = line;
    // Hard-split oversize single lines.
    while (Buffer.byteLength(piece, "utf8") > maxBytes) {
      pushCurrent();
      const head = truncateBytes(piece, maxBytes);
      chunks.push(head);
      piece = piece.slice(head.length);
    }
    const pieceBytes = Buffer.byteLength(piece, "utf8") + (currentBytes > 0 ? 1 : 0);
    if (currentBytes + pieceBytes > maxBytes) pushCurrent();
    if (currentBytes > 0) {
      current += `\n${piece}`;
      currentBytes += Buffer.byteLength(piece, "utf8") + 1;
    } else {
      current = piece;
      currentBytes = Buffer.byteLength(piece, "utf8");
    }
  }
  pushCurrent();
  return chunks;
}

/**
 * First prose paragraph of a markdown note — skips the title line,
 * headings, blank lines, and list/quote markers; returns the first
 * plain-text paragraph (for issue/domain blurbs).
 */
export function firstProseParagraph(content: string): string {
  const blocks = content.split(/\n\s*\n/);
  for (const block of blocks) {
    const lines = block.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
    if (lines.length === 0) continue;
    const first = lines[0] ?? "";
    if (first.startsWith("#")) continue; // heading (incl. title)
    if (/^[-*>]|^\d+\./.test(first)) continue; // list / quote
    if (first.startsWith("```")) continue; // code fence
    return lines.join(" ");
  }
  return "";
}
