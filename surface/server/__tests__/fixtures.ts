/**
 * Constructed fixtures mirroring the boulder vault's verified shapes
 * (2026-06-10): 3-layer flat tags, `Boulder Civics/` paths, one-note
 * meetings with `## AI-Generated Summary` + `## Transcript` sections,
 * the POST-MIGRATION indexed `meeting_type` metadata key (with ONE
 * kebab-only `meeting-type` straggler — `mtgTranscriptOnly` — for the
 * dual-read fallback), and the kebab/underscore issue-field drift
 * (`lead-body` on older notes vs `lead_body` on newer).
 *
 * Markers (UPPERCASE) prove visibility/invisibility through
 * projections; the email fixtures prove the strip.
 */

import type { Note } from "@openparachute/surface-client";

export const KNOWN_EMAIL = "clerk@bouldercolorado.gov";
export const SUMMARY_MARKER = "HOUSING-LINKAGE-FEE-MARKER";
export const TRANSCRIPT_MARKER = "TRANSCRIPT-LINE-MARKER";

// --- Overview (reference) notes --------------------------------------------

export const ovCityCouncil: Note = {
  id: "ov-cc",
  path: "Boulder Civics/City Council/Overview",
  createdAt: "2026-05-02T00:00:00Z",
  tags: ["boulder-civics", "city-council", "reference"],
  metadata: {
    body: "City Council",
    type: "overview",
    "meeting-schedule": "Most Thursdays at 6 PM",
    "city-url": "https://bouldercolorado.gov/city-council",
    "youtube-playlist": "https://www.youtube.com/playlist?list=CC",
    "staff-liaison-email": KNOWN_EMAIL,
  },
  content: "# City Council\n\nThe governing body of the City of Boulder.\n",
};

export const ovPlanningBoard: Note = {
  id: "ov-pb",
  path: "Boulder Civics/Planning Board/Overview",
  createdAt: "2026-05-03T00:00:00Z",
  tags: ["boulder-civics", "planning-board", "reference"],
  metadata: {
    body: "Planning Board",
    "meeting-schedule": "1st, 3rd, and 4th Tuesdays at 6 PM",
  },
  content: "# Planning Board\n\nReviews land use applications.\n",
};

/** Same directory, also `reference` — must NOT appear in list-bodies. */
export const memberRoster: Note = {
  id: "ref-members",
  path: "Boulder Civics/City Council/Members 2026",
  createdAt: "2026-05-02T00:00:00Z",
  tags: ["boulder-civics", "city-council", "member-profile", "reference"],
  metadata: { body: "City Council", year: "2026" },
  content: "# Members 2026\n\nRoster.\n",
};

// --- Meeting notes -----------------------------------------------------------

/** ~52KB transcript → 6 pages at the 10KB chunk size. */
export const FIXTURE_TRANSCRIPT_PAGES = 6;
export function bigTranscript(): string {
  return Array.from(
    { length: 600 },
    (_, i) => `[${i}:00] Speaker ${i % 9}: ${TRANSCRIPT_MARKER} line number ${i} of the spoken civic record.`,
  ).join("\n");
}

export const mtgBoth: Note = {
  id: "m-both",
  path: "Boulder Civics/City Council/Meetings/2026-04-23 City Council Regular Meeting",
  createdAt: "2026-04-24T00:00:00Z",
  tags: [
    "boulder-civics",
    "city-council",
    "meeting-summary",
    "meeting-transcript",
    "ai-summary",
    "housing",
    "land-use",
  ],
  metadata: {
    body: "City Council",
    date: "2026-04-23",
    meeting_type: "regular",
    status: "complete",
    "recording-url": "https://www.youtube.com/watch?v=abc123",
  },
  content: `# 2026-04-23 City Council Regular Meeting

## AI-Generated Summary

Council discussed the ${SUMMARY_MARKER} and adopted the updated linkage fee schedule. Questions to ${KNOWN_EMAIL}.

## Transcript

${bigTranscript()}
`,
  links: [
    {
      sourceId: "m-both",
      targetId: "i-new",
      relationship: "references",
      sourceNote: {
        id: "m-both",
        path: "Boulder Civics/City Council/Meetings/2026-04-23 City Council Regular Meeting",
        tags: ["meeting-summary", "city-council"],
      },
      targetNote: {
        id: "i-new",
        path: "Boulder Civics/Issues/East Boulder Sub-Community Plan",
        tags: ["boulder-civics", "issue", "land-use"],
        metadata: { name: "East Boulder Sub-Community Plan" },
      },
    },
    {
      // Link to a NON-public note — the choke point must drop it.
      sourceId: "m-both",
      targetId: "p-ops",
      relationship: "references",
      sourceNote: {
        id: "m-both",
        path: "Boulder Civics/City Council/Meetings/2026-04-23 City Council Regular Meeting",
        tags: ["meeting-summary", "city-council"],
      },
      targetNote: {
        id: "p-ops",
        path: "Boulder Civics/Operations/Pipeline Notes",
        tags: ["meeting-summary", "operations"],
      },
    },
  ],
};

