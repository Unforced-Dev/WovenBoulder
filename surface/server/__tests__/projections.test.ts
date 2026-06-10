/**
 * Per-projection units against the COMPOSED backend (real router, real
 * kit pipeline, fixture vault): happy paths for all nine projections,
 * param validation (bad enums / ranges → the kit's 400 shape), the
 * kebab/underscore issue-field tolerance, transcript pagination, and
 * detail-404 semantics.
 */

import { beforeAll, describe, expect, test } from "bun:test";
import type { SurfaceBackend } from "@openparachute/surface";
import {
  ALL_FIXTURES,
  FIXTURE_TRANSCRIPT_PAGES,
  KNOWN_EMAIL,
  SUMMARY_MARKER,
  TRANSCRIPT_MARKER,
  issueNew,
  issueOld,
  mtgBoth,
  mtgSummaryOnly,
  mtgTranscriptOnly,
} from "./fixtures.ts";
import { get, makeBackend } from "./helpers.ts";
import { metaString } from "../vocab.ts";

let backend: SurfaceBackend;

beforeAll(async () => {
  ({ backend } = await makeBackend(ALL_FIXTURES));
});

async function okJson(res: Response): Promise<{ projection: string; count: number; items: any[] }> {
  expect(res.status).toBe(200);
  return (await res.json()) as { projection: string; count: number; items: any[] };
}

describe("list-bodies", () => {
  test("returns one entry per Overview note with schedule + count", async () => {
    const data = await okJson(await get(backend, "/api/list-bodies"));
    expect(data.count).toBe(2);
    const cc = data.items.find((b) => b.slug === "city-council");
    expect(cc).toBeDefined();
    expect(cc.name).toBe("City Council");
    expect(cc.meetingSchedule).toContain("Thursdays");
    expect(cc.cityUrl).toContain("bouldercolorado.gov");
    // 3 public city-council meetings in the fixtures (m-both, m-summary, m-old);
    // the operations-tagged one must NOT count.
    expect(cc.meetingCount).toBe(3);
    const pb = data.items.find((b) => b.slug === "planning-board");
    expect(pb.meetingCount).toBe(1);
  });

  test("non-Overview reference notes (member rosters) are excluded", async () => {
    const data = await okJson(await get(backend, "/api/list-bodies"));
    expect(data.items.map((b) => b.path)).not.toContain("Boulder Civics/City Council/Members 2026");
  });

  test("emails in Overview metadata are stripped", async () => {
    const res = await get(backend, "/api/list-bodies");
    expect(await res.text()).not.toContain(KNOWN_EMAIL);
  });
});

