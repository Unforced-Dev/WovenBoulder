/**
 * /issues/:slug — issue detail. Internal links carry the vault path in
 * route state; a deep link resolves the slug by scanning the per-status
 * issue lists (the projection has no slug param — names and paths are
 * both matched after `normalizeValue`).
 */
import { Link, useLocation, useParams } from "react-router-dom";
import { useClient } from "../api/context.tsx";
import type { WovenBoulderClient } from "../api/client.ts";
import { NotFoundError } from "../api/client.ts";
import { useAsync } from "../lib/useAsync.ts";
import { usePageTitle } from "../lib/usePageTitle.ts";
import { formatDate, humanizeSlug, lastSegment, normalizeValue } from "../lib/format.ts";
import { ISSUE_STATUS_ORDER, isBodyTag } from "../lib/vocab.ts";
import { Markdown } from "../components/Markdown.tsx";
import { StatusBadge, TopicChips } from "../components/Badges.tsx";
import { ErrorState, Loading } from "../components/States.tsx";
import { NotFound } from "./NotFound.tsx";

async function resolveSlug(
  client: WovenBoulderClient,
  slug: string,
): Promise<string | null> {
  const groups = await Promise.all(
    ISSUE_STATUS_ORDER.map((status) => client.issues({ status, limit: 50 })),
  );
  for (const items of groups) {
    for (const issue of items) {
      if (
        normalizeValue(issue.name) === slug ||
        normalizeValue(lastSegment(issue.path)) === slug
      ) {
        return issue.path;
      }
    }
  }
  return null;
}

export function IssueDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const location = useLocation();
  const client = useClient();
  const statePath = (location.state as { path?: string } | null)?.path;

  const detail = useAsync(async () => {
    if (slug === undefined) throw new NotFoundError();
    const path = statePath ?? (await resolveSlug(client, slug));
    if (path === null) throw new NotFoundError();
    return await client.issueDetail(path);
  }, [client, slug, statePath]);

  usePageTitle(detail.status === "ready" ? detail.data.name : "Issue");

  if (detail.status === "loading") return <Loading label="Loading issue…" />;
  if (detail.status === "error") {
    return detail.error instanceof NotFoundError ? (
      <NotFound />
    ) : (
      <ErrorState error={detail.error} />
    );
  }

  const issue = detail.data;
  const leadSlug =
    issue.leadBody !== null && isBodyTag(normalizeValue(issue.leadBody))
      ? normalizeValue(issue.leadBody)
      : null;

  return (
    <article className="issue-page">
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <Link to="/issues">Issues</Link> / <span>{issue.name}</span>
      </nav>

      <header className="page-header">
        <h1>{issue.name}</h1>
        <p className="page-meta">
          <StatusBadge status={issue.status} />
          {issue.leadBody !== null &&
            (leadSlug !== null ? (
              <Link to={`/bodies/${leadSlug}`}>{humanizeSlug(issue.leadBody)}</Link>
            ) : (
              <span>{humanizeSlug(issue.leadBody)}</span>
            ))}
          {issue.domain !== null && (
            <Link to={`/domains/${normalizeValue(issue.domain)}`}>
              {humanizeSlug(normalizeValue(issue.domain))}
            </Link>
          )}
        </p>
        <TopicChips topics={issue.topics} />
      </header>

      <Markdown className="markdown issue-content" source={issue.content} stripTitle />

      {issue.relatedMeetings.length > 0 && (
        <section aria-labelledby="h-issue-meetings">
          <h2 id="h-issue-meetings">Discussed in</h2>
          <ul className="meeting-list">
            {issue.relatedMeetings.map((m) => (
              <li key={m.path}>
                {m.body != null && m.date !== undefined ? (
                  <Link
                    className="meeting-item"
                    to={`/meetings/${m.body}/${m.date}`}
                    state={{ path: m.path }}
                  >
                    <span className="meeting-item-date">{formatDate(m.date)}</span>
                    <span className="meeting-item-body">{humanizeSlug(m.body)}</span>
                  </Link>
                ) : (
                  <span className="meeting-item meeting-item-static">
                    <span className="meeting-item-date">{m.title}</span>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </article>
  );
}