export const mtgSummaryOnly: Note = {
  id: "m-summary",
  path: "Boulder Civics/City Council/Meetings/2026-05-01 City Council Study Session",
  createdAt: "2026-05-02T00:00:00Z",
  tags: ["boulder-civics", "city-council", "meeting-summary", "ai-summary", "land-use"],
  metadata: {
    body: "City Council",
    date: "2026-05-01",
    meeting_type: "study-session",
    status: "complete",
  },
  content: `# 2026-05-01 City Council Study Session

## AI-Generated Summary

A study session on the East Boulder subcommunity plan update.
`,
};

/**
 * THE kebab-only straggler: an unmigrated note still carrying the kebab
 * `meeting-type` key (no `meeting_type`). Its card must still show its
 * type via the dual-read fallback; the indexed `meta[meeting_type][eq]`
 * filter must NOT match it (documented straggler behavior).
 */
export const mtgTranscriptOnly: Note = {
  id: "m-transcript",
  path: "Boulder Civics/Planning Board/Meetings/2026-03-10 Planning Board Regular Meeting",
  createdAt: "2026-03-11T00:00:00Z",
  tags: ["boulder-civics", "planning-board", "meeting-summary", "meeting-transcript"],
  metadata: {
    body: "Planning Board",
    date: "2026-03-10",
    "meeting-type": "regular",
    "recording-url": "https://www.youtube.com/watch?v=pb0310",
  },
  content: `# 2026-03-10 Planning Board Regular Meeting

A preamble paragraph describing the agenda before any sections.

## Transcript

[0:00] Chair: Welcome to the Planning Board.
[0:05] Member: ${TRANSCRIPT_MARKER} short transcript.
`,
};

export const mtgOld: Note = {
  id: "m-old",
  path: "Boulder Civics/City Council/Meetings/2025-01-15 City Council Regular Meeting",
  createdAt: "2025-01-16T00:00:00Z",
  tags: ["boulder-civics", "city-council", "meeting-summary", "ai-summary"],
  metadata: {
    body: "City Council",
    date: "2025-01-15",
    meeting_type: "regular",
  },
  content: "# 2025-01-15 City Council Regular Meeting\n\n## AI-Generated Summary\n\nAn older meeting.\n",
};

// --- Issues ------------------------------------------------------------------

export const ISSUE_MARKER = "FORM-BASED-CODE-MARKER";

/** New-style metadata: underscore keys. */
export const issueNew: Note = {
  id: "i-new",
  path: "Boulder Civics/Issues/East Boulder Sub-Community Plan",
  createdAt: "2026-02-01T00:00:00Z",
  tags: ["boulder-civics", "issue", "land-use"],
  metadata: {
    name: "East Boulder Sub-Community Plan",
    status: "in-progress",
    lead_body: "Planning Board",
    domain: "Land Use",
  },
  content: `# East Boulder Sub-Community Plan

The plan rezones East Boulder with a ${ISSUE_MARKER} approach to mixed-use districts.

Further detail follows.
`,
  links: [
    {
      sourceId: "i-new",
      targetId: "m-both",
      relationship: "discussed-in",
      sourceNote: {
        id: "i-new",
        path: "Boulder Civics/Issues/East Boulder Sub-Community Plan",
        tags: ["issue", "land-use"],
      },
      targetNote: {
        id: "m-both",
        path: "Boulder Civics/City Council/Meetings/2026-04-23 City Council Regular Meeting",
        tags: ["meeting-summary", "meeting-transcript", "city-council"],
        metadata: { date: "2026-04-23", body: "City Council" },
      },
    },
  ],
};

/** Old-style metadata: kebab keys (`lead-body`), no `name`/`domain`. */
export const issueOld: Note = {
  id: "i-old",
  path: "Boulder Civics/Issues/990 Arapahoe Redevelopment",
  createdAt: "2025-08-01T00:00:00Z",
  tags: ["boulder-civics", "issue", "housing"],
  metadata: {
    status: "ongoing",
    "lead-body": "City Council",
    "first-discussed": "2025-06-01",
    keywords: "redevelopment, housing",
  },
  content: "# 990 Arapahoe Redevelopment\n\nRedevelopment of the 990 Arapahoe parcel.\n",
};

