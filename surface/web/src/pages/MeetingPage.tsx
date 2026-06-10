/**
 * /meetings/:body/:date — the meeting page.
 *
 * Brief FIRST: metadata + the AI summary section only, with the
 * "Decisions & Votes" sub-section hoisted into a prominent callout.
 * 57% of meetings have no AI summary — those get an explicit "no
 * summary yet" treatment over the short fallback excerpt.
 *
 * The transcript (median source note 137KB) is NEVER fetched eagerly:
 * it lazy-loads page-by-page (~10KB) through meeting-transcript on
 * explicit visitor action.
 *
 * Route → vault path resolution: internal links carry the path in
 * route state (or ?path=); deep links resolve body+date via
 * recent-meetings (from=to=date). Two meetings on one day get a small
 * disambiguation list.
 */
import { useState } from "react";
import { Link, useLocation, useParams, useSearchParams } from "react-router-dom";
import { useClient } from "../api/context.tsx";
import type { MeetingBrief, TranscriptPage } from "../api/types.ts";
import type { WovenBoulderClient } from "../api/client.ts";
import { useAsync } from "../lib/useAsync.ts";
import { usePageTitle } from "../lib/usePageTitle.ts";
import { splitDecisions } from "../lib/decisions.ts";
import { formatDate, humanizeSlug, meetingTypeLabel, normalizeValue } from "../lib/format.ts";
import { isBodyTag } from "../lib/vocab.ts";
import { Markdown } from "../components/Markdown.tsx";
import { TopicChips, TypeBadge } from "../components/Badges.tsx";
import { YouTubeEmbed } from "../components/YouTubeEmbed.tsx";
import { EmptyState, ErrorState, Loading } from "../components/States.tsx";
import { NotFound } from "./NotFound.tsx";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function MeetingPage() {
  const { body, date } = useParams<{ body: string; date: string }>();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const client = useClient();

  if (body === undefined || date === undefined || !isBodyTag(body) || !DATE_RE.test(date)) {
    return <NotFound />;
  }

  const statePath = (location.state as { path?: string } | null)?.path;
  const queryPath = searchParams.get("path");
  const knownPath = statePath ?? queryPath ?? undefined;

  return (
    <MeetingResolver
      key={`${body}/${date}/${knownPath ?? ""}`}
      client={client}
      body={body}
      date={date}
      knownPath={knownPath}
    />
  );
}

function MeetingResolver(props: {
  client: WovenBoulderClient;
  body: string;
  date: string;
  knownPath: string | undefined;
}) {
  const { client, body, date, knownPath } = props;

  const resolved = useAsync(async () => {
    if (knownPath !== undefined) return { kind: "one" as const, path: knownPath };
    const matches = await client.recentMeetings({ body, from: date, to: date, limit: 10 });
    if (matches.length === 0) return { kind: "none" as const };
    const first = matches[0];
    if (matches.length === 1 && first !== undefined) {
      return { kind: "one" as const, path: first.path };
    }
    return { kind: "many" as const, matches };
  }, [client, body, date, knownPath]);

  if (resolved.status === "loading") return <Loading label="Finding meeting…" />;
  if (resolved.status === "error") return <ErrorState error={resolved.error} />;
  if (resolved.data.kind === "none") return <NotFound />;

  if (resolved.data.kind === "many") {
    return (
      <>
        <h1>
          {humanizeSlug(body)} — {formatDate(date)}
        </h1>
        <p>Multiple meetings were held that day:</p>
        <ul className="meeting-list">
          {resolved.data.matches.map((m) => (
            <li key={m.path}>
              <Link
                className="meeting-item"
                to={`/meetings/${body}/${date}?path=${encodeURIComponent(m.path)}`}
              >
                <span className="meeting-item-date">{m.title}</span>
                <TypeBadge type={m.meetingType} />
              </Link>
            </li>
          ))}
        </ul>
      </>
    );
  }

  return <MeetingView client={client} path={resolved.data.path} />;
}

