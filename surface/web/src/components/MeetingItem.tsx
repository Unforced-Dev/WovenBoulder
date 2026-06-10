/** One meeting row — links to /meetings/:body/:date with the vault path
 * riding route state (fast path; deep links re-resolve via the API). */
import { Link } from "react-router-dom";
import type { MeetingCard } from "../api/types.ts";
import { formatDate, humanizeSlug } from "../lib/format.ts";
import { RecordBadges, TypeBadge } from "./Badges.tsx";

export function MeetingItem(props: { meeting: MeetingCard; showBody?: boolean }) {
  const m = props.meeting;
  const inner = (
    <>
      <span className="meeting-item-date">{m.date ? formatDate(m.date) : "Undated"}</span>
      {props.showBody !== false && m.body !== null && (
        <span className="meeting-item-body">{humanizeSlug(m.body)}</span>
      )}
      <span className="meeting-item-badges">
        <TypeBadge type={m.meetingType} />
        <RecordBadges hasSummary={m.hasSummary} hasTranscript={m.hasTranscript} />
      </span>
    </>
  );

  if (m.body === null || m.date === null) {
    return <span className="meeting-item meeting-item-static">{inner}</span>;
  }
  return (
    <Link
      className="meeting-item"
      to={`/meetings/${m.body}/${m.date}`}
      state={{ path: m.path }}
    >
      {inner}
    </Link>
  );
}
