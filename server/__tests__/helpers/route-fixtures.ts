/**
 * Shared test fixtures for AI route parse/stream tests.
 *
 * VALID_ROUTE is typed against `routeSchema` (via `z.infer`) so that any new
 * required field added to routeSchema causes a TypeScript error HERE — making
 * the drift visible in a single place instead of silently breaking multiple
 * test files with stale literals.
 *
 * If routeSchema changes (new field, type change, added .nullable()), update
 * VALID_ROUTE below and the tests will stay in sync automatically.
 *
 * --- Invalid / partial fixtures ---
 *
 * Each invalid fixture below is annotated with the field or constraint it
 * violates. Centralising them here prevents the same drift risk that
 * VALID_ROUTE solved: a routeSchema change can silently make an "invalid"
 * fixture valid (or vice-versa), which would make an error-path test vacuous.
 *
 * String fixtures (ROUTE_JSON_*) model raw LLM output fed to the stream mock.
 * Object fixtures (ROUTE_MISSING_*, ROUTE_WRONG_*) model deserialized payloads
 * and are typed as `Record<string, unknown>` to keep them structurally invalid
 * while still being inspectable.
 */

import { z } from "zod";
import { routeSchema } from "../../routes/planned-routes/waypoints";

export type RouteObject = z.infer<typeof routeSchema>;

export const VALID_ROUTE: RouteObject = {
  title: "Giro sulle Alpi",
  startLocation: "Milano",
  endLocation: "Torino",
  waypoints: ["Como"],
  poiStops: null,
  style: "curvy",
  isRoundTrip: false,
  isMultiDay: false,
  daysEstimate: 1,
  maxHoursPerDay: 6,
  avoidHighways: false,
  notes: "",
};

// ---------------------------------------------------------------------------
// Sentinel for broken-stream assertions
// ---------------------------------------------------------------------------

/**
 * Sentinel string embedded in all ROUTE_JSON_TRUNCATED_* fixtures.
 *
 * Use in test assertions to verify that broken LLM output never reaches the
 * client, regardless of which provider produced it:
 *
 *   expect(sse.text).not.toContain(BROKEN_STREAM_SENTINEL)
 */
export const BROKEN_STREAM_SENTINEL = "BROKEN_FIXTURE";

// ---------------------------------------------------------------------------
// Broken / partial JSON string fixtures (raw LLM stream output)
// ---------------------------------------------------------------------------

/**
 * Truncated mid-field JSON — simulates an LLM stream cut while emitting a key.
 *
 * Violates: JSON.parse (syntax error — open string literal, no closing brace).
 * Contains BROKEN_STREAM_SENTINEL so `not.toContain(BROKEN_STREAM_SENTINEL)`
 * assertions detect leakage.
 */
export const ROUTE_JSON_TRUNCATED_MID =
  `{"title":"${BROKEN_STREAM_SENTINEL}","startLoc` as const;

/**
 * Short truncated JSON — simulates a stream cut immediately after the first
 * field value, before the closing brace.
 *
 * Violates: JSON.parse (missing closing `}`).
 * Also violates routeSchema even if the brace were added (only `title` present).
 * Contains BROKEN_STREAM_SENTINEL.
 */
export const ROUTE_JSON_TRUNCATED_SHORT =
  `{"title":"${BROKEN_STREAM_SENTINEL}"` as const;

/**
 * Syntactically valid JSON that contains no routeSchema fields.
 *
 * Violates: routeSchema validation (none of the required fields are present).
 * Does NOT contain BROKEN_STREAM_SENTINEL — use for cases where only schema
 * invalidity (not stream-leakage detection) is needed.
 */
export const ROUTE_JSON_UNKNOWN_FIELDS = '{"unexpected":"value"}' as const;

// ---------------------------------------------------------------------------
// Object fixtures (deserialized payloads with schema violations)
// ---------------------------------------------------------------------------

/**
 * Route object missing the required `title` field.
 *
 * Violates: routeSchema — `title: z.string()` is required.
 * All other fields are present and valid to isolate the title constraint.
 */
export const ROUTE_MISSING_TITLE: Record<string, unknown> = {
  // title intentionally absent — routeSchema: title: z.string() is required
  startLocation: "Milano",
  endLocation: "Torino",
  waypoints: [],
  poiStops: null,
  style: "curvy",
  isRoundTrip: false,
  isMultiDay: false,
  daysEstimate: 1,
  maxHoursPerDay: 6,
  avoidHighways: false,
  notes: "",
};

/**
 * Route object with an invalid `style` value (number instead of enum string).
 *
 * Violates: routeSchema — `style: z.enum(["curvy", "balanced", "fast"])`.
 * All other fields are taken from VALID_ROUTE to isolate the style constraint.
 */
export const ROUTE_WRONG_STYLE: Record<string, unknown> = {
  ...VALID_ROUTE,
  style: 42, // must be "curvy" | "balanced" | "fast", not a number
};