/** The meeting view proper — exported for component tests. */
export function MeetingView(props: { client: WovenBoulderClient; path: string }) {
  const { client, path } = props;
  const brief = useAsync(() => client.meetingBrief(path), [client, path]);

  usePageTitle(brief.status === "ready" ? brief.data.title : "Meeting");

  if (brief.status === "loading") return <Loading label="Loading meeting…" />;
  if (brief.status === "error") return <ErrorState error={brief.error} />;

  const m = brief.data;
  return (
    <article className="meeting-page">
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <Link to="/">Home</Link> /{" "}
        {m.body !== null ? (
          <Link to={`/bodies/${m.body}`}>{humanizeSlug(m.body)}</Link>
        ) : (
          <span>Meeting</span>
        )}{" "}
        / <span>{m.date !== null ? formatDate(m.date) : m.title}</span>
      </nav>

      <header className="page-header">
        <h1>{m.title}</h1>
        <p className="page-meta">
          {m.date !== null && <span>{formatDate(m.date)}</span>}
          {m.body !== null && <span>{humanizeSlug(m.body)}</span>}
          {m.meetingType !== null && <TypeBadge type={m.meetingType} />}
        </p>
        <TopicChips topics={m.topics} />
      </header>

      <BriefSection brief={m} />

      {m.recordingUrl !== null && (
        <section aria-labelledby="h-recording">
          <h2 id="h-recording">Recording</h2>
          <YouTubeEmbed
            url={m.recordingUrl}
            title={`${m.body !== null ? humanizeSlug(m.body) : ""} ${meetingTypeLabel(m.meetingType)}, ${m.date !== null ? formatDate(m.date) : m.title}`}
          />
        </section>
      )}

      {m.relatedIssues.length > 0 && (
        <section aria-labelledby="h-related">
          <h2 id="h-related">Related issues</h2>
          <ul className="issue-rows">
            {m.relatedIssues.map((issue) => (
              <li key={issue.path}>
                <Link
                  className="issue-row"
                  to={`/issues/${encodeURIComponent(normalizeValue(issue.title))}`}
                  state={{ path: issue.path }}
                >
                  <span className="issue-row-name">{issue.title}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <TranscriptSection client={client} path={path} hasTranscript={m.hasTranscript} />
    </article>
  );
}

/** Summary block: Decisions & Votes hoisted, no-summary treated honestly. */
function BriefSection({ brief }: { brief: MeetingBrief }) {
  if (brief.summarySource === "fallback") {
    return (
      <section aria-labelledby="h-summary">
        <h2 id="h-summary">Summary</h2>
        <p className="notice notice-muted">
          No summary yet for this meeting — a written summary hasn't been generated.
          The transcript below and the recording are the full record.
        </p>
        {brief.summary.trim().length > 0 && (
          <Markdown className="markdown brief-excerpt" source={brief.summary} />
        )}
      </section>
    );
  }

  const { decisions, heading, rest } = splitDecisions(brief.summary);
  return (
    <section aria-labelledby="h-summary">
      <h2 id="h-summary">Summary</h2>
      {decisions !== null && (
        <div className="decisions-callout">
          <h3>{heading ?? "Decisions & Votes"}</h3>
          <Markdown source={decisions} />
        </div>
      )}
      <Markdown className="markdown meeting-summary" source={rest} />
      <p className="ai-note">
        This summary was AI-generated from the meeting recording.{" "}
        <Link to="/about">About the record</Link>
      </p>
    </section>
  );
}

/** Lazy, page-by-page transcript loader — exported for component tests. */
export function TranscriptSection(props: {
  client: WovenBoulderClient;
  path: string;
  hasTranscript: boolean;
}) {
  const { client, path, hasTranscript } = props;
  const [pages, setPages] = useState<TranscriptPage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  if (!hasTranscript) {
    return (
      <section aria-labelledby="h-transcript">
        <h2 id="h-transcript">Transcript</h2>
        <EmptyState>No transcript is available for this meeting.</EmptyState>
      </section>
    );
  }

  const last = pages[pages.length - 1];
  const totalPages = last?.totalPages ?? null;
  const nextPage = last !== undefined ? last.page + 1 : 1;
  const done = last !== undefined && (last.totalPages === 0 || last.page >= last.totalPages);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const page = await client.meetingTranscript(path, nextPage);
      setPages((prev) => [...prev, page]);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setLoading(false);
    }
  }

  return (
    <section aria-labelledby="h-transcript">
      <h2 id="h-transcript">Transcript</h2>

      {pages.length > 0 && last !== undefined && last.totalPages === 0 && (
        <EmptyState>No transcript is available for this meeting.</EmptyState>
      )}

      {pages.length > 0 && totalPages !== null && totalPages > 0 && (
        <div className="transcript" aria-live="polite">
          {pages.map((p) => (
            <pre key={p.page} className="transcript-page">
              {p.transcript}
            </pre>
          ))}
        </div>
      )}

      {error !== null && <ErrorState error={error} label="Couldn't load the transcript." />}

      {!done && (
        <button
          type="button"
          className="btn-more"
          disabled={loading}
          onClick={() => void load()}
        >
          {loading
            ? "Loading…"
            : pages.length === 0
              ? "Load transcript"
              : `Load more (page ${nextPage} of ${totalPages ?? "?"})`}
        </button>
      )}
      {done && totalPages !== null && totalPages > 0 && (
        <p className="state state-empty">End of transcript ({totalPages} pages).</p>
      )}
    </section>
  );
}
