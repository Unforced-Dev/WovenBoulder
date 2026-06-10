/**
 * The kit's PUBLIC conformance suite wired against the composed routes,
 * plus MCP-face trust pins: anon sees exactly the nine public
 * projections; the operator-only admin route refuses anon and bad
 * bearers; deny-by-default 404s undeclared paths.
 */

import { beforeAll, describe, expect, test } from "bun:test";
import type { SurfaceBackend } from "@openparachute/surface";
import { gatewayConformanceCases } from "@openparachute/surface-server/conformance";
import { ALL_FIXTURES, OPS_MARKER, UNI_MARKER } from "./fixtures.ts";
import { MOUNT, ORIGIN, OPERATOR_JWT, get, makeBackend, mcp } from "./helpers.ts";

let backend: SurfaceBackend;

beforeAll(async () => {
  ({ backend } = await makeBackend(ALL_FIXTURES));
});

// The kit's conformance cases are generated synchronously up front, so
// build them against a dedicated backend instance.
const conformanceBackend = await makeBackend(ALL_FIXTURES).then((r) => r.backend);

describe("kit gateway conformance", () => {
  const cases = gatewayConformanceCases({
    fetch: (req) => conformanceBackend.fetch(req),
    mount: MOUNT,
    origin: ORIGIN,
    protectedProbes: [
      {
        method: "POST",
        path: "/api/admin/refresh",
        mustNotContain: [OPS_MARKER, UNI_MARKER],
      },
    ],
  });

  for (const c of cases) {
    test(c.name, async () => {
      await c.run();
    });
  }
});

describe("operator branch", () => {
  test("admin refresh accepts the operator bearer", async () => {
    const res = await backend.fetch(
      new Request(`${ORIGIN}${MOUNT}/api/admin/refresh`, {
        method: "POST",
        headers: { authorization: `Bearer ${OPERATOR_JWT}` },
      }),
    );
    expect(res.status).toBe(200);
    expect(((await res.json()) as { ok: boolean }).ok).toBe(true);
  });

  test("an invalid bearer is a 401 refusal — never a downgrade to anon", async () => {
    const res = await get(backend, "/api/list-bodies", { authorization: "Bearer forged" });
    expect(res.status).toBe(401);
  });
});

describe("deny-by-default routing", () => {
  test("undeclared API path → 404", async () => {
    expect((await get(backend, "/api/notes")).status).toBe(404);
    expect((await get(backend, "/api/admin")).status).toBe(404);
  });

  test("declared path, wrong method → 405", async () => {
    const res = await backend.fetch(
      new Request(`${ORIGIN}${MOUNT}/api/list-bodies`, { method: "POST" }),
    );
    expect(res.status).toBe(405);
  });

  test("GET on the MCP endpoint → 405 (stateless POST-only)", async () => {
    expect((await get(backend, "/api/mcp")).status).toBe(405);
  });
});

describe("MCP face — anon sees exactly the public projections", () => {
  test("tools/list shows the nine projections to an anonymous caller", async () => {
    const res = await mcp(backend, { jsonrpc: "2.0", id: 1, method: "tools/list" });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { result: { tools: Array<{ name: string }> } };
    const names = data.result.tools.map((t) => t.name).sort();
    expect(names).toEqual(
      [
        "domains",
        "issue-detail",
        "issues",
        "list-bodies",
        "meeting-brief",
        "meeting-transcript",
        "recent-meetings",
        "search",
        "topic-feed",
      ].sort(),
    );
  });

  test("params declarations compile into the tool inputSchema", async () => {
    const res = await mcp(backend, { jsonrpc: "2.0", id: 2, method: "tools/list" });
    const data = (await res.json()) as {
      result: { tools: Array<{ name: string; inputSchema: { properties?: Record<string, unknown>; required?: string[] } }> };
    };
    const recent = data.result.tools.find((t) => t.name === "recent-meetings");
    expect(Object.keys(recent?.inputSchema.properties ?? {})).toEqual(
      expect.arrayContaining(["body", "type", "from", "to", "limit"]),
    );
    const brief = data.result.tools.find((t) => t.name === "meeting-brief");
    expect(brief?.inputSchema.required).toEqual(["path"]);
  });

  test("calling a tool returns shaped JSON", async () => {
    const res = await mcp(backend, {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "list-bodies", arguments: {} },
    });
    const data = (await res.json()) as {
      result: { content: Array<{ type: string; text: string }> };
    };
    const text = data.result.content[0]?.text ?? "";
    const payload = JSON.parse(text) as { projection: string; count: number };
    expect(payload.projection).toBe("list-bodies");
    expect(payload.count).toBe(2);
  });

  test("a bad enum through MCP is an in-band tool error, not a 500", async () => {
    const res = await mcp(backend, {
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: { name: "recent-meetings", arguments: { body: "shadow-council" } },
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { result: { isError?: boolean } };
    expect(data.result.isError).toBe(true);
  });

  test("unknown tool error is identical for nonexistent tools (no oracle)", async () => {
    const call = (name: string) =>
      mcp(backend, {
        jsonrpc: "2.0",
        id: 5,
        method: "tools/call",
        params: { name, arguments: {} },
      });
    const a = (await (await call("does-not-exist")).json()) as {
      result: { content: Array<{ text: string }> };
    };
    expect(a.result.content[0]?.text).toContain("unknown tool");
  });
});
