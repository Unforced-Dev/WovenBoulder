/**
 * The typed client over the nine projection REST endpoints.
 *
 * Fully anonymous — plain fetch, no tokens, no vault API. The base URL
 * defaults to `<BASE_URL>api/` (same-package: the bundle is served at
 * the surface mount, the API lives under it), so deployment needs zero
 * origin configuration.
 *
 * Error contract (mirrors the backend's route guards):
 *   - 404 `{"error":"not_found"}`            → NotFoundError
 *   - 400 `{"error":"invalid_params",issues}` → InvalidParamsError
 *   - anything else non-2xx                   → ApiError
 */

import type {
  BodyInfo,
  DomainInfo,
  Envelope,
  IssueCard,
  IssueDetail,
  IssuesParams,
  MeetingBrief,
  MeetingCard,
  RecentMeetingsParams,
  SearchParams,
  SearchResult,
  TopicFeedItem,
  TranscriptPage,
} from "./types.ts";

export class ApiError extends Error {
  override name: string = "ApiError";
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export class NotFoundError extends ApiError {
  override name = "NotFoundError" as const;
  constructor() {
    super("not found", 404);
  }
}

export interface ParamIssue {
  param: string;
  message: string;
}

export class InvalidParamsError extends ApiError {
  override name = "InvalidParamsError" as const;
  constructor(readonly issues: ParamIssue[]) {
    super(
      issues.map((i) => `${i.param}: ${i.message}`).join("; ") || "invalid params",
      400,
    );
  }
}

export interface ClientOptions {
  /** Endpoint prefix incl. trailing slash; default `<BASE_URL>api/`. */
  baseUrl?: string;
  /** Injectable fetch (tests). Must be pre-bound; default globalThis.fetch. */
  fetchFn?: typeof fetch;
}

type ParamValue = string | number | undefined;

/** Build the query string, skipping undefined params. Exported for tests. */
export function buildQuery(params: Record<string, ParamValue>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    search.set(key, String(value));
  }
  const s = search.toString();
  return s.length > 0 ? `?${s}` : "";
}

export interface WovenBoulderClient {
  listBodies(): Promise<BodyInfo[]>;
  recentMeetings(params?: RecentMeetingsParams): Promise<MeetingCard[]>;
  meetingBrief(path: string): Promise<MeetingBrief>;
  meetingTranscript(path: string, page?: number): Promise<TranscriptPage>;
  issues(params?: IssuesParams): Promise<IssueCard[]>;
  issueDetail(path: string): Promise<IssueDetail>;
  domains(): Promise<DomainInfo[]>;
  search(params: SearchParams): Promise<SearchResult[]>;
  topicFeed(topic: string, limit?: number): Promise<TopicFeedItem[]>;
}

function defaultBaseUrl(): string {
  // Vite injects BASE_URL ("/surface/woven-boulder/" in real builds,
  // "/" under the test runner).
  const base = import.meta.env?.BASE_URL ?? "/";
  return `${base.endsWith("/") ? base : `${base}/`}api/`;
}

export function createClient(opts: ClientOptions = {}): WovenBoulderClient {
  const baseUrl = opts.baseUrl ?? defaultBaseUrl();
  // Bind: a bare `fetch` reference can throw "Illegal invocation" in
  // some browsers when called without its global receiver.
  const fetchFn = opts.fetchFn ?? fetch.bind(globalThis);

  async function request<T>(
    endpoint: string,
    params: Record<string, ParamValue> = {},
  ): Promise<Envelope<T>> {
    const url = `${baseUrl}${endpoint}${buildQuery(params)}`;
    const res = await fetchFn(url, { headers: { accept: "application/json" } });
    if (!res.ok) {
      let body: unknown = null;
      try {
        body = await res.json();
      } catch {
        // non-JSON error body — fall through to the generic ApiError
      }
      const err = (body ?? {}) as { error?: string; issues?: ParamIssue[] };
      if (res.status === 404 && err.error === "not_found") throw new NotFoundError();
      if (res.status === 400 && err.error === "invalid_params") {
        throw new InvalidParamsError(err.issues ?? []);
      }
      throw new ApiError(err.error ?? `request failed (${res.status})`, res.status);
    }
    return (await res.json()) as Envelope<T>;
  }

  /** Detail projections return one item; the backend 404s when gated/missing. */
  async function detail<T>(
    endpoint: string,
    params: Record<string, ParamValue>,
  ): Promise<T> {
    const env = await request<T>(endpoint, params);
    const item = env.items[0];
    if (item === undefined) throw new NotFoundError();
    return item;
  }

  return {
    async listBodies() {
      return (await request<BodyInfo>("list-bodies")).items;
    },
    async recentMeetings(params = {}) {
      return (
        await request<MeetingCard>("recent-meetings", {
          body: params.body,
          type: params.type,
          from: params.from,
          to: params.to,
          limit: params.limit,
        })
      ).items;
    },
    async meetingBrief(path) {
      return await detail<MeetingBrief>("meeting-brief", { path });
    },
    async meetingTranscript(path, page) {
      return await detail<TranscriptPage>("meeting-transcript", { path, page });
    },
    async issues(params = {}) {
      return (
        await request<IssueCard>("issues", {
          status: params.status,
          domain: params.domain,
          lead_body: params.lead_body,
          limit: params.limit,
        })
      ).items;
    },
    async issueDetail(path) {
      return await detail<IssueDetail>("issue-detail", { path });
    },
    async domains() {
      return (await request<DomainInfo>("domains")).items;
    },
    async search(params) {
      return (
        await request<SearchResult>("search", {
          q: params.q,
          scope: params.scope,
          body: params.body,
          limit: params.limit,
        })
      ).items;
    },
    async topicFeed(topic, limit) {
      return (await request<TopicFeedItem>("topic-feed", { topic, limit })).items;
    },
  };
}
