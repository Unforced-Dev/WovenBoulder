import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// RTL's automatic cleanup hooks the global afterEach, which we don't
// expose (vitest globals are off) — register it explicitly.
afterEach(() => {
  cleanup();
});
