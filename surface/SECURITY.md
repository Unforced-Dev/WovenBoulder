# Security — Woven Boulder

*From the `@openparachute/surface-server` SECURITY template (spec §13).*

## The one rule

No vault content reaches the public except through a declared projection's
gate — and a non-public note is byte-indistinguishable from a missing one.

## Threat-model summary

- **Attacker**: any anonymous internet visitor (the surface is
  `audience: "public"` by design — there are no accounts, no sessions, no
  capability links).
- **Surface**: nine read-only projection endpoints + the same nine as MCP
  tools at `/api/mcp`. No write path exists below the operator tier.
- **Blast radius if the backend is compromised**: the stored credential is
  vault-wide `vault:boulder:read` — a compromised backend could read
  non-public boulder-vault notes (ops/meta content the gate hides). Tag-
  scoping the credential down is the tracked attenuation step. No write
  authority exists; no other vault is reachable.
- **Not in scope**: the static-gen site (`../build.js`) and the ingestion
  agent are separate components with their own posture.

## Credential custody

One credential: `vault:boulder:read`, 90-day registered token, delivered by
the hub's connections engine to the module's delivery endpoint and held by
the surface host (0600 file custody). The frontend bundle carries **zero**
credentials — verified by grep (no `Authorization` path exists in the SPA).
Renewal rides the hub connection record (claim/approve flow).

## The gate (every read, one choke point)

All vault reads route through `server/gate.ts`:

- deny-by-default publicness predicate (path prefix + content-type
  allowlist + denylist);
- denied ≡ missing — identical 404 bodies (conformance-pinned);
- fail-closed link drops (a link to a non-public note is removed, never
  leaked);
- recursive email strip on every response (positive-control tested).

## Actor table

| Actor | May | Refused with |
|---|---|---|
| anonymous | the nine projections (REST + MCP), the SPA | 404 (`not_found`) for anything non-public or undeclared; 400 for bad enums |
| operator (hub JWT) | the above + `POST /api/admin/refresh` | same shapes |

Evidence: the kit conformance suite runs in `server/__tests__/conformance.test.ts`
(positive controls included — a deliberately leaky backend fails it).

## Transport & headers

Served only through the hub proxy (no self-tunnel). Host-stamped CSP with
the add-only `server.csp` override (`img-src i.ytimg.com`,
`frame-src youtube-nocookie.com` — click-to-load embeds only).
No WebSocket capability is declared; the hub's WS caps don't apply here.

## Reporting

Open a GitHub issue on this repository (no sensitive PII is held by this
surface — all content is public civic record), or email the maintainer
(address in commit history).
