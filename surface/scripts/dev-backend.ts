/**
 * Local dev backend for the frontend (surface/web) — serves the REAL
 * backend (gate, projections, router) over either:
 *
 *   - constructed fixtures (default — never touches the live vault):
 *       bun scripts/dev-backend.ts
 *   - the live boulder vault, READ-ONLY, env-gated like live-smoke:
 *       LIVE_DEV=1 bun scripts/dev-backend.ts
 *     (mints an ephemeral `vault:boulder:read` token via the parachute
 *     CLI; requires the local hub)
 *
 * Then run `bun run dev` in surface/web — Vite proxies
 * /surface/woven-boulder/api/* here (port 8787, or PORT).
 */

import type { SurfaceHostContext } from "@openparachute/surface";
import { SurfaceStateStore } from "@openparachute/surface";
import { VaultClient } from "@openparachute/surface-client/vault-client";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { buildBackend } from "../server/index.ts";
import { makeBackend } from "../server/__tests__/helpers.ts";
import { ALL_FIXTURES } from "../server/__tests__/fixtures.ts";

const PORT = Number(process.env.PORT ?? 8787);
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
  const token = out.trim().split("\n").pop()?.trim();
  if (token === undefined || token.length === 0) throw new Error("mint-token produced no token");
  return token;
}

let backendFetch: (req: Request) => Promise<Response> | Response;
let mode: string;

if (process.env.LIVE_DEV === "1") {
  mode = "LIVE boulder vault (read-only ephemeral token)";
  const hubOrigin = process.env.PARACHUTE_HUB_ORIGIN ?? "http://127.0.0.1:1939";
  const token = await mintToken();
  const vault = VaultClient.fromHub({
    hubOrigin,
    vaultName: "boulder",
    tokenProvider: () => token,
  });
  const dir = mkdtempSync(path.join(tmpdir(), "woven-boulder-dev-"));
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
  backendFetch = backend.fetch;
} else {
  mode = "constructed fixtures (no vault access)";
  const { backend } = await makeBackend(ALL_FIXTURES);
  backendFetch = backend.fetch;
}

Bun.serve({
  port: PORT,
  fetch: (req) => backendFetch(req),
});

console.log(`woven-boulder dev backend on http://localhost:${PORT}${MOUNT}/api/…`);
console.log(`  mode: ${mode}`);
console.log(`  try:  curl http://localhost:${PORT}${MOUNT}/api/list-bodies`);
