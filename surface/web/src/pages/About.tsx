/** /about — provenance, cadence, AI transparency, and the MCP endpoint. */
import { usePageTitle } from "../lib/usePageTitle.ts";

export function About() {
  usePageTitle("About");

  const base = import.meta.env.BASE_URL;
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const apiUrl = `${origin}${base}api`;
  const mcpUrl = `${apiUrl}/mcp`;

  return (
    <article className="about-page">
      <header className="page-header">
        <h1>About Woven Boulder</h1>
        <p className="page-intro">
          An independent, open civic record for Boulder, Colorado — not affiliated
          with the City of Boulder.
        </p>
      </header>

      <section aria-labelledby="h-sources">
        <h2 id="h-sources">Where the record comes from</h2>
        <p>
          Meeting recordings are published by the{" "}
          <a href="https://www.youtube.com/@CityofBoulder" rel="noopener noreferrer">
            City of Boulder YouTube channel
          </a>
          . Each recording is transcribed automatically, and most meetings get an
          AI-generated written summary. Issue and domain pages are curated from those
          records: an issue tracks one question through every meeting that touched it.
        </p>
        <p>
          The record covers City Council and twenty boards and commissions, with
          meetings going back several years. New meetings are added on an ongoing
          basis after the city publishes the recording — typically within a few days
          of each meeting.
        </p>
      </section>

      <section aria-labelledby="h-ai">
        <h2 id="h-ai">About the AI-generated summaries</h2>
        <p>
          Summaries and transcripts on this site are machine-generated. They're good
          for orientation and search, but they can mis-hear names, garble numbers,
          or compress nuance. <strong>The recording is the authoritative record</strong> —
          every meeting page links to it. For legal purposes, the city's official
          minutes govern.
        </p>
        <p>
          Pages distinguish the two clearly: a meeting with a written summary shows
          it under <em>Summary</em> with decisions and votes called out; a meeting
          without one says so plainly instead of pretending.
        </p>
      </section>

      <section aria-labelledby="h-query">
        <h2 id="h-query">Query this yourself</h2>
        <p>
          Everything this site shows comes from nine public, read-only API
          endpoints — and the same nine queries are exposed as{" "}
          <a href="https://modelcontextprotocol.io" rel="noopener noreferrer">
            MCP
          </a>{" "}
          tools, so you can point an AI assistant straight at the civic record. No
          account or token needed.
        </p>
        <dl className="endpoint-list">
          <dt>MCP endpoint (Streamable HTTP)</dt>
          <dd>
            <code>{mcpUrl}</code>
          </dd>
          <dt>REST, for scripts</dt>
          <dd>
            <code>{apiUrl}/list-bodies</code>, <code>{apiUrl}/recent-meetings</code>,{" "}
            <code>{apiUrl}/meeting-brief</code>, <code>{apiUrl}/meeting-transcript</code>,{" "}
            <code>{apiUrl}/issues</code>, <code>{apiUrl}/issue-detail</code>,{" "}
            <code>{apiUrl}/domains</code>, <code>{apiUrl}/search</code>,{" "}
            <code>{apiUrl}/topic-feed</code>
          </dd>
        </dl>
        <p>
          For example, add the MCP endpoint to Claude or any MCP-capable client as a
          remote server and ask: <em>"what did Planning Board decide about the East
          Boulder Sub-Community Plan?"</em> — the tools cover bodies, meetings
          (briefs + paginated transcripts), issues, domains, topics, and full-text
          search.
        </p>
      </section>

      <section aria-labelledby="h-privacy">
        <h2 id="h-privacy">What's deliberately left out</h2>
        <p>
          Only curated public civic records are served: every response passes a
          publicness gate (path + content-type allowlists) and personal email
          addresses are stripped before anything leaves the server.
        </p>
      </section>

      <section aria-labelledby="h-stack">
        <h2 id="h-stack">How it's built</h2>
        <p>
          The record lives in a{" "}
          <a href="https://parachute.computer" rel="noopener noreferrer">
            Parachute
          </a>{" "}
          vault; this site is a public surface over it — nine read-only projections
          and a static page you're looking at now.
        </p>
      </section>
    </article>
  );
}
