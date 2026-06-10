/**
 * Woven Boulder frontend build.
 *
 * - `base` is the surface's mount path (meta.json `path` + trailing
 *   slash): the host serves dist/ at that prefix with SPA fallback, so
 *   absolute asset URLs keep working on deep links like
 *   /surface/woven-boulder/meetings/city-council/2026-04-23.
 * - `build.outDir` is the surface package's dist/ — the bundle the host
 *   registers and serves (committed; see surface/.gitignore).
 * - Dev: `vite` proxies `${MOUNT}api/*` to a local backend — by default
 *   the fixtures dev server (`bun scripts/dev-backend.ts`, port 8787);
 *   point WB_BACKEND_ORIGIN elsewhere to ride a real mount.
 */
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

const MOUNT = "/surface/woven-boulder/";

export default defineConfig({
  base: MOUNT,
  plugins: [react()],
  build: {
    outDir: "../dist",
    emptyOutDir: true,
  },
  server: {
    proxy: {
      [`${MOUNT}api`]: {
        target: process.env.WB_BACKEND_ORIGIN ?? "http://localhost:8787",
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/__tests__/setup.ts"],
  },
});
