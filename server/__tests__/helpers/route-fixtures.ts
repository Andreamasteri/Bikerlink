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
