/** /bodies — every governing body with a profile note, by meeting count. */
import { Link } from "react-router-dom";
import { useClient } from "../api/context.tsx";
import { useAsync } from "../lib/useAsync.ts";
import { usePageTitle } from "../lib/usePageTitle.ts";
import { EmptyState, ErrorState, Loading } from "../components/States.tsx";

export function Bodies() {
  usePageTitle("Governing bodies");
  const client = useClient();
  const bodies = useAsync(() => client.listBodies(), [client]);

  return (
    <>
      <header className="page-header">
        <h1>Governing bodies</h1>
        <p className="page-intro">
          City Council plus the boards and commissions whose meetings are on record
          here.
        </p>
      </header>

      {bodies.status === "loading" && <Loading label="Loading bodies…" />}
      {bodies.status === "error" && <ErrorState error={bodies.error} />}
      {bodies.status === "ready" &&
        (bodies.data.length === 0 ? (
          <EmptyState>No body profiles published yet.</EmptyState>
        ) : (
          <ul className="card-grid">
            {[...bodies.data]
              .sort((a, b) => b.meetingCount - a.meetingCount)
              .map((b) => (
                <li key={b.path}>
                  {b.slug !== null ? (
                    <Link className="card body-card" to={`/bodies/${b.slug}`}>
                      <span className="card-title">{b.name}</span>
                      <span className="card-meta">
                        {b.meetingCount} meeting{b.meetingCount === 1 ? "" : "s"} on
                        record
                      </span>
                      {b.meetingSchedule !== null && (
                        <span className="card-blurb">{b.meetingSchedule}</span>
                      )}
                    </Link>
                  ) : (
                    <span className="card body-card">
                      <span className="card-title">{b.name}</span>
                    </span>
                  )}
                </li>
              ))}
          </ul>
        ))}
    </>
  );
}