describe("recent-meetings", () => {
  test("newest first, metadata cards only — never content", async () => {
    const data = await okJson(await get(backend, "/api/recent-meetings"));
    expect(data.items.map((m) => m.date)).toEqual(["2026-05-01", "2026-04-23", "2026-03-10", "2025-01-15"]);
    const body = JSON.stringify(data);
    expect(body).not.toContain(SUMMARY_MARKER);
    expect(body).not.toContain(TRANSCRIPT_MARKER);
  });

  test("hasSummary / hasTranscript flags from tags", async () => {
    const data = await okJson(await get(backend, "/api/recent-meetings"));
    const both = data.items.find((m) => m.path === mtgBoth.path);
    expect(both.hasSummary).toBe(true);
    expect(both.hasTranscript).toBe(true);
    const tOnly = data.items.find((m) => m.path === mtgTranscriptOnly.path);
    expect(tOnly.hasSummary).toBe(false);
    expect(tOnly.hasTranscript).toBe(true);
  });

  test("body filter narrows to one body", async () => {
    const data = await okJson(await get(backend, "/api/recent-meetings?body=planning-board"));
    expect(data.items.map((m) => m.path)).toEqual([mtgTranscriptOnly.path]);
  });

  test("type filter rides the INDEXED meeting_type vault query", async () => {
    // Fresh backend so the wire-query log is isolated to this call.
    const { backend: b, t } = await makeBackend(ALL_FIXTURES);
    const data = await okJson(await get(b, "/api/recent-meetings?type=study-session"));
    expect(data.items.map((m) => m.path)).toEqual([mtgSummaryOnly.path]);
    // The filter must reach the vault as meta[meeting_type][eq] — never a
    // backend-side scan of kebab metadata.
    const indexed = t.vault.queryInputs.filter(
      (q) =>
        !(q instanceof URLSearchParams) &&
        JSON.stringify((q as { metadata?: unknown }).metadata) ===
          JSON.stringify({ meeting_type: { eq: "study-session" } }),
    );
    expect(indexed.length).toBeGreaterThan(0);
  });

  test("meeting_type dual-read: cards prefer meeting_type, fall back to the kebab straggler key", async () => {
    const data = await okJson(await get(backend, "/api/recent-meetings"));
    // Migrated note: value from the indexed meeting_type key.
    const migrated = data.items.find((m) => m.path === mtgSummaryOnly.path);
    expect(migrated.meetingType).toBe("study-session");
    // Kebab-only straggler: value still projects via the fallback read.
    const straggler = data.items.find((m) => m.path === mtgTranscriptOnly.path);
    expect(straggler.meetingType).toBe("regular");
  });

  test("dual-read preference: meeting_type wins when both keys are present", () => {
    const note = {
      id: "x",
      createdAt: "2026-01-01T00:00:00Z",
      metadata: { meeting_type: "special", "meeting-type": "regular" },
    };
    expect(metaString(note, "meeting_type")).toBe("special");
  });

  test("indexed type filter does NOT match the kebab-only straggler (documented)", async () => {
    const data = await okJson(await get(backend, "/api/recent-meetings?type=regular"));
    const paths = data.items.map((m) => m.path);
    expect(paths).toContain(mtgBoth.path); // migrated regular
    expect(paths).not.toContain(mtgTranscriptOnly.path); // straggler invisible to the filter
  });

  test("from/to date range is inclusive", async () => {
    const data = await okJson(
      await get(backend, "/api/recent-meetings?from=2026-04-23&to=2026-05-01"),
    );
    expect(data.items.map((m) => m.date)).toEqual(["2026-05-01", "2026-04-23"]);
  });

  test("limit caps the result", async () => {
    const data = await okJson(await get(backend, "/api/recent-meetings?limit=1"));
    expect(data.count).toBe(1);
  });

  test("bad body enum → 400 with a per-param issue", async () => {
    const res = await get(backend, "/api/recent-meetings?body=shadow-council");
    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string; issues: Array<{ param: string }> };
    expect(data.error).toBe("invalid_params");
    expect(data.issues[0]?.param).toBe("body");
  });

  test("bad type enum → 400", async () => {
    const res = await get(backend, "/api/recent-meetings?type=secret-session");
    expect(res.status).toBe(400);
  });

  test("limit out of range → 400; in-range passes", async () => {
    expect((await get(backend, "/api/recent-meetings?limit=51")).status).toBe(400);
    expect((await get(backend, "/api/recent-meetings?limit=0")).status).toBe(400);
    expect((await get(backend, "/api/recent-meetings?limit=50")).status).toBe(200);
  });

  test("malformed date param → the kit's 400 (type validation)", async () => {
    const res = await get(backend, "/api/recent-meetings?from=not-a-date");
    expect(res.status).toBe(400);
  });

  test("unknown param → the kit's 400 (strict params)", async () => {
    const res = await get(backend, "/api/recent-meetings?bdy=city-council");
    expect(res.status).toBe(400);
  });
});

