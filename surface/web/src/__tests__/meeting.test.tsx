/**
 * Meeting page split rendering:
 *   - brief renders FIRST, with Decisions & Votes hoisted into the callout
 *   - the transcript is NEVER fetched eagerly (lazy, page-by-page)
 *   - transcript-only meetings get the explicit "no summary yet" treatment
 *   - hasTranscript=false renders the no-transcript state without a loader
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { MeetingView, TranscriptSection } from "../pages/MeetingPage.tsx";
import type { WovenBoulderClient } from "../api/client.ts";
import type { MeetingBrief, TranscriptPage } from "../api/types.ts";

const PATH = "Boulder Civics/City Council/Meetings/2026-04-23 City Council Regular Meeting";

const aiBrief: MeetingBrief = {
  path: PATH,
  title: "2026-04-23 City Council Regular Meeting",
  date: "2026-04-23",
  body: "city-council",
  meetingType: "regular",
  recordingUrl: "https://www.youtube.com/watch?v=abc123",
  hasSummary: true,
  hasTranscript: true,
  status: "complete",
  topics: ["housing", "land-use"],
  summary: [
    "### Overview",
    "Council took up the linkage fee update.",
    "",
    "### Decisions & Votes",
    "- Adopted the updated linkage fee schedule, 7-2.",
    "",
    "### Discussion",
    "Extended debate on phasing.",
  ].join("\n"),
  summarySource: "ai-summary",
  relatedIssues: [
    { path: "Boulder Civics/Issues/Linkage Fee Update", title: "Linkage Fee Update" },
  ],
};

const fallbackBrief: MeetingBrief = {
  ...aiBrief,
  hasSummary: false,
  summary: "Meeting metadata header, first 2KB before the transcript.",
  summarySource: "fallback",
};

function transcriptPage(page: number, totalPages: number): TranscriptPage {
  return {
    path: PATH,
    title: "2026-04-23 City Council Regular Meeting",
    date: "2026-04-23",
    body: "city-council",
    page,
    totalPages,
    transcript: `TRANSCRIPT-PAGE-${page} [0:0${page}] Speaker: the spoken record.`,
  };
}

function fakeClient(overrides: Partial<WovenBoulderClient>): WovenBoulderClient {
  const unexpected = (name: string) => async () => {
    throw new Error(`unexpected client call: ${name}`);
  };
  return {
    listBodies: unexpected("listBodies"),
    recentMeetings: unexpected("recentMeetings"),
    meetingBrief: unexpected("meetingBrief"),
    meetingTranscript: unexpected("meetingTranscript"),
    issues: unexpected("issues"),
    issueDetail: unexpected("issueDetail"),
    domains: unexpected("domains"),
    search: unexpected("search"),
    topicFeed: unexpected("topicFeed"),
    ...overrides,
  } as WovenBoulderClient;
}

function renderView(client: WovenBoulderClient, path = PATH) {
  return render(
    <MemoryRouter>
      <MeetingView client={client} path={path} />
    </MemoryRouter>,
  );
}

describe("MeetingView — brief first, transcript lazy", () => {
  it("renders the AI summary with Decisions & Votes hoisted, without fetching the transcript", async () => {
    const meetingBrief = vi.fn(async () => aiBrief);
    const meetingTranscript = vi.fn(async () => transcriptPage(1, 6));
    renderView(fakeClient({ meetingBrief, meetingTranscript }));

    expect(
      await screen.findByRole("heading", { name: /decisions & votes/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/7-2/)).toBeInTheDocument();
    // The non-decisions summary still renders.
    expect(screen.getByText(/Council took up the linkage fee update/)).toBeInTheDocument();
    // Decisions content is not duplicated into the body summary.
    expect(screen.getAllByText(/Adopted the updated linkage fee schedule/)).toHaveLength(1);

    // THE invariant: brief shown, transcript endpoint untouched.
    expect(meetingBrief).toHaveBeenCalledTimes(1);
    expect(meetingTranscript).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /load transcript/i })).toBeInTheDocument();
  });

  it("loads the transcript page-by-page on demand", async () => {
    const user = userEvent.setup();
    const meetingTranscript = vi.fn(async (_path: string, page?: number) =>
      transcriptPage(page ?? 1, 3),
    );
    renderView(fakeClient({ meetingBrief: async () => aiBrief, meetingTranscript }));

    await user.click(await screen.findByRole("button", { name: /load transcript/i }));
    expect(await screen.findByText(/TRANSCRIPT-PAGE-1/)).toBeInTheDocument();
    expect(meetingTranscript).toHaveBeenCalledWith(PATH, 1);

    const more = screen.getByRole("button", { name: /load more \(page 2 of 3\)/i });
    await user.click(more);
    expect(await screen.findByText(/TRANSCRIPT-PAGE-2/)).toBeInTheDocument();
    expect(meetingTranscript).toHaveBeenCalledWith(PATH, 2);
    // Page 1 stays mounted — pages accumulate.
    expect(screen.getByText(/TRANSCRIPT-PAGE-1/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /load more \(page 3 of 3\)/i }));
    expect(await screen.findByText(/TRANSCRIPT-PAGE-3/)).toBeInTheDocument();
    // Last page reached: the loader is gone, the end marker shows.
    expect(screen.queryByRole("button", { name: /load more/i })).not.toBeInTheDocument();
    expect(screen.getByText(/end of transcript \(3 pages\)/i)).toBeInTheDocument();
  });

  it("gives transcript-only meetings the explicit no-summary treatment", async () => {
    renderView(fakeClient({ meetingBrief: async () => fallbackBrief }));

    expect(await screen.findByText(/no summary yet/i)).toBeInTheDocument();
    // The fallback excerpt still renders for orientation…
    expect(screen.getByText(/first 2KB before the transcript/)).toBeInTheDocument();
    // …but never inside a decisions callout, and without the AI-summary credit.
    expect(screen.queryByRole("heading", { name: /decisions/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/AI-generated from the meeting recording/i)).not.toBeInTheDocument();
  });
});

describe("TranscriptSection edge states", () => {
  it("hasTranscript=false renders the empty state with no load button", () => {
    const meetingTranscript = vi.fn();
    render(
      <MemoryRouter>
        <TranscriptSection
          client={fakeClient({ meetingTranscript })}
          path={PATH}
          hasTranscript={false}
        />
      </MemoryRouter>,
    );
    expect(screen.getByText(/no transcript is available/i)).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(meetingTranscript).not.toHaveBeenCalled();
  });

  it("totalPages 0 (tagged but empty) resolves to the empty state after one fetch", async () => {
    const user = userEvent.setup();
    const meetingTranscript = vi.fn(async () => ({
      ...transcriptPage(0, 0),
      page: 0,
      totalPages: 0,
      transcript: "",
    }));
    render(
      <MemoryRouter>
        <TranscriptSection
          client={fakeClient({ meetingTranscript })}
          path={PATH}
          hasTranscript={true}
        />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole("button", { name: /load transcript/i }));
    await waitFor(() =>
      expect(screen.getByText(/no transcript is available/i)).toBeInTheDocument(),
    );
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
