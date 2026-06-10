/**
 * Item shapes for the nine projection endpoints, as the backend emits
 * them (camelCase card keys; details addressed by vault `path`).
 * Source of truth: surface/server/projections.ts.
 */

/** The kit's REST envelope. */
export interface Envelope<T> {
  projection: string;
  count: number;
  items: T[];
}

/** `GET api/list-bodies` item. */
export interface BodyInfo {
  name: string;
  slug: string | null;
  path: string;
  meetingSchedule: string | null;
  cityUrl: string | null;
  youtubePlaylist: string | null;
  meetingCount: number;
}

/** `GET api/recent-meetings` item (also rides topic-feed + briefs). */
export interface MeetingCard {
  path: string;
  title: string;
  date: string | null;
  body: string | null;
  meetingType: string | null;
  recordingUrl: string | null;
  hasSummary: boolean;
  hasTranscript: boolean;
}

/** A resolved link end (related issue/meeting). */
export interface LinkedRef {
  path: string;
  title: string;
  date?: string;
  body?: string | null;
}

/** `GET api/meeting-brief` item. */
export interface MeetingBrief extends MeetingCard {
  status: string | null;
  topics: string[];
  /** ONLY the AI summary section — or a short fallback excerpt. */
  summary: string;
  summarySource: "ai-summary" | "fallback";
  relatedIssues: LinkedRef[];
}

/** `GET api/meeting-transcript` item (one ~10KB page). */
export interface TranscriptPage {
  path: string;
  title: string;
  date: string | null;
  body: string | null;
  /** 1-based; 0 when the meeting has no transcript. */
  page: number;
  /** 0 means no transcript. */
  totalPages: number;
  transcript: string;
}

/** Shared issue metadata core. */
export interface IssueCore {
  path: string;
  name: string;
  status: string | null;
  leadBody: string | null;
  domain: string | null;
}

/** `GET api/issues` item. */
export interface IssueCard extends IssueCore {
  summary: string;
  relatedMeetingCount: number;
}

/** `GET api/issue-detail` item. */
export interface IssueDetail extends IssueCore {
  topics: string[];
  content: string;
  relatedMeetings: LinkedRef[];
}

/** `GET api/domains` item. */
export interface DomainInfo {
  name: string;
  slug: string;
  path: string;
  blurb: string;
  issues: Array<{ path: string; name: string }>;
}

/** `GET api/search` item. */
export interface SearchResult {
  path: string;
  title: string;
  tags: string[];
  date: string | null;
  snippet: string;
}

/** `GET api/topic-feed` item — a meeting or an issue, marked by kind. */
export type TopicFeedItem =
  | ({ kind: "meeting" } & MeetingCard)
  | ({ kind: "issue" } & IssueCore);

export interface RecentMeetingsParams {
  body?: string;
  type?: string;
  from?: string;
  to?: string;
  limit?: number;
}

export interface IssuesParams {
  status?: string;
  domain?: string;
  lead_body?: string;
  limit?: number;
}

export interface SearchParams {
  q: string;
  scope?: "meetings" | "issues" | "all";
  body?: string;
  limit?: number;
}