describe("meeting-brief", () => {
  test("emits ONLY the summary section + related issues", async () => {
    const data = await okJson(
      await get(backend, `/api/meeting-brief?path=${encodeURIComponent(mtgBoth.path ?? "")}`),
    );
    const item = data.items[0];
    expect(item.summary).toContain(SUMMARY_MARKER);
    expect(item.summarySource).toBe("ai-summary");
    expect(JSON.stringify(data)).not.toContain(TRANSCRIPT_MARKER);
    expect(item.relatedIssues).toEqual([
      { path: issueNew.path, title: "East Boulder Sub-Community Plan" },
    ]);
    expect(JSON.stringify(item)).not.toContain(KNOWN_EMAIL);
  });

  test("falls back to pre-transcript content when no summary section", async () => {
    const data = await okJson(
      await get(backend, `/api/meeting-brief?path=${encodeURIComponent(mtgTranscriptOnly.path ?? "")}`),
    );
    const item = data.items[0];
    expect(item.summarySource).toBe("fallback");
    expect(item.summary).toContain("preamble paragraph");
    expect(item.summary).not.toContain("[0:00]");
  });

  test("missing note → 404 (not an empty 200)", async () => {
    const res = await get(backend, "/api/meeting-brief?path=Boulder%20Civics%2FNope");
    expect(res.status).toBe(404);
    expect(((await res.json()) as { error: string }).error).toBe("not_found");
  });

  test("missing required param → 400", async () => {
    expect((await get(backend, "/api/meeting-brief")).status).toBe(400);
  });
});

describe("meeting-transcript", () => {
  const path = encodeURIComponent(mtgBoth.path ?? "");

  test("paginates the transcript section into ~10KB pages", async () => {
    const p1 = (await okJson(await get(backend, `/api/meeting-transcript?path=${path}`))).items[0];
    expect(p1.totalPages).toBe(FIXTURE_TRANSCRIPT_PAGES);
    expect(p1.page).toBe(1);
    expect(p1.transcript).toContain("[0:00]");
    expect(p1.transcript).not.toContain(SUMMARY_MARKER);

    const p3 = (await okJson(await get(backend, `/api/meeting-transcript?path=${path}&page=3`)))
      .items[0];
    expect(p3.page).toBe(3);
    expect(p3.transcript).not.toBe(p1.transcript);
  });

  test("page past the end clamps to the last page", async () => {
    const item = (await okJson(await get(backend, `/api/meeting-transcript?path=${path}&page=99`)))
      .items[0];
    expect(item.page).toBe(FIXTURE_TRANSCRIPT_PAGES);
  });

  test("page 0 → 400", async () => {
    expect((await get(backend, `/api/meeting-transcript?path=${path}&page=0`)).status).toBe(400);
  });

  test("summary-only meeting → totalPages 0, empty transcript", async () => {
    const item = (
      await okJson(
        await get(
          backend,
          `/api/meeting-transcript?path=${encodeURIComponent(mtgSummaryOnly.path ?? "")}`,
        ),
      )
    ).items[0];
    expect(item.totalPages).toBe(0);
    expect(item.transcript).toBe("");
  });

  test("missing note → 404", async () => {
    expect((await get(backend, "/api/meeting-transcript?path=nope")).status).toBe(404);
  });
});

describe("issues", () => {
  test("lists all public issues with prose summaries and meeting counts", async () => {
    const data = await okJson(await get(backend, "/api/issues"));
    expect(data.count).toBe(3);
    const east = data.items.find((i) => i.path === issueNew.path);
    expect(east.name).toBe("East Boulder Sub-Community Plan");
    expect(east.status).toBe("in-progress");
    expect(east.summary).toContain("rezones East Boulder");
    expect(east.relatedMeetingCount).toBe(1);
  });

  test("old-style kebab metadata still resolves (lead-body → leadBody)", async () => {
    const data = await okJson(await get(backend, "/api/issues"));
    const old = data.items.find((i) => i.path === issueOld.path);
    expect(old.name).toBe("990 Arapahoe Redevelopment"); // falls back to path segment
    expect(old.leadBody).toBe("City Council"); // read from the kebab key
    expect(old.status).toBe("ongoing");
  });

  test("lead_body filter matches across key spelling AND value casing", async () => {
    const data = await okJson(await get(backend, "/api/issues?lead_body=city-council"));
    expect(data.items.map((i) => i.path)).toEqual([issueOld.path]);
  });

  test("status filter", async () => {
    const data = await okJson(await get(backend, "/api/issues?status=archived"));
    expect(data.items.map((i) => i.name)).toEqual(["Old Library Annex"]);
  });

  test("domain filter (normalized value compare)", async () => {
    const data = await okJson(await get(backend, "/api/issues?domain=land-use"));
    expect(data.items.map((i) => i.path)).toEqual([issueNew.path]);
  });

  test("bad status enum → 400", async () => {
    const res = await get(backend, "/api/issues?status=zombie");
    expect(res.status).toBe(400);
    const data = (await res.json()) as { issues: Array<{ param: string }> };
    expect(data.issues[0]?.param).toBe("status");
  });
});

