/**
 * The publicness gate + output hygiene, unit-level: the deny-by-default
 * predicate, the email strip (with a positive control), the gated vault
 * wrapper's filtering, and the `$` query extensions.
 */

import { describe, expect, test } from "bun:test";
import type { Note } from "@openparachute/surface-client";
import {
  createGatedVault,
  noteIsPublic,
  sanitizeNote,
  stripEmails,
  type GatedQuery,
} from "../gate.ts";
import {
  ALL_FIXTURES,
  KNOWN_EMAIL,
  mtgBoth,
  mtgOld,
  mtgSummaryOnly,
  poisonNoType,
  poisonOps,
  poisonPathless,
  poisonUni,
} from "./fixtures.ts";
import { FakeVault } from "./helpers.ts";

describe("noteIsPublic — deny by default", () => {
  test("a conforming meeting note passes", () => {
    expect(noteIsPublic(mtgBoth)).toBe(true);
  });

  test("operations-tagged note is invisible (denylist beats allowlist + path)", () => {
    expect(noteIsPublic(poisonOps)).toBe(false);
  });

  test("pathless note is invisible", () => {
    expect(noteIsPublic(poisonPathless)).toBe(false);
  });

  test("note outside Boulder Civics/ is invisible", () => {
    expect(noteIsPublic(poisonUni)).toBe(false);
  });

  test("note with no allowlisted content-type tag is invisible", () => {
    expect(noteIsPublic(poisonNoType)).toBe(false);
  });

  test("note with no tags at all is invisible", () => {
    expect(noteIsPublic({ path: "Boulder Civics/X", tags: [] })).toBe(false);
    expect(noteIsPublic({ path: "Boulder Civics/X" })).toBe(false);
  });

  test("every denylist tag individually poisons an otherwise-public note", () => {
    for (const bad of ["operations", "meta", "templates", "automation", "data-sources", "research"]) {
      expect(noteIsPublic({ path: "Boulder Civics/X", tags: ["meeting-summary", bad] })).toBe(false);
    }
  });
});

describe("stripEmails", () => {
  test("strips a known email from text", () => {
    const out = stripEmails(`Contact ${KNOWN_EMAIL} for details`);
    expect(out).not.toContain(KNOWN_EMAIL);
    expect(out).toContain("[email removed]");
  });

  test("positive control: text without an email is unchanged", () => {
    const s = "Council meets Thursdays at 6 PM @ the Penfield Tate II building.";
    expect(stripEmails(s)).toBe(s);
  });

  test("strips multiple and embedded addresses", () => {
    const out = stripEmails("a.b+tag@x.example.org and c_d@sub.domain.co end");
    expect(out).not.toMatch(/@[a-z]/i);
  });
});

describe("sanitizeNote", () => {
  test("strips emails from content and metadata values", () => {
    const clean = sanitizeNote(mtgBoth);
    expect(JSON.stringify(clean)).not.toContain(KNOWN_EMAIL);
  });

  test("drops links whose other end is not public", () => {
    const clean = sanitizeNote(mtgBoth);
    const targets = (clean.links ?? []).map((l) => l.targetId);
    expect(targets).toContain("i-new");
    expect(targets).not.toContain("p-ops");
  });

  test("drops links whose other end has no summary to verify (fail-closed)", () => {
    const note: Note = {
      ...mtgBoth,
      links: [{ sourceId: mtgBoth.id, targetId: "mystery", relationship: "references" }],
    };
    expect(sanitizeNote(note).links).toEqual([]);
  });

  test("does not mutate the input note", () => {
    const before = JSON.stringify(mtgBoth);
    sanitizeNote(mtgBoth);
    expect(JSON.stringify(mtgBoth)).toBe(before);
  });
});

describe("createGatedVault", () => {
  function gated() {
    const vault = new FakeVault();
    vault.seed(ALL_FIXTURES);
    return { vault, g: createGatedVault(vault) };
  }

  test("queryNotes filters non-public notes out of every result", async () => {
    const { g } = gated();
    const notes = await g.queryNotes({ tag: "meeting-summary" } satisfies GatedQuery);
    const ids = notes.map((n) => n.id);
    expect(ids).toContain(mtgBoth.id);
    expect(ids).not.toContain(poisonOps.id);
    expect(ids).not.toContain(poisonUni.id);
  });

  test("getNote returns null for non-public notes — same as missing", async () => {
    const { g } = gated();
    expect(await g.getNote(poisonOps.id)).toBeNull();
    expect(await g.getNote(poisonUni.id)).toBeNull();
    expect(await g.getNote(poisonPathless.id)).toBeNull();
    expect(await g.getNote("does-not-exist")).toBeNull();
    expect(await g.getNote(mtgBoth.id)).not.toBeNull();
  });

  test("metadata operator filters pass through to the wire (the indexed query path)", async () => {
    const { vault, g } = gated();
    const notes = await g.queryNotes({
      tag: "meeting-summary",
      metadata: { meeting_type: { eq: "study-session" } },
    } satisfies GatedQuery);
    expect(notes.map((n) => n.id)).toEqual([mtgSummaryOnly.id]);
    // The filter reached the vault query itself — not a backend-side scan.
    const sent = vault.queryInputs[0] as { metadata?: Record<string, unknown> };
    expect(sent.metadata).toEqual({ meeting_type: { eq: "study-session" } });
  });

  test("$dateFrom/$dateTo bound by the date metadata string (inclusive)", async () => {
    const { g } = gated();
    const notes = await g.queryNotes({
      tag: "meeting-summary",
      $dateFrom: "2026-01-01",
      $dateTo: "2026-04-23",
      $sortByDate: "desc",
    } satisfies GatedQuery);
    expect(notes.map((n) => n.id)).toEqual([mtgBoth.id, "m-transcript"]);
  });

  test("$sortByDate desc orders newest first; $take slices", async () => {
    const { g } = gated();
    const notes = await g.queryNotes({
      tag: "meeting-summary",
      $sortByDate: "desc",
      $take: 2,
    } satisfies GatedQuery);
    expect(notes.map((n) => n.id)).toEqual([mtgSummaryOnly.id, mtgBoth.id]);
  });

  test("$paginateAll walks pages and never leaks $-keys to the wire", async () => {
    const { vault, g } = gated();
    await g.queryNotes({ tag: "meeting-summary", $paginateAll: true } satisfies GatedQuery);
    for (const input of vault.queryInputs) {
      expect(Object.keys(input as Record<string, unknown>).some((k) => k.startsWith("$"))).toBe(false);
    }
  });

  test("date filter excludes old meetings", async () => {
    const { g } = gated();
    const notes = await g.queryNotes({
      tag: "meeting-summary",
      $dateFrom: "2026-01-01",
    } satisfies GatedQuery);
    expect(notes.map((n) => n.id)).not.toContain(mtgOld.id);
  });

  test("query results are email-stripped at the choke point", async () => {
    const { g } = gated();
    const notes = await g.queryNotes({
      tag: "reference",
      includeContent: true,
    } satisfies GatedQuery);
    expect(JSON.stringify(notes)).not.toContain(KNOWN_EMAIL);
  });
});