export const issueArchived: Note = {
  id: "i-archived",
  path: "Boulder Civics/Issues/Old Library Annex",
  createdAt: "2024-01-01T00:00:00Z",
  tags: ["boulder-civics", "issue"],
  metadata: { name: "Old Library Annex", status: "archived", lead_body: "Library Commission" },
  content: "# Old Library Annex\n\nArchived issue.\n",
};

// --- Domains -----------------------------------------------------------------

export const domLandUse: Note = {
  id: "d-land-use",
  path: "Boulder Civics/Domains/Land Use",
  createdAt: "2026-01-01T00:00:00Z",
  tags: ["boulder-civics", "domain"],
  metadata: { name: "Land Use" },
  content: "# Land Use\n\nZoning, planning, and development across the city.\n",
  links: [
    {
      sourceId: "d-land-use",
      targetId: "i-new",
      relationship: "contains",
      sourceNote: {
        id: "d-land-use",
        path: "Boulder Civics/Domains/Land Use",
        tags: ["domain"],
      },
      targetNote: {
        id: "i-new",
        path: "Boulder Civics/Issues/East Boulder Sub-Community Plan",
        tags: ["issue", "land-use"],
        metadata: { name: "East Boulder Sub-Community Plan" },
      },
    },
  ],
};

export const domHousing: Note = {
  id: "d-housing",
  path: "Boulder Civics/Domains/Housing",
  createdAt: "2026-01-01T00:00:00Z",
  tags: ["boulder-civics", "domain"],
  metadata: { name: "Housing" },
  content: "# Housing\n\nAffordability, supply, and housing policy.\n",
};

// --- Poison fixtures (must be INVISIBLE everywhere) ---------------------------

export const OPS_MARKER = "OPS-SECRET-MARKER";
export const PATHLESS_MARKER = "PATHLESS-SECRET-MARKER";
export const UNI_MARKER = "UNI-SECRET-MARKER";
export const NOTYPE_MARKER = "NO-CONTENT-TYPE-MARKER";

/** Denylist tag — under the public path, carrying a body tag, yet invisible. */
export const poisonOps: Note = {
  id: "p-ops",
  path: "Boulder Civics/Operations/Pipeline Notes",
  createdAt: "2026-04-22T00:00:00Z",
  tags: ["boulder-civics", "city-council", "meeting-summary", "operations"],
  metadata: {
    body: "City Council",
    date: "2026-04-22",
    meeting_type: "regular",
  },
  content: `# Pipeline Notes\n\n## AI-Generated Summary\n\n${OPS_MARKER} ops-contact@example.com\n`,
};

/** No path at all. */
export const poisonPathless: Note = {
  id: "p-pathless",
  createdAt: "2026-04-21T00:00:00Z",
  tags: ["issue"],
  metadata: { name: "Pathless Issue", status: "proposed" },
  content: `# Pathless\n\n${PATHLESS_MARKER}\n`,
};

/** Wrong path subtree. */
export const poisonUni: Note = {
  id: "p-uni",
  path: "Uni/Secret Note",
  createdAt: "2026-04-20T00:00:00Z",
  tags: ["meeting-summary", "ai-summary", "city-council", "housing"],
  metadata: { date: "2026-04-20", meeting_type: "regular", body: "City Council" },
  content: `# Secret\n\n## AI-Generated Summary\n\n${UNI_MARKER}\n`,
};

/** Public path but no allowlisted content-type tag. */
export const poisonNoType: Note = {
  id: "p-notype",
  path: "Boulder Civics/Misc/Scratch",
  createdAt: "2026-04-19T00:00:00Z",
  tags: ["boulder-civics", "housing"],
  metadata: { date: "2026-04-19" },
  content: `# Scratch\n\n${NOTYPE_MARKER}\n`,
};

export const POISON_MARKERS = [OPS_MARKER, PATHLESS_MARKER, UNI_MARKER, NOTYPE_MARKER];

export const ALL_FIXTURES: Note[] = [
  ovCityCouncil,
  ovPlanningBoard,
  memberRoster,
  mtgBoth,
  mtgSummaryOnly,
  mtgTranscriptOnly,
  mtgOld,
  issueNew,
  issueOld,
  issueArchived,
  domLandUse,
  domHousing,
  poisonOps,
  poisonPathless,
  poisonUni,
  poisonNoType,
];
