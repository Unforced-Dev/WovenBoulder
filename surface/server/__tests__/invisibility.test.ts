/**
 * The publicness gate, hammered through EVERY projection: the four
 * poison fixtures (operations-tagged, pathless, Uni/-pathed, no
 * content-type tag) must be invisible through every list, every detail
 * (404 — identical to nonexistent), and search. Plus the email-strip
 * positive control: a fixture with a known address proves the scanner
 * saw the content AND the address is gone.
 */

import { beforeAll, describe, expect, test } from "bun:test";
import type { SurfaceBackend } from "@openparachute/surface";
import {
  ALL_FIXTURES,
  KNOWN_EMAIL,
  POISON_MARKERS,
  SUMMARY_MARKER,
  poisonOps,
  poisonPathless,
  poisonUni,
} from "./fixtures.ts";
import { get, makeBackend, mcp } from "./helpers.ts";

let backend: SurfaceBackend;

beforeAll(async () => {
  ({ backend } = await makeBackend(ALL_FIXTURES));
});

const LIST_ENDPOINTS = [
  "/api/list-bodies",
  "/api/recent-meetings",
  "/api/recent-meetings?body=city-council",
  "/api/issues",
  "/api/issues?status=proposed", // the pathless poison claims proposed
  "/api/domains",
  "/api/topic-feed?topic=housing", // poisonUni + poisonNoType carry housing
  "/api/search?q=MARKER",
  "/api/search?q=SECRET",
];

describe("poison notes are invisible in every list projection", () => {
  for (const endpoint of LIST_ENDPOINTS) {
    test(`no poison marker rides ${endpoint}`, async () => {
      const res = await get(backend, endpoint);
      expect(res.status).toBe(200);
      const body = await res.text();
      for (const marker of POISON_MARKERS) {
        expect(body).not.toContain(marker);
      }
      expect(body).not.toContain(poisonOps.id);
      expect(body).not.toContain("Uni/");
    });
  }

  test("recent-meetings on the poison's date window stays empty of it", async () => {
    const res = await get(backend, "/api/recent-meetings?from=2026-04-22&to=2026-04-22");
    const data = (await res.json()) as { count: number };
    expect(data.count).toBe(0); // the only 04-22 meeting is operations-tagged
  });
});

describe("poison notes 404 from every detail projection — same as nonexistent", () => {
  const detailEndpoints = (path: string) => [
    `/api/meeting-brief?path=${encodeURIComponent(path)}`,
    `/api/meeting-transcript?path=${encodeURIComponent(path)}`,
    `/api/issue-detail?path=${encodeURIComponent(path)}`,
  ];

  const poisons: Array<[string, string]> = [
    ["operations-tagged", poisonOps.path ?? ""],
    ["Uni/-pathed", poisonUni.path ?? ""],
    ["nonexistent (control)", "Boulder Civics/Does Not Exist"],
  ];

  for (const [label, path] of poisons) {
    for (const endpoint of detailEndpoints(path)) {
      test(`${label} → 404 at ${endpoint.split("?")[0]}`, async () => {
        const res = await get(backend, endpoint);
        expect(res.status).toBe(404);
        // The refusal body is byte-identical to the missing-note refusal —
        // no existence oracle.
        expect(await res.text()).toBe(JSON.stringify({ error: "not_found" }));
      });
    }
  }

  test("pathless poison unreachable by id through detail projections", async () => {
    const res = await get(
      backend,
      `/api/issue-detail?path=${encodeURIComponent(poisonPathless.id)}`,
    );
    expect(res.status).toBe(404);
  });
});

describe("poison notes are invisible through the MCP face", () => {
  test("an MCP recent-meetings call carries no poison marker", async () => {
    const res = await mcp(backend, {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "recent-meetings", arguments: {} },
    });
    const body = await res.text();
    for (const marker of POISON_MARKERS) expect(body).not.toContain(marker);
  });

  test("an MCP issues call carries no poison marker", async () => {
    const res = await mcp(backend, {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { name: "issues", arguments: {} },
    });
    const body = await res.text();
    for (const marker of POISON_MARKERS) expect(body).not.toContain(marker);
  });
});

describe("email strip — positive control", () => {
  test("the meeting brief that CONTAINS the known email emits its summary without it", async () => {
    const res = await get(
      backend,
      `/api/meeting-brief?path=${encodeURIComponent(
        "Boulder Civics/City Council/Meetings/2026-04-23 City Council Regular Meeting",
      )}`,
    );
    expect(res.status).toBe(200);
    const body = await res.text();
    // Positive control: the summary marker proves we read the real content…
    expect(body).toContain(SUMMARY_MARKER);
    // …and the email that sits in the SAME sentence is gone.
    expect(body).not.toContain(KNOWN_EMAIL);
    expect(body).toContain("[email removed]");
  });

  test("no projection output anywhere contains an email address", async () => {
    for (const endpoint of LIST_ENDPOINTS) {
      const body = await (await get(backend, endpoint)).text();
      expect(body).not.toMatch(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
    }
  });
});
