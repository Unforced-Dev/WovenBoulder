/** /domains (index) + /domains/:slug (detail) — from the domains projection. */
import { Link, useParams } from "react-router-dom";
import { useClient } from "../api/context.tsx";
import { useAsync } from "../lib/useAsync.ts";
import { usePageTitle } from "../lib/usePageTitle.ts";
import { normalizeValue } from "../lib/format.ts";
import { isTopicTag } from "../lib/vocab.ts";
import { EmptyState, ErrorState, Loading } from "../components/States.tsx";
import { NotFound } from "./NotFound.tsx";

export function Domains() {
  usePageTitle("Domains");
  const client = useClient();
  const domains = useAsync(() => client.domains(), [client]);

  return (
    <>
      <header className="page-header">
        <h1>Domains</h1>
        <p className="page-intro">
          The broad areas of city policy, each collecting its tracked issues.
        </p>
      </header>
      {domains.status === "loading" && <Loading label="Loading domains…" />}
      {domains.status === "error" && <ErrorState error={domains.error} />}
      {domains.status === "ready" &&
        (domains.data.length === 0 ? (
          <EmptyState>No domains published yet.</EmptyState>
        ) : (
          <ul className="card-grid">
            {domains.data.map((d) => (
              <li key={d.slug}>
                <Link className="card domain-card" to={`/domains/${d.slug}`}>
                  <span className="card-title">{d.name}</span>
                  <span className="card-meta">
                    {d.issues.length} issue{d.issues.length === 1 ? "" : "s"}
                  </span>
                  {d.blurb.length > 0 && <span className="card-blurb">{d.blurb}</span>}
                </Link>
              </li>
            ))}
          </ul>
        ))}
    </>
  );
}

export function DomainDetail() {
  const { slug } = useParams<{ slug: string }>();
  const client = useClient();
  const domains = useAsync(() => client.domains(), [client]);
  const domain =
    domains.status === "ready" ? (domains.data.find((d) => d.slug === slug) ?? null) : null;

  usePageTitle(domain !== null ? domain.name : "Domain");

  if (domains.status === "loading") return <Loading label="Loading domain…" />;
  if (domains.status === "error") return <ErrorState error={domains.error} />;
  if (domain === null) return <NotFound />;

  return (
    <>
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <Link to="/domains">Domains</Link> / <span>{domain.name}</span>
      </nav>
      <header className="page-header">
        <h1>{domain.name}</h1>
        {domain.blurb.length > 0 && <p className="page-intro">{domain.blurb}</p>}
        {slug !== undefined && isTopicTag(slug) && (
          <p className="page-meta">
            <Link to={`/topics/${slug}`}>Recent meetings on this topic →</Link>
          </p>
        )}
      </header>

      <section aria-labelledby="h-domain-issues">
        <h2 id="h-domain-issues">Issues in this domain</h2>
        {domain.issues.length === 0 ? (
          <EmptyState>No issues filed under this domain yet.</EmptyState>
        ) : (
          <ul className="issue-rows">
            {domain.issues.map((issue) => (
              <li key={issue.path}>
                <Link
                  className="issue-row"
                  to={`/issues/${encodeURIComponent(normalizeValue(issue.name))}`}
                  state={{ path: issue.path }}
                >
                  <span className="issue-row-name">{issue.name}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
