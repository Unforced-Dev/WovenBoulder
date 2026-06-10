/**
 * Frontend mirror of the surface's domain vocabulary (the param enums
 * the backend validates against — see surface/server/vocab.ts). Kept as
 * a small static copy: the values change rarely and the backend 400s
 * with a per-param message if they ever drift.
 */

export const BODY_TAGS = [
  "beverage-licensing-authority",
  "board-of-zoning-adjustment",
  "boulder-arts-commission",
  "boulder-junction-access-district",
  "boulder-urban-renewal-authority",
  "cannabis-licensing-advisory-board",
  "city-council",
  "design-advisory-board",
  "downtown-management-commission",
  "environmental-advisory-board",
  "housing-advisory-board",
  "human-relations-commission",
  "joint-meeting",
  "landmarks-board",
  "library-commission",
  "parks-recreation-advisory-board",
  "planning-board",
  "police-oversight-panel",
  "transportation-advisory-board",
  "university-hill-commission",
  "water-resources-advisory-board",
] as const;

export const TOPIC_TAGS = [
  "arts",
  "budget",
  "civic-engagement",
  "environment",
  "equity",
  "housing",
  "immigration",
  "land-use",
  "open-space",
  "parks",
  "public-safety",
  "surveillance",
  "transportation",
  "water",
] as const;

export const MEETING_TYPES = [
  "regular",
  "study-session",
  "special",
  "retreat",
  "joint",
  "executive-session",
] as const;

/** Board order for the issues page (active work first). */
export const ISSUE_STATUS_ORDER = [
  "in-progress",
  "proposed",
  "approved",
  "implemented",
  "ongoing",
  "deferred",
  "archived",
] as const;

export const SEARCH_SCOPES = ["all", "meetings", "issues"] as const;

export function isBodyTag(value: string): boolean {
  return (BODY_TAGS as readonly string[]).includes(value);
}

export function isTopicTag(value: string): boolean {
  return (TOPIC_TAGS as readonly string[]).includes(value);
}
