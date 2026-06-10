/**
 * /issues — the status-grouped board with a domain filter. The issues
 * projection caps `limit` at 50 with no offset, so the board fetches
 * per-status in parallel (7 requests — each status group is well under
 * the cap; 128 issues total).
 */
import { Link, useSearchParams } from "react-router-dom";
import { useClient } from "../api/context.tsx";
import type { IssueCard } from "../api/types.ts";
import { useAsync } from "../lib/useAsync.ts";
import { usePageTitle } from "../lib/usePageTitle.ts";
import { humanizeSlug, issueStatusLabel, normalizeValue, truncate } from "../lib/format.ts";
import { ISSUE_STATUS_ORDER } from "../lib/vocab.ts";
import { StatusBadge } from "../components/Badges.tsx";
import { EmptyState, ErrorState, Loading } from "../components/States.tsx";

export function Issues() {
  usePageTitle("Issues");
  const client = useClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const domain = searchParams.get("domain") ?? "";

  const domains = useAsync(() => client.domains(), [client]);

  const board = useAsync(async () => {
    const groups = await Promise.all(
      ISSUE_STATUS_ORDER.map(async (status) => {
        const items = await client.issues({
          status,
          ...(domain.length > 0 ? { domain } : {}),
          limit: 50,
        });
        return [status, items] as const;
      }),
    );
    return groups.filter(([, items]) => items.length > 0);
  }, [client, domain]);

  return (
    <>
      <header className="page-header">
        <h1>Issues</h1>
        <p className="page-intro">
          The questions moving through Boulder's civic process, tracked across
          meetings — grouped by where each one stands.
        </p>
      </header>

      {domains.status === "ready" && domains.data.length > 0 && (
        <nav className="filter-bar" aria-label="Filter by domain">
          <span className="filter-label" id="domain-filter-label">
            Domain
          </span>
          <ul aria-labelledby="domain-filter-label">
            <li>
              <button
                type="button"
                className={domain === "" ? "filter-btn active" : "filter-btn"}
                aria-pressed={domain === ""}
                onClick={() => setSearchParams({})}
              >
                All
              </button>
            </li>
            {domains.data.map((d) => (
              <li key={d.slug}>
                <button
                  type="button"
                  className={domain === d.slug ? "filter-btn active" : "filter-btn"}
                  aria-pressed={domain === d.slug}
                  onClick={() => setSearchParams({ domain: d.slug })}
                >
                  {d.name}
                </button>
              </li>
            ))}
          </ul>
        </nav>
      )}

      {board.status === "loading" && <Loading label="Loading issues…" />}
      {board.status === "error" && <ErrorState error={board.error} />}
      {board.status === "ready" &&
        (board.data.length === 0 ? (
          <EmptyState>
            No issues {domain.length > 0 ? `in the ${domain.replace(/-/g, " ")} domain` : ""}{" "}
            yet.
          </EmptyState>
        ) : (
          board.data.map(([status, items]) => (
            <section key={status} aria-labelledby={`h-${status}`}>
              <h2 id={`h-${status}`} className="status-heading">
                {issueStatusLabel(status)}{" "}
                <span className="status-count">({items.length})</span>
              </h2>
              <ul className="card-grid">
                {items.map((issue) => (
                  <li key={issue.path}>
                    <IssueCardView issue={issue} />
                  </li>
                ))}
              </ul>
            </section>
          ))
        ))}
    </>
  );
}

function IssueCardView({ issue }: { issue: IssueCard }) {
  return (
    <Link
      className="card issue-card"
      to={`/issues/${encodeURIComponent(normalizeValue(issue.name))}`}
      state={{ path: issue.path }}
    >
      <span className="card-title">{issue.name}</span>
      <span className="card-meta">
        <StatusBadge status={issue.status} />
        {issue.leadBody !== null && <span>{humanizeSlug(issue.leadBody)}</span>}
      </span>
      {issue.summary.length > 0 && (
        <span className="card-blurb">{truncate(issue.summary, 160)}</span>
      )}
      {issue.relatedMeetingCount > 0 && (
        <span className="card-foot">
          Discussed in {issue.relatedMeetingCount} meeting
          {issue.relatedMeetingCount === 1 ? "" : "s"}
        </span>
      )}
    </Link>
  );
}
