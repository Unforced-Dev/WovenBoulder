/**
 * Typed-client tests: param building (exact query strings), envelope
 * unwrapping, and the error contract (404 not_found → NotFoundError,
 * 400 invalid_params → InvalidParamsError with per-param issues).
 */
import { describe, expect, it, vi } from "vitest";
import {
  ApiError,
  InvalidParamsError,
  NotFoundError,
  buildQuery,
  createClient,
} from "../api/client.ts";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function envelope(items: unknown[] = []) {
  return { projection: "test", count: items.length, items };
}

function clientWith(response: Response | ((url: string) => Response)) {
  const fetchFn = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    return typeof response === "function" ? response(url) : response;
  });
  const client = createClient({ baseUrl: "/surface/woven-boulder/api/", fetchFn });
  return { client, fetchFn };
}

function calledUrl(fetchFn: ReturnType<typeof vi.fn>, n = 0): string {
  const call = fetchFn.mock.calls[n];
  if (call === undefined) throw new Error("fetch not called");
  return String(call[0]);
}

describe("buildQuery", () => {
  it("skips undefined params and stringifies numbers", () => {
    expect(buildQuery({ body: "city-council", type: undefined, limit: 20 })).toBe(
      "?body=city-council&limit=20",
    );
  });

  it("returns an empty string when no params survive", () => {
    expect(buildQuery({ a: undefined })).toBe("");
  });

  it("URL-encodes values (vault paths carry spaces and slashes)", () => {
    const q = buildQuery({ path: "Boulder Civics/City Council/Meetings/2026-04-23 Meeting" });
    expect(q).toBe(
      "?path=Boulder+Civics%2FCity+Council%2FMeetings%2F2026-04-23+Meeting",
    );
  });
});

describe("param building per endpoint", () => {
  it("recent-meetings forwards only the set filters", async () => {
    const { client, fetchFn } = clientWith(jsonResponse(envelope()));
    await client.recentMeetings({ body: "planning-board", from: "2026-01-01", limit: 50 });
    expect(calledUrl(fetchFn)).toBe(
      "/surface/woven-boulder/api/recent-meetings?body=planning-board&from=2026-01-01&limit=50",
    );
  });

  it("recent-meetings with no params sends a bare URL", async () => {
    const { client, fetchFn } = clientWith(jsonResponse(envelope()));
    await client.recentMeetings();
    expect(calledUrl(fetchFn)).toBe("/surface/woven-boulder/api/recent-meetings");
  });

  it("meeting-transcript carries path + 1-based page", async () => {
    const { client, fetchFn } = clientWith(
      jsonResponse(envelope([{ page: 2, totalPages: 6, transcript: "x" }])),
    );
    await client.meetingTranscript("Boulder Civics/X/Y", 2);
    const url = calledUrl(fetchFn);
    expect(url).toContain("/api/meeting-transcript?");
    expect(url).toContain("path=Boulder+Civics%2FX%2FY");
    expect(url).toContain("page=2");
  });

  it("issues uses the lead_body param spelling", async () => {
    const { client, fetchFn } = clientWith(jsonResponse(envelope()));
    await client.issues({ lead_body: "city-council", status: "in-progress" });
    expect(calledUrl(fetchFn)).toBe(
      "/surface/woven-boulder/api/issues?status=in-progress&lead_body=city-council",
    );
  });

  it("search forwards q/scope/body/limit", async () => {
    const { client, fetchFn } = clientWith(jsonResponse(envelope()));
    await client.search({ q: "housing fee", scope: "meetings", body: "city-council", limit: 30 });
    expect(calledUrl(fetchFn)).toBe(
      "/surface/woven-boulder/api/search?q=housing+fee&scope=meetings&body=city-council&limit=30",
    );
  });

  it("topic-feed forwards topic + limit", async () => {
    const { client, fetchFn } = clientWith(jsonResponse(envelope()));
    await client.topicFeed("land-use", 50);
    expect(calledUrl(fetchFn)).toBe(
      "/surface/woven-boulder/api/topic-feed?topic=land-use&limit=50",
    );
  });
});

describe("envelope unwrapping", () => {
  it("list endpoints return items", async () => {
    const items = [{ name: "City Council", slug: "city-council" }];
    const { client } = clientWith(jsonResponse(envelope(items)));
    expect(await client.listBodies()).toEqual(items);
  });

  it("detail endpoints return the single item", async () => {
    const brief = { path: "p", summary: "s", summarySource: "ai-summary" };
    const { client } = clientWith(jsonResponse(envelope([brief])));
    expect(await client.meetingBrief("p")).toEqual(brief);
  });

  it("a detail envelope with zero items is treated as not found", async () => {
    const { client } = clientWith(jsonResponse(envelope([])));
    await expect(client.issueDetail("p")).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("error shapes", () => {
  it("404 {error:not_found} → NotFoundError (gated == missing)", async () => {
    const { client } = clientWith(jsonResponse({ error: "not_found" }, 404));
    await expect(client.meetingBrief("Secret/Path")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("400 invalid_params → InvalidParamsError with the issues array", async () => {
    const issues = [{ param: "type", message: "must be one of: regular, …" }];
    const { client } = clientWith(jsonResponse({ error: "invalid_params", issues }, 400));
    const err = await client.recentMeetings({ type: "bogus" }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(InvalidParamsError);
    expect((err as InvalidParamsError).issues).toEqual(issues);
    expect((err as InvalidParamsError).message).toContain("type");
  });

  it("other non-2xx → ApiError with status", async () => {
    const { client } = clientWith(new Response("upstream broke", { status: 502 }));
    const err = await client.domains().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).not.toBeInstanceOf(NotFoundError);
    expect((err as ApiError).status).toBe(502);
  });

  it("a plain 404 without the contract body is still an ApiError, not NotFound", async () => {
    const { client } = clientWith(new Response("nope", { status: 404 }));
    const err = await client.listBodies().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).not.toBeInstanceOf(NotFoundError);
  });
});
