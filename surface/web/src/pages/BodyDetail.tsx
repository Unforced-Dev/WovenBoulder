/**
 * /bodies/:slug — profile (from list-bodies, when the body has an
 * Overview note; City Council doesn't yet — the page still works from
 * the slug alone), the year-grouped meeting archive (cursor-paginated
 * via the projection's `to` param), and issues where this body leads.
 *
 * Archive pagination: `recent-meetings` returns newest-first with a
 * `limit` cap of 50 and no offset — so older pages ride a date cursor:
 * the next fetch passes `to=<oldest loaded date>` (inclusive, then
 * deduped by path so same-day meetings aren't dropped).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useClient } from "../api/context.tsx";
import type { MeetingCard } from "../api/types.ts";
import { useAsync } from "../lib/useAsync.ts";
import { usePageTitle } from "../lib/usePageTitle.ts";
import { humanizeSlug, normalizeValue } from "../lib/format.ts";
import { isBodyTag } from "../lib/vocab.ts";
import { MeetingItem } from "../components/MeetingItem.tsx";
import { StatusBadge } from "../components/Badges.tsx";
import { EmptyState, ErrorState, Loading } from "../components/States.tsx";
import { Link } from "react-router-dom";
import { NotFound } from "./NotFound.tsx";

const PAGE_SIZE = 50;

interface ArchiveState {
  items: MeetingCard[];
  loading: boolean;
  error: Error | null;
  exhausted: boolean;
}

export function BodyDetail() {
  const { slug } = useParams<{ slug: string }>();
  if (slug === undefined || !isBodyTag(slug)) return <NotFound />;
  return <BodyDetailInner slug={slug} />;
}

function BodyDetailInner({ slug }: { slug: string }) {
  const client = useClient();
  const fallbackName = humanizeSlug(slug);
  usePageTitle(fallbackName);

  const bodies = useAsync(() => client.listBodies(), [client]);
  const profile =
    bodies.status === "ready" ? (bodies.data.find((b) => b.slug === slug) ?? null) : null;

  const leadIssues = useAsync(
    () => client.issues({ lead_body: slug, limit: 50 }),
    [client, slug],
  );

  const [archive, setArchive] = useState<ArchiveState>({
    items: [],
    loading: false,
    error: null,
    exhausted: false,
  });
  const epoch = useRef(0);

  const loadMore = useCallback(
    async (current: MeetingCard[]) => {
      const mine = epoch.current;
      setArchive((s) => ({ ...s, loading: true, error: null }));
      try {
        const oldest = current.reduce<string | null>(
          (acc, m) => (m.date !== null && (acc === null || m.date < acc) ? m.date : acc),
          null,
        );
        const batch = await client.recentMeetings({
          body: slug,
          limit: PAGE_SIZE,
          ...(oldest !== null ? { to: oldest } : {}),
        });
        if (epoch.current !== mine) return;
        const seen = new Set(current.map((m) => m.path));
        const fresh = batch.filter((m) => !seen.has(m.path));
        setArchive({
          items: [...current, ...fresh],
          loading: false,
          error: null,
          // A short batch means the record ran out; an all-duplicate full
          // batch (50 same-day meetings) can't advance the cursor — stop.
          exhausted: batch.length < PAGE_SIZE || fresh.length === 0,
        });
      } catch (e) {
        if (epoch.current !== mine) return;
        setArchive((s) => ({
          ...s,
          loading: false,
          error: e instanceof Error ? e : new Error(String(e)),
        }));
      }
    },
    [client, slug],
  );

  useEffect(() => {
    epoch.current += 1;
    setArchive({ items: [], loading: false, error: null, exhausted: false });
    void loadMore([]);
  }, [loadMore]);

  const name = profile?.name ?? fallbackName;

  return (
    <>
      <header className="page-header">
        <nav className="breadcrumb" aria-label="Breadcrumb">
          <Link to="/bodies">Governing bodies</Link> / <span>{name}</span>
        </nav>
        <h1>{name}</h1>
        {profile !== null && (
          <p className="page-meta">
            {profile.meetingSchedule !== null && <span>{profile.meetingSchedule}</span>}
            <span>
              {profile.meetingCount} meeting{profile.meetingCount === 1 ? "" : "s"} on
              record
            </span>
            {profile.cityUrl !== null && (
              <a href={profile.cityUrl} rel="noopener noreferrer">
                City page ↗
              </a>
            )}
            {profile.youtubePlaylist !== null && (
              <a href={profile.youtubePlaylist} rel="noopener noreferrer">
                YouTube playlist ↗
              </a>
            )}
          </p>
        )}
      </header>

      {leadIssues.status === "ready" && leadIssues.data.length > 0 && (
        <section aria-labelledby="h-lead-issues">
          <h2 id="h-lead-issues">Issues this body leads</h2>
          <ul className="issue-rows">
            {leadIssues.data.map((issue) => (
              <li key={issue.path}>
                <Link
                  className="issue-row"
                  to={`/issues/${encodeURIComponent(normalizeValue(issue.name))}`}
                  state={{ path: issue.path }}
                >
                  <span className="issue-row-name">{issue.name}</span>
                  <StatusBadge status={issue.status} />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="h-archive">
        <h2 id="h-archive">Meeting archive</h2>
        {archive.items.length === 0 && archive.loading && (
          <Loading label="Loading meetings…" />
        )}
        {archive.items.length === 0 && !archive.loading && archive.error === null && (
          <EmptyState>No meetings on record for this body.</EmptyState>
        )}
        {archive.error !== null && <ErrorState error={archive.error} />}

        {groupByYear(archive.items).map(([year, meetings]) => (
          <section key={year} className="year-group" aria-label={`Meetings in ${year}`}>
            <h3 className="year-heading">{year}</h3>
            <ul className="meeting-list">
              {meetings.map((m) => (
                <li key={m.path}>
                  <MeetingItem meeting={m} showBody={false} />
                </li>
              ))}
            </ul>
          </section>
        ))}

        {archive.items.length > 0 && !archive.exhausted && (
          <button
            type="button"
            className="btn-more"
            disabled={archive.loading}
            onClick={() => void loadMore(archive.items)}
          >
            {archive.loading ? "Loading…" : "Load older meetings"}
          </button>
        )}
      </section>
    </>
  );
}

function groupByYear(items: MeetingCard[]): Array<[string, MeetingCard[]]> {
  const groups: Array<[string, MeetingCard[]]> = [];
  for (const m of items) {
    const year = m.date !== null ? m.date.slice(0, 4) : "Undated";
    const last = groups[groups.length - 1];
    if (last !== undefined && last[0] === year) last[1].push(m);
    else groups.push([year, [m]]);
  }
  return groups;
}
