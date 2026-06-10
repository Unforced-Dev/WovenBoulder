/** Loading / error / empty states, consistent across pages. */
import { ApiError, NotFoundError } from "../api/client.ts";

export function Loading(props: { label?: string }) {
  return (
    <p className="state state-loading" role="status">
      {props.label ?? "Loading…"}
    </p>
  );
}

export function ErrorState(props: { error: Error; label?: string }) {
  const detail =
    props.error instanceof NotFoundError
      ? "Not found."
      : props.error instanceof ApiError
        ? `The server replied ${props.error.status}.`
        : "The request didn't go through — check your connection and try again.";
  return (
    <div className="state state-error" role="alert">
      <p>
        <strong>{props.label ?? "Something went wrong."}</strong> {detail}
      </p>
    </div>
  );
}

export function EmptyState(props: { children?: React.ReactNode }) {
  return <p className="state state-empty">{props.children ?? "Nothing here yet."}</p>;
}
