// Tracking validation has one source of truth in shared/db/tracking.ts.
// Keep this compatibility module because existing server imports use
// `@shared/validators`, but do not maintain a second copy of the contracts.
export {
  createRouteSchema,
  routePointSchema,
  addRoutePointsSchema,
  stopRouteSchema,
  routeStatsSchema,
  updateRouteTitleSchema,
  createSprintSchema,
  createCustomRouteSchema,
  updateCustomRouteSchema,
  createWaypointSchema,
  updateWaypointSchema,
  curvyScoreWeightsSchema,
} from "../db/tracking";

export type {
  CreateRouteInput,
  RoutePointInput,
  AddRoutePointsInput,
  StopRouteInput,
  RouteStatsInput,
  UpdateRouteTitleInput,
  CreateSprintInput,
  CreateCustomRouteInput,
  UpdateCustomRouteInput,
  CreateWaypointInput,
  UpdateWaypointInput,
  CurvyScoreWeightsInput,
} from "../db/tracking";
