# Parachute Vault — Static Site Generator Insights

Findings from building a statically generated civic wiki against the Parachute Vault HTTP API.
These observations are intended for the Parachute developer team and anyone building future SSG tooling.

---

## What worked well

**The HTTP API is well-suited for static site generation.** Pagination with limit/offset is predictable, tag filtering works cleanly, and the `include_content` toggle makes it easy to do a fast index-fetch for listing pages and a heavier content-fetch only when you need it.

**`tag_match=all` is essential for multi-tag intersection.** Being able to filter to e.g. `tag=city-council&tag=meeting-summary&tag_match=all` makes it straightforward to fetch a specific content type from a specific body without fetching everything and filtering in memory.

**Metadata is rich and queryable.** Custom metadata fields (`body`, `date`, `meeting-type`, `recording-url`, `transcript-status`) work exactly as expected through the notes list endpoint.

**Pagefind integrates well.** Pagefind (the static search tool used by Quartz and others) crawls the generated HTML and indexes all visible text — including content inside collapsed `<details>` elements. This means you can include full transcripts in the HTML (collapsed by default) and they'll be fully searchable without any extra work.

---

## Friction points and edge cases

### 1. No path-prefix filtering

The API has no equivalent of `?path_prefix=Boulder Civics/City Council/`. To get all notes under a logical path subtree, you must use tags. This is workable if notes are well-tagged, but it means path-based hierarchy (which vault users experience in the note-editor) isn't directly queryable by clients.

**Suggestion:** Add a `path_prefix` or `folder` query parameter to `GET /notes`. Even a simple starts-with string match on `path` would unlock hierarchy-aware queries without changing the data model.

### 2. Sort is by creation date only

`GET /notes?sort=asc|desc` sorts by creation timestamp. For a civic wiki, the natural sort order is `metadata.date` (the meeting date), which is a custom metadata field. This means SSG builders must fetch all notes and sort in memory — not a dealbreaker, but wasteful for large vaults.

**Suggestion:** Allow `sort_by=metadata.field_name` or at minimum `sort_by=date` where `date` is a recognized metadata key.

### 3. No metadata-based filtering

You can filter by tags, but not by metadata values (e.g., "all notes where `meeting-type = study-session`" or "all notes where `date >= 2024-01-01`"). The `date_from` / `date_to` parameters exist but appear to filter by note creation date, not by a custom `date` metadata field.

**Suggestion:** Support metadata-value filters like `?meta[meeting-type]=study-session` or `?meta[date][gte]=2024-01-01`.

### 4. Tailscale URL = CI/CD friction

Self-hosted Parachute vaults on a Tailscale network (e.g., `https://vault.tailXXXX.ts.net/...`) are not reachable from standard CI runners (GitHub Actions, Netlify, Vercel). Building a statically generated site requires either:

- Configuring Tailscale in CI (via `tailscale/github-action` — works, but adds setup friction and requires an ephemeral auth key)
- Building locally and pushing the output
- Exposing the vault read-API through a public URL or Tailscale Funnel

**Suggestion:** Consider documenting Tailscale Funnel as the recommended path for CI-accessible read-only vault access. A `VAULT_PUBLIC_READ_URL` concept (read-only, token-gated, publicly routable) would make SSG workflows much smoother.

### 5. Note IDs contain spaces and path separators

Note IDs like `Boulder Civics/City Council/Meetings/2026-04-23 City Council Regular Meeting` contain spaces and forward slashes. SSG builders need to slugify these into URL-safe strings (`2026-04-23-city-council-regular-meeting`). The mapping between vault ID and URL slug is implicit and must be managed by the build tool.

**Suggestion:** Consider exposing a `slug` field on notes (auto-derived from path), or supporting a custom `slug` metadata field that clients can set. This would make IDs and URLs consistent without client-side slugification.

### 6. Batch content fetch: size vs. request count tradeoff

When fetching all notes with `include_content=true`, each note's transcript can be 50–150KB of markdown. For a vault with 600+ meeting notes (total content potentially 60–100MB), fetching content in the listing response strains memory and bandwidth. Fetching per-note individually requires 600+ API calls.

The current workaround is batching with `limit=50&include_content=true` (12 calls for 600 notes). This is acceptable but highlights a gap: there's no way to fetch only the "metadata + preview" portion of content (e.g., the first 500 chars above the `---` transcript divider).

**Suggestion:** Consider a `content_limit` parameter (e.g., `?content_limit=500`) that returns only the first N characters of content in list responses. This would be a major quality-of-life improvement for SSG use cases where the listing page only needs a summary.

### 7. No first-class "last updated" timestamp for build caching

For large vaults, incremental builds (only rebuild pages where content has changed) would require knowing which notes changed since the last build. `updatedAt` is returned per note, but the API has no "notes modified since timestamp X" filter.

**Suggestion:** Add `?updated_after=ISO_DATE` to `GET /notes` to enable incremental builds.

---

## What a future Parachute SSG framework might look like

A first-party `parachute-ssg` tool would need to handle:

1. **Data layer:** Vault API client with pagination, tag filtering, and content fetching
2. **Slug mapping:** Note path → URL slug (bijective, deterministic)
3. **Incremental builds:** `updated_after` support to rebuild only changed notes
4. **Search:** Pagefind integration (or similar) baked in
5. **Templates:** Pluggable template system (Liquid, Nunjucks, or JSX)
6. **Deployment presets:** GitHub Pages, Netlify, Vercel, self-hosted

The current gap is almost entirely on the API filtering side (path prefix, metadata sorting, incremental fetch). The rendering and deployment pieces are well-solved by existing tools.

---

*Generated 2026-05-04 while building Boulder Civics Wiki against Parachute Vault (boulder).*
