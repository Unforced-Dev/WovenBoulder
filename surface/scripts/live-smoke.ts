/**
 * Read-only live smoke against the REAL boulder vault — env-gated, never
 * part of the test suite.
 *
 *   LIVE_SMOKE=1 bun scripts/live-smoke.ts
 *
 * Mints an ephemeral read token via the parachute CLI
 * (`parachute auth mint-token --scope vault:boulder:read --ephemeral`),
 * builds the backend over a real vault client, and exercises each
 * projection once. Read-only by construction (the backend holds no
 * write paths and the token has read scope only).
 */

import { VaultClient } from "@openparachute/surface-client/vault-client";
import type { SurfaceHostContext } from "@openparachute/surface";
import { SurfaceStateStore } from "@openparachute/surface";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { buildBackend } from "../server/index.ts";

if (process.env.LIVE_SMOKE !== "1") {
  console.log("LIVE_SMOKE != 1 — skipping (this script hits the live vault).");
  process.exit(0);
}

const HUB_ORIGIN = process.env.PARACHUTE_HUB_ORIGIN ?? "http://127.0.0.1:1939";
const MOUNT = "/surface/woven-boulder";

async function mintToken(): Promise<string> {
  const proc = Bun.spawn(
    ["parachute", "auth", "mint-token", "--scope", "vault:boulder:read", "--ephemeral"],
    { stdout: "pipe", stderr: "pipe" },
  );
  const out = await new Response(proc.stdout).text();
  if ((await proc.exited) !== 0) {
    throw new Error(`mint-token failed: ${await new Response(proc.stderr).text()}`);
  }
  const lines = out.trim().split("\n");
  const token = lines[lines.length - 1]?.trim();
  if (!token) throw new Error("mint-token produced no token");
  return token;
}

const token = await mintToken();
const vault = VaultClient.fromHub({
  hubOrigin: HUB_ORIGIN,
  vaultName: "boulder",
  tokenProvider: () => token,
});

const dir = mkdtempSync(path.join(tmpdir(), "woven-boulder-smoke-"));
const controller = new AbortController();
const ctx: SurfaceHostContext = {
  vault: Object.assign(vault, { vaultName: "boulder" }) as unknown as SurfaceHostContext["vault"],
  store: new SurfaceStateStore(path.join(dir, "state.sqlite")),
  layer: () => "loopback",
  clientIp: () => null,
  config: { all: () => ({}), get: () => undefined },
  log: console,
  mount: MOUNT,
  shutdownSignal: controller.signal,
};

const backend = await buildBackend(ctx, { rateLimit: false });

const checks: Array<[string, (data: any) => boolean]> = [
  // 19 of the 21 bodies had an Overview note on 2026-06-10 (City Council
  // and joint-meeting carry none yet) — the floor tracks the live data.
  ["/api/list-bodies", (d) => d.count >= 19],
  ["/api/recent-meetings?limit=5", (d) => d.count === 5 && d.items.every((m: any) => !("content" in m))],
  // Positive control on the INDEXED meta[meeting_type][eq] filter: the live
  // vault has 192 study-sessions with city-council dominant, so zero results
  // would mean the indexed filter silently broke — not an empty category.
  [
    "/api/recent-meetings?body=city-council&type=study-session&limit=3",
    (d) =>
      d.count >= 1 &&
      d.count <= 3 &&
      d.items.every((m: any) => m.meetingType === "study-session"),
  ],
  ["/api/issues?limit=10", (d) => d.count > 0],
  ["/api/domains", (d) => d.count >= 10],
  ["/api/search?q=housing&limit=5", (d) => d.count > 0],
  ["/api/topic-feed?topic=land-use&limit=5", (d) => d.count > 0],
];

let failures = 0;
for (const [endpoint, check] of checks) {
  const res = await backend.fetch(new Request(`http://smoke.local${MOUNT}${endpoint}`));
  const body = await res.text();
  const emails = body.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g);
  let ok = res.status === 200;
  let note = "";
  if (ok) {
    try {
      ok = check(JSON.parse(body));
      if (!ok) note = "check predicate failed";
    } catch (e) {
      ok = false;
      note = `bad JSON: ${(e as Error).message}`;
    }
  } else {
    note = `status ${res.status}`;
  }
  if (emails) {
    ok = false;
    note += ` EMAIL LEAK: ${emails.slice(0, 3).join(", ")}`;
  }
  console.log(`${ok ? "ok  " : "FAIL"} ${endpoint} ${note}`);
  if (!ok) failures++;
}

// Detail round-trip: take the first recent meeting and fetch its brief +
// transcript page 1.
const recent = (await (
  await backend.fetch(new Request(`http://smoke.local${MOUNT}/api/recent-meetings?limit=1`))
).json()) as { items: Array<{ path: string }> };
const first = recent.items[0]?.path;
if (first) {
  for (const ep of [
    `/api/meeting-brief?path=${encodeURIComponent(first)}`,
    `/api/meeting-transcript?path=${encodeURIComponent(first)}`,
  ]) {
    const res = await backend.fetch(new Request(`http://smoke.local${MOUNT}${ep}`));
    const ok = res.status === 200;
    console.log(`${ok ? "ok  " : "FAIL"} ${ep.split("?")[0]} (live detail)`);
    if (!ok) failures++;
  }
}

await backend.shutdown?.();
controller.abort();
console.log(failures === 0 ? "\nLIVE SMOKE PASS" : `\nLIVE SMOKE: ${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
