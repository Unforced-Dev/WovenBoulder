/** /topics/:tag — recent activity on one topic (meetings first, then issues). */
import { Link, useParams } from "react-router-dom";
import { useClient } from "../api/context.tsx";
import { useAsync } from "../lib/useAsync.ts";
import { usePageTitle } from "../lib/usePageTitle.ts";
import { humanizeSlug, normalizeValue } from "../lib/format.ts";
import { isTopicTag } from "../lib/vocab.ts";
import { MeetingItem } from "../components/MeetingItem.tsx";
import { StatusBadge } from "../components/Badges.tsx";
import { EmptyState, ErrorState, Loading } from "../components/States.tsx";
import { NotFound } from "./NotFound.tsx";

export function TopicPage() {
  const { tag } = useParams<{ tag: string }>();
  const client = useClient();
  const valid = tag !== undefined && isTopicTag(tag);

  const feed = useAsync(async () => {
    if (!valid) return [];
    return await client.topicFeed(tag, 50);
  }, [client, tag, valid]);

  usePageTitle(valid ? humanizeSlug(tag) : "Topic");

  if (!valid) return <NotFound />;

  const meetings = feed.status === "ready" ? feed.data.filter((i) => i.kind === "meeting") : [];
  const issues = feed.status === "ready" ? feed.data.filter((i) => i.kind === "issue") : [];

  return (
    <>
      <header className="page-header">
        <h1>{humanizeSlug(tag)}</h1>
        <p className="page-intro">Recent meetings and tracked issues on this topic.</p>
      </header>

      {feed.status === "loading" && <Loading label="Loading topic activity…" />}
      {feed.status === "error" && <ErrorState error={feed.error} />}
      {feed.status === "ready" && feed.data.length === 0 && (
        <EmptyState>Nothing tagged with this topic yet.</EmptyState>
      )}

      {meetings.length > 0 && (
        <section aria-labelledby="h-topic-meetings">
          <h2 id="h-topic-meetings">Meetings</h2>
          <ul className="meeting-list">
            {meetings.map((m) => (
              <li key={m.path}>
                <MeetingItem meeting={m} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {issues.length > 0 && (
        <section aria-labelledby="h-topic-issues">
          <h2 id="h-topic-issues">Issues</h2>
          <ul className="issue-rows">
            {issues.map((issue) => (
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
    </>
  );
}
