/**
 * Section splitting + pagination math — the paths through which meeting
 * content is ALLOWED to leave the surface.
 */

import { describe, expect, test } from "bun:test";
import {
  SUMMARY_FALLBACK_BYTES,
  TRANSCRIPT_CHUNK_BYTES,
  chunkText,
  extractSummary,
  extractTranscript,
  firstProseParagraph,
  summaryFallback,
  truncateBytes,
} from "../sections.ts";
import { FIXTURE_TRANSCRIPT_PAGES, mtgBoth, mtgSummaryOnly, mtgTranscriptOnly } from "./fixtures.ts";

describe("section extraction", () => {
  test("note with both sections: summary excludes the transcript", () => {
    const summary = extractSummary(mtgBoth.content ?? "");
    expect(summary).not.toBeNull();
    expect(summary).toContain("linkage fee");
    expect(summary).not.toContain("[0:00]");
  });

  test("note with both sections: transcript excludes the summary", () => {
    const transcript = extractTranscript(mtgBoth.content ?? "");
    expect(transcript).not.toBeNull();
    expect(transcript).toContain("[0:00]");
    expect(transcript).not.toContain("linkage fee");
  });

  test("summary-only note: transcript is null", () => {
    expect(extractSummary(mtgSummaryOnly.content ?? "")).toContain("study session");
    expect(extractTranscript(mtgSummaryOnly.content ?? "")).toBeNull();
  });

  test("transcript-only note: summary is null", () => {
    expect(extractSummary(mtgTranscriptOnly.content ?? "")).toBeNull();
    expect(extractTranscript(mtgTranscriptOnly.content ?? "")).toContain("[0:00] Chair");
  });

  test("summary stops at the next H2 even when it isn't the transcript", () => {
    const content = "## AI-Generated Summary\n\nthe summary body\n\n## Decisions\n\nother section\n";
    const s = extractSummary(content);
    expect(s).toBe("the summary body");
  });
});

describe("summaryFallback", () => {
  test("takes content before the transcript, dropping the title line", () => {
    const fb = summaryFallback(mtgTranscriptOnly.content ?? "");
    expect(fb).toContain("preamble paragraph");
    expect(fb).not.toContain("# 2026-03-10");
    expect(fb).not.toContain("[0:00]");
  });

  test("caps at the fallback byte budget", () => {
    const long = `# Title\n\n${"x".repeat(10_000)}\n\n## Transcript\n\nbody`;
    const fb = summaryFallback(long);
    expect(Buffer.byteLength(fb, "utf8")).toBeLessThanOrEqual(SUMMARY_FALLBACK_BYTES);
  });
});

describe("truncateBytes", () => {
  test("never splits a multi-byte character", () => {
    const s = "ééééé"; // 2 bytes each
    const out = truncateBytes(s, 5);
    expect(Buffer.byteLength(out, "utf8")).toBeLessThanOrEqual(5);
    expect(out).toBe("éé");
  });
});

describe("chunkText — pagination math", () => {
  test("empty text → zero chunks", () => {
    expect(chunkText("")).toEqual([]);
    expect(chunkText("   \n  ")).toEqual([]);
  });

  test("text under one chunk → exactly one page", () => {
    expect(chunkText("hello\nworld")).toHaveLength(1);
  });

  test("every chunk fits the byte budget and nothing is lost", () => {
    const lines = Array.from({ length: 500 }, (_, i) => `line ${i} ${"pad".repeat(20)}`);
    const text = lines.join("\n");
    const chunks = chunkText(text, 1024);
    for (const c of chunks) {
      expect(Buffer.byteLength(c, "utf8")).toBeLessThanOrEqual(1024);
    }
    // Reassembling the chunks restores every line.
    expect(chunks.join("\n")).toBe(text);
    // Page count is the byte total divided by the budget, give or take
    // line-boundary slack: never fewer than the floor, never absurdly more.
    const totalBytes = Buffer.byteLength(text, "utf8");
    expect(chunks.length).toBeGreaterThanOrEqual(Math.floor(totalBytes / 1024));
    expect(chunks.length).toBeLessThanOrEqual(Math.ceil(totalBytes / 900) + 1);
  });

  test("a single oversize line is hard-split, all chunks within budget", () => {
    const text = "x".repeat(2500);
    const chunks = chunkText(text, 1024);
    expect(chunks.length).toBe(3);
    for (const c of chunks) {
      expect(Buffer.byteLength(c, "utf8")).toBeLessThanOrEqual(1024);
    }
    expect(chunks.join("")).toBe(text);
  });

  test("the fixture transcript (~52KB) paginates to 6 pages at 10KB", () => {
    const transcript = extractTranscript(mtgBoth.content ?? "");
    const bytes = Buffer.byteLength(transcript ?? "", "utf8");
    expect(bytes).toBeGreaterThan(5 * TRANSCRIPT_CHUNK_BYTES); // sanity: spans 6 pages
    const chunks = chunkText(transcript ?? "", TRANSCRIPT_CHUNK_BYTES);
    expect(chunks.length).toBe(FIXTURE_TRANSCRIPT_PAGES);
  });
});

describe("firstProseParagraph", () => {
  test("skips title and headings, returns the first paragraph", () => {
    const p = firstProseParagraph("# Title\n\n## Heading\n\nThe real paragraph.\n\nSecond.");
    expect(p).toBe("The real paragraph.");
  });

  test("skips list blocks", () => {
    const p = firstProseParagraph("# T\n\n- a list\n- items\n\nProse here.");
    expect(p).toBe("Prose here.");
  });

  test("empty content → empty string", () => {
    expect(firstProseParagraph("")).toBe("");
  });
});
