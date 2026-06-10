/** /search — projection-backed full-text search with scope + body filters. */
import { useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useClient } from "../api/context.tsx";
import type { SearchResult } from "../api/types.ts";
import { useAsync } from "../lib/useAsync.ts";
import { usePageTitle } from "../lib/usePageTitle.ts";
import { formatDate, humanizeSlug, lastSegment, normalizeValue } from "../lib/format.ts";
import { BODY_TAGS, SEARCH_SCOPES } from "../lib/vocab.ts";
import { EmptyState, ErrorState, Loading } from "../components/States.tsx";

export function SearchPage() {
  usePageTitle("Search");
  const client = useClient();
  const [searchParams, setSearchParams] = useSearchParams();

  const q = searchParams.get("q") ?? "";
  const scope = searchParams.get("scope") ?? "all";
  const body = searchParams.get("body") ?? "";

  const [draft, setDraft] = useState(q);
  const [draftScope, setDraftScope] = useState(scope);
  const [draftBody, setDraftBody] = useState(body);

  const results = useAsync(async () => {
    if (q.trim().length === 0) return null;
    return await client.search({
      q,
      ...(scope !== "all" ? { scope: scope as "meetings" | "issues" } : {}),
      ...(body.length > 0 ? { body } : {}),
      limit: 30,
    });
  }, [client, q, scope, body]);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const query = draft.trim();
    if (query.length === 0) return;
    const next: Record<string, string> = { q: query };
    if (draftScope !== "all") next.scope = draftScope;
    if (draftBody.length > 0) next.body = draftBody;
    setSearchParams(next);
  }

  return (
    <>
      <header className="page-header">
        <h1>Search the record</h1>
        <p className="page-intro">
          Full-text search across meeting records and tracked issues.
        </p>
      </header>

      <form className="search-form search-form-page" role="search" onSubmit={onSubmit}>
        <div className="search-form-row">
          <label className="visually-hidden" htmlFor="q">
            Search query
          </label>
          <input
            id="q"
            type="search"
            value={draft}
            placeholder="housing, flood mitigation, library district…"
            onChange={(e) => setDraft(e.target.value)}
          />
          <button type="submit">Search</button>
        </div>
        <div className="search-form-row search-form-filters">
          <label>
            Scope{" "}
            <select value={draftScope} onChange={(e) => setDraftScope(e.target.value)}>
              {SEARCH_SCOPES.map((s) => (
                <option key={s} value={s}>
                  {s === "all" ? "Everything" : s.charAt(0).toUpperCase() + s.slice(1)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Body{" "}
            <select value={draftBody} onChange={(e) => setDraftBody(e.target.value)}>
              <option value="">Any body</option>
              {BODY_TAGS.map((b) => (
                <option key={b} value={b}>
                  {humanizeSlug(b)}
                </option>
              ))}
            </select>
          </label>
        </div>
      </form>

      {results.status === "loading" && q.trim().length > 0 && (
        <Loading label="Searching…" />
      )}
      {results.status === "error" && <ErrorState error={results.error} />}
      {results.status === "ready" && results.data !== null && (
        <section aria-label="Search results">
          <p className="results-count" role="status">
            {results.data.length === 0
              ? "No results."
              : `${results.data.length} result${results.data.length === 1 ? "" : "s"}.`}
          </p>
          {results.data.length === 0 ? (
            <EmptyState>
              Try a broader query, or browse by <Link to="/bodies">body</Link>,{" "}
              <Link to="/issues">issue</Link>, or <Link to="/domains">domain</Link>.
            </EmptyState>
          ) : (
            <ul className="result-list">
              {results.data.map((r) => (
                <li key={r.path} className="result">
                  <ResultTitle result={r} />
                  <p className="result-snippet">{r.snippet}</p>
                  <p className="result-meta">
                    {r.date !== null && <span>{formatDate(r.date)}</span>}
                    {bodyOf(r) !== null && <span>{humanizeSlug(bodyOf(r) ?? "")}</span>}
                    {r.tags.includes("issue") && <span>Issue</span>}
                    {r.tags.includes("meeting-summary") && <span>Meeting</span>}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </>
  );
}

function bodyOf(r: SearchResult): string | null {
  for (const t of r.tags) {
    if ((BODY_TAGS as readonly string[]).includes(t)) return t;
  }
  return null;
}

/** Link a result to its page when one exists (meeting or issue). */
function ResultTitle({ result }: { result: SearchResult }) {
  const body = bodyOf(result);
  if (result.tags.includes("meeting-summary") && body !== null && result.date !== null) {
    return (
      <Link
        className="result-title"
        to={`/meetings/${body}/${result.date}`}
        state={{ path: result.path }}
      >
        {result.title}
      </Link>
    );
  }
  if (result.tags.includes("issue")) {
    return (
      <Link
        className="result-title"
        to={`/issues/${encodeURIComponent(normalizeValue(lastSegment(result.path)))}`}
        state={{ path: result.path }}
      >
        {result.title}
      </Link>
    );
  }
  return <span className="result-title">{result.title}</span>;
}
