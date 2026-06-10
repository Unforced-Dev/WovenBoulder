/**
 * REST-face guards over the kit-generated projection routes.
 *
 * Two jobs, applied per projection (keyed by kebab name):
 *
 *   - **enum / range params** — the kit validates TYPES
 *     (`parseParams`); domain constraints (body ∈ the 21 slugs,
 *     1 ≤ limit ≤ 50, …) are checked here BEFORE the handler runs, so a
 *     bad enum is a 400 in the kit's own `invalid_params` shape rather
 *     than a 500 from a throwing `query()`. (The MCP face asserts the
 *     same constraints inside `query()` → the kit's in-band tool
 *     error.)
 *   - **detail 404** — `meeting-brief` / `meeting-transcript` /
 *     `issue-detail` address ONE note. A gated-out note is filtered by
 *     the choke point before the shape runs, so a denied note and a
 *     missing note both produce `count: 0` — which this wrapper turns
 *     into the router's `not_found` 404. No existence oracle: the two
 *     cases are byte-identical.
 *
 * The MCP routes (`/api/mcp`, `/mcp`) pass through untouched.
 */

import type { SurfaceRoute } from "@openparachute/surface-server";

export interface RangeRule {
  min?: number;
  max?: number;
  integer?: boolean;
}

export interface GuardSpec {
  /** Param → allowed values. Checked only when the param is present. */
  enums?: Record<string, readonly string[]>;
  /** Param → numeric range. Checked only when the param parses as a number. */
  ranges?: Record<string, RangeRule>;
  /** Single-note projection: a `count: 0` result becomes a 404. */
  detail?: boolean;
}

interface ParamIssue {
  param: string;
  message: string;
}

function checkParams(url: URL, spec: GuardSpec): ParamIssue[] {
  const issues: ParamIssue[] = [];
  for (const [param, allowed] of Object.entries(spec.enums ?? {})) {
    const value = url.searchParams.get(param);
    if (value === null) continue;
    if (!allowed.includes(value)) {
      issues.push({
        param,
        message: `must be one of: ${allowed.join(", ")}`,
      });
    }
  }
  for (const [param, rule] of Object.entries(spec.ranges ?? {})) {
    const raw = url.searchParams.get(param);
    if (raw === null) continue;
    const n = Number(raw);
    if (Number.isNaN(n)) continue; // the kit's type validation owns this case
    if (rule.integer === true && !Number.isInteger(n)) {
      issues.push({ param, message: "must be an integer" });
      continue;
    }
    if (rule.min !== undefined && n < rule.min) {
      issues.push({ param, message: `must be ≥ ${rule.min}` });
    }
    if (rule.max !== undefined && n > rule.max) {
      issues.push({ param, message: `must be ≤ ${rule.max}` });
    }
  }
  return issues;
}

/**
 * Wrap the kit's generated projection routes with the per-projection
 * guard specs. Routes without a spec (including the MCP endpoint) pass
 * through unchanged.
 */
export function guardProjectionRoutes(
  routes: SurfaceRoute[],
  specs: Record<string, GuardSpec>,
): SurfaceRoute[] {
  return routes.map((route) => {
    const kebab = route.path.startsWith("/api/") ? route.path.slice("/api/".length) : null;
    if (kebab === null || route.method !== "GET") return route;
    const spec = specs[kebab];
    if (spec === undefined) return route;

    return {
      ...route,
      handler: async (req, routeCtx) => {
        const issues = checkParams(new URL(req.url), spec);
        if (issues.length > 0) {
          return Response.json({ error: "invalid_params", issues }, { status: 400 });
        }
        const res = await route.handler(req, routeCtx);
        if (spec.detail !== true || res.status !== 200) return res;
        const data = (await res.json()) as { count?: number };
        if (data.count === 0) {
          // Identical to the router's notFound() — denied == missing.
          return Response.json({ error: "not_found" }, { status: 404 });
        }
        return Response.json(data);
      },
    };
  });
}
