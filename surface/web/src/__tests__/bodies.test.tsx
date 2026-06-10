/**
 * /bodies index: the page must list ALL 21 known bodies even though
 * list-bodies only returns those with Overview notes (City Council and
 * joint-meeting have none today — City Council is the largest archive
 * and must stay browsable).
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Bodies, mergeKnownBodies } from "../pages/Bodies.tsx";
import { ClientProvider } from "../api/context.tsx";
import type { WovenBoulderClient } from "../api/client.ts";
import type { BodyInfo } from "../api/types.ts";
import { BODY_TAGS } from "../lib/vocab.ts";

function profile(overrides: Partial<BodyInfo> & Pick<BodyInfo, "slug" | "name">): BodyInfo {
  return {
    path: `Boulder Civics/${overrides.name}/Overview`,
    meetingSchedule: null,
    cityUrl: null,
    youtubePlaylist: null,
    meetingCount: 0,
    ...overrides,
  };
}

const PROFILES: BodyInfo[] = [
  profile({ slug: "planning-board", name: "Planning Board", meetingCount: 100 }),
  profile({ slug: "landmarks-board", name: "Landmarks Board", meetingCount: 68 }),
];

describe("mergeKnownBodies", () => {
  it("unions the 21 known slugs over the returned profiles", () => {
    const merged = mergeKnownBodies(PROFILES);
    expect(merged).toHaveLength(BODY_TAGS.length);
    const slugs = merged.map((b) => b.slug);
    for (const slug of BODY_TAGS) expect(slugs).toContain(slug);
  });

  it("pins City Council first even without a profile, then sorts by archive size", () => {
    const merged = mergeKnownBodies(PROFILES);
    expect(merged[0]?.slug).toBe("city-council");
    expect(merged[0]?.name).toBe("City Council");
    expect(merged[0]?.meetingCount).toBeNull();
    // Profiled bodies follow, largest archive first.
    expect(merged[1]?.slug).toBe("planning-board");
    expect(merged[2]?.slug).toBe("landmarks-board");
    // Un-profiled bodies trail, alphabetical.
    const tail = merged.slice(3).map((b) => b.name);
    expect(tail).toEqual([...tail].sort((a, b) => a.localeCompare(b)));
  });

  it("keeps unrecognized profiles (no usable slug) as unlinked extras", () => {
    const merged = mergeKnownBodies([
      ...PROFILES,
      profile({ slug: null, name: "Mystery Committee" }),
    ]);
    expect(merged).toHaveLength(BODY_TAGS.length + 1);
    expect(merged[merged.length - 1]?.name).toBe("Mystery Committee");
  });
});

describe("Bodies page", () => {
  it("renders a linked City Council card from the slug alone", async () => {
    const client = { listBodies: async () => PROFILES } as unknown as WovenBoulderClient;
    render(
      <MemoryRouter>
        <ClientProvider client={client}>
          <Bodies />
        </ClientProvider>
      </MemoryRouter>,
    );

    const cc = await screen.findByRole("link", { name: /city council/i });
    expect(cc).toHaveAttribute("href", "/bodies/city-council");
    expect(cc).toHaveTextContent(/meeting archive/i);
    // Profiled bodies still show their counts.
    expect(
      screen.getByRole("link", { name: /planning board/i }),
    ).toHaveTextContent(/100 meetings on record/);
  });
});
