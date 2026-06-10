/** Small labeled badges: meeting type, issue status, topic chips. */
import { Link } from "react-router-dom";
import { issueStatusLabel, meetingTypeLabel } from "../lib/format.ts";

export function TypeBadge(props: { type: string | null }) {
  if (props.type === null) return null;
  return (
    <span className={`badge badge-type badge-type-${props.type}`}>
      {meetingTypeLabel(props.type)}
    </span>
  );
}

export function StatusBadge(props: { status: string | null }) {
  const s = props.status ?? "unknown";
  return (
    <span className={`badge badge-status badge-status-${s}`}>
      {issueStatusLabel(props.status)}
    </span>
  );
}

export function RecordBadges(props: { hasSummary: boolean; hasTranscript: boolean }) {
  return (
    <>
      {props.hasSummary && <span className="badge badge-record">Summary</span>}
      {props.hasTranscript && <span className="badge badge-record">Transcript</span>}
    </>
  );
}

export function TopicChips(props: { topics: string[] }) {
  if (props.topics.length === 0) return null;
  return (
    <ul className="chips" aria-label="Topics">
      {props.topics.map((t) => (
        <li key={t}>
          <Link className="chip" to={`/topics/${t}`}>
            {t.replace(/-/g, " ")}
          </Link>
        </li>
      ))}
    </ul>
  );
}
