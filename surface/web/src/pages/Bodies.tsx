/**
 * /bodies — all 21 governing bodies. Profiles come from list-bodies
 * (Overview notes), but the index must not depend on them: City Council
 * and joint-meeting have no Overview note today, and City Council is
 * the single largest archive (~830 meetings). The known body slugs are
 * unioned over the returned profiles; un-profiled bodies render a
 * fallback card linking straight to their archive page (which works
 * from the slug alone).
 */
import { Link } from "react-router-dom";
import { useClient } from "../api/context.tsx";
import type { BodyInfo } from "../api/types.ts";
import { useAsync } from "../lib/useAsync.ts";
import { usePageTitle } from "../lib/usePageTitle.ts";
import { humanizeSlug } from "../lib/format.ts";
import { BODY_TAGS } from "../lib/vocab.ts";
import { EmptyState, ErrorState, Loading } from "../components/States.tsx";

interface BodyEntry {
  /** null only for an unrecognized profile without a usable slug. */
  slug: string | null;
  name: string;
  /** null when the body has no Overview note yet (count unknown). */
  meetingCount: number | null;
  meetingSchedule: string | null;
  key: string;
}

/** Union the known slugs with the returned profiles. Exported for tests. */
export function mergeKnownBodies(profiles: BodyInfo[]): BodyEntry[] {
  const bySlug = new Map<string, BodyInfo>();
  const extras: BodyEntry[] = [];
  for (const p of profiles) {
    if (p.slug !== null && (BODY_TAGS as readonly string[]).includes(p.slug)) {
      bySlug.set(p.slug, p);
    } else {
      extras.push({
        slug: p.slug,
        name: p.name,
        meetingCount: p.meetingCount,
        meetingSchedule: p.meetingSchedule,
        key: p.path,
      });
    }
  }

  const known: BodyEntry[] = BODY_TAGS.map((slug) => {
    const p = bySlug.get(slug);
    return p !== undefined
      ? {
          slug,
          name: p.name,
          meetingCount: p.meetingCount,
          meetingSchedule: p.meetingSchedule,
          key: p.path,
        }
      : {
          slug,
          name: humanizeSlug(slug),
          meetingCount: null,
          meetingSchedule: null,
          key: slug,
        };
  });

  // City Council first (the governing body), then by archive size,
  // count-less bodies last, ties alphabetical.
  known.sort((a, b) => {
    if (a.slug === "city-council") return -1;
    if (b.slug === "city-council") return 1;
    if (a.meetingCount !== null || b.meetingCount !== null) {
      if (a.meetingCount === null) return 1;
      if (b.meetingCount === null) return -1;
      if (a.meetingCount !== b.meetingCount) return b.meetingCount - a.meetingCount;
    }
    return a.name.localeCompare(b.name);
  });

  return [...known, ...extras];
}

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
        (() => {
          const merged = mergeKnownBodies(bodies.data);
          if (merged.length === 0) {
            return <EmptyState>No bodies on record yet.</EmptyState>;
          }
          return (
            <ul className="card-grid">
              {merged.map((b) => (
                <li key={b.key}>
                  {b.slug !== null ? (
                    <Link className="card body-card" to={`/bodies/${b.slug}`}>
                      <span className="card-title">{b.name}</span>
                      <span className="card-meta">
                        {b.meetingCount !== null
                          ? `${b.meetingCount} meeting${b.meetingCount === 1 ? "" : "s"} on record`
                          : "Meeting archive →"}
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
          );
        })()}
    </>
  );
}
