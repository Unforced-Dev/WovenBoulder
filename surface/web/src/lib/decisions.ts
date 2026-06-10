/**
 * "Decisions & Votes" extraction from a meeting's AI summary markdown.
 *
 * The AI summaries carry sub-headings; when one names decisions or
 * votes, the meeting page hoists that section into a prominent callout
 * above the rest of the summary. Heuristic + fail-soft: when no such
 * heading exists, the summary renders unmodified.
 */

const DECISION_HEADING_RE = /^(#{2,4})\s+.*\b(decision|vote|action item|motion)s?\b.*$/im;

export interface DecisionsSplit {
  /** The decisions/votes section (heading dropped), or null when absent. */
  decisions: string | null;
  /** The heading text that matched (for the callout label), or null. */
  heading: string | null;
  /** The summary with the decisions section removed (or the original). */
  rest: string;
}

export function splitDecisions(summary: string): DecisionsSplit {
  const m = DECISION_HEADING_RE.exec(summary);
  if (!m || m.index === undefined) {
    return { decisions: null, heading: null, rest: summary };
  }
  const level = (m[1] ?? "##").length;
  const headingLine = m[0] ?? "";
  const heading = headingLine.replace(/^#{2,4}\s+/, "").trim();

  const afterHeading = summary.indexOf("\n", m.index);
  const bodyStart = afterHeading === -1 ? summary.length : afterHeading + 1;

  // The section runs to the next heading of the same or higher level.
  const nextHeadingRe = new RegExp(`^#{2,${level}}\\s`, "m");
  const restOfDoc = summary.slice(bodyStart);
  const next = nextHeadingRe.exec(restOfDoc);
  const sectionEnd = next ? bodyStart + next.index : summary.length;

  const decisions = summary.slice(bodyStart, sectionEnd).trim();
  const rest = `${summary.slice(0, m.index)}${summary.slice(sectionEnd)}`.trim();

  if (decisions.length === 0) return { decisions: null, heading: null, rest: summary };
  return { decisions, heading, rest };
}