describe("issue-detail", () => {
  test("full content + resolved related meetings with dates/bodies", async () => {
    const data = await okJson(
      await get(backend, `/api/issue-detail?path=${encodeURIComponent(issueNew.path ?? "")}`),
    );
    const item = data.items[0];
    expect(item.content).toContain("FORM-BASED-CODE-MARKER");
    expect(item.relatedMeetings).toEqual([
      {
        path: mtgBoth.path,
        title: "2026-04-23 City Council Regular Meeting",
        date: "2026-04-23",
        body: "city-council",
      },
    ]);
  });

  test("missing → 404", async () => {
    expect((await get(backend, "/api/issue-detail?path=nope")).status).toBe(404);
  });
});

describe("domains", () => {
  test("the domain notes with blurbs and issue links", async () => {
    const data = await okJson(await get(backend, "/api/domains"));
    expect(data.count).toBe(2);
    const land = data.items.find((d) => d.slug === "land-use");
    expect(land.name).toBe("Land Use");
    expect(land.blurb).toContain("Zoning");
    expect(land.issues).toEqual([
      { path: issueNew.path, name: "East Boulder Sub-Community Plan" },
    ]);
  });
});

describe("search", () => {
  test("full-text hit returns path/tags/date/snippet — never full content", async () => {
    const data = await okJson(await get(backend, "/api/search?q=linkage%20fee"));
    expect(data.count).toBe(1);
    const hit = data.items[0];
    expect(hit.path).toBe(mtgBoth.path);
    expect(hit.snippet).toContain("linkage fee");
    expect(Buffer.byteLength(hit.snippet, "utf8")).toBeLessThanOrEqual(300);
    expect(JSON.stringify(data)).not.toContain(TRANSCRIPT_MARKER.repeat(2));
  });

  test("scope=issues narrows to issue notes", async () => {
    const data = await okJson(await get(backend, "/api/search?q=Boulder&scope=issues"));
    for (const item of data.items) expect(item.tags).toContain("issue");
  });

  test("body filter narrows search", async () => {
    const data = await okJson(await get(backend, "/api/search?q=Planning&body=planning-board"));
    for (const item of data.items) expect(item.tags).toContain("planning-board");
  });

  test("bad scope enum → 400; missing q → 400", async () => {
    expect((await get(backend, "/api/search?q=x&scope=everything")).status).toBe(400);
    expect((await get(backend, "/api/search")).status).toBe(400);
  });
});

describe("topic-feed", () => {
  test("meetings then issues for the topic, each marked by kind", async () => {
    const data = await okJson(await get(backend, "/api/topic-feed?topic=land-use"));
    const kinds = data.items.map((i) => i.kind);
    // meetings first (m-summary 2026-05-01, m-both 2026-04-23), then the issue
    expect(kinds).toEqual(["meeting", "meeting", "issue"]);
    expect(data.items[2].path).toBe(issueNew.path);
  });

  test("bad topic enum → 400", async () => {
    const res = await get(backend, "/api/topic-feed?topic=astrology");
    expect(res.status).toBe(400);
  });

  test("topic without notes → empty 200 (a list, not a detail)", async () => {
    const data = await okJson(await get(backend, "/api/topic-feed?topic=water"));
    expect(data.count).toBe(0);
  });
});
