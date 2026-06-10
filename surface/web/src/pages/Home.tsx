/**
 * Home: latest meetings across bodies, "issues in progress" spotlight,
 * domain tiles, search box, topic chips.
 */
import { Link } from "react-router-dom";
import { useClient } from "../api/context.tsx";
import { useAsync } from "../lib/useAsync.ts";
import { usePageTitle } from "../lib/usePageTitle.ts";
import { humanizeSlug, normalizeValue, truncate } from "../lib/format.ts";
import { TOPIC_TAGS } from "../lib/vocab.ts";
import { SearchForm } from "../components/SearchForm.tsx";
import { MeetingItem } from "../components/MeetingItem.tsx";
import { EmptyState, ErrorState, Loading } from "../components/States.tsx";

export function Home() {
  usePageTitle(null);
  const client = useClient();

  const meetings = useAsync(() => client.recentMeetings({ limit: 12 }), [client]);
  const inProgress = useAsync(
    () => client.issues({ status: "in-progress", limit: 12 }),
    [client],
  );
  const domains = useAsync(() => client.domains(), [client]);

  return (
    <>
      <section className="hero">
        <h1>Woven Boulder</h1>
        <p className="hero-tagline">
          Boulder's civic record — meetings, decisions, transcripts, and the issues
          moving through City Council and the city's boards and commissions.
        </p>
        <SearchForm />
      </section>

      <section aria-labelledby="h-recent">
        <div className="section-head">
          <h2 id="h-recent">Latest meetings</h2>
          <Link className="section-more" to="/bodies">
            All bodies →
          </Link>
        </div>
        {meetings.status === "loading" && <Loading label="Loading meetings…" />}
        {meetings.status === "error" && <ErrorState error={meetings.error} />}
        {meetings.status === "ready" &&
          (meetings.data.length === 0 ? (
            <EmptyState>No meetings on record yet.</EmptyState>
          ) : (
            <ul className="meeting-list">
              {meetings.data.map((m) => (
                <li key={m.path}>
                  <MeetingItem meeting={m} />
                </li>
              ))}
            </ul>
          ))}
      </section>

      <section aria-labelledby="h-issues">
        <div className="section-head">
          <h2 id="h-issues">Issues in progress</h2>
          <Link className="section-more" to="/issues">
            All issues →
          </Link>
        </div>
        {inProgress.status === "loading" && <Loading label="Loading issues…" />}
        {inProgress.status === "error" && <ErrorState error={inProgress.error} />}
        {inProgress.status === "ready" &&
          (inProgress.data.length === 0 ? (
            <EmptyState>No issues currently marked in progress.</EmptyState>
          ) : (
            <ul className="card-grid">
              {inProgress.data.slice(0, 6).map((issue) => (
                <li key={issue.path}>
                  <Link
                    className="card issue-card"
                    to={`/issues/${encodeURIComponent(normalizeValue(issue.name))}`}
                    state={{ path: issue.path }}
                  >
                    <span className="card-title">{issue.name}</span>
                    {issue.leadBody !== null && (
                      <span className="card-meta">{humanizeSlug(issue.leadBody)}</span>
                    )}
                    {issue.summary.length > 0 && (
                      <span className="card-blurb">{truncate(issue.summary, 140)}</span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          ))}
      </section>

      <section aria-labelledby="h-domains">
        <div className="section-head">
          <h2 id="h-domains">Browse by domain</h2>
        </div>
        {domains.status === "loading" && <Loading label="Loading domains…" />}
        {domains.status === "error" && <ErrorState error={domains.error} />}
        {domains.status === "ready" && (
          <ul className="card-grid card-grid-tight">
            {domains.data.map((d) => (
              <li key={d.slug}>
                <Link className="card domain-card" to={`/domains/${d.slug}`}>
                  <span className="card-title">{d.name}</span>
                  <span className="card-meta">
                    {d.issues.length} issue{d.issues.length === 1 ? "" : "s"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="h-topics">
        <div className="section-head">
          <h2 id="h-topics">Browse by topic</h2>
        </div>
        <ul className="chips">
          {TOPIC_TAGS.map((t) => (
            <li key={t}>
              <Link className="chip" to={`/topics/${t}`}>
                {t.replace(/-/g, " ")}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
