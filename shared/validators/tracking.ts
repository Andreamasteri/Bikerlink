import { z } from "zod";

export const createRouteSchema = z.object({
  title: z.string().max(200).optional().nullable(),
  trackingFrequency: z.number().int().min(1).max(60).optional(),
  isSprint: z.boolean().optional(),
});
export type CreateRouteInput = z.infer<typeof createRouteSchema>;

export const routePointSchema = z.object({
  latitude: z.number().finite("Latitudine non valida"),
  longitude: z.number().finite("Longitudine non valida"),
  altitude: z.number().optional().nullable(),
  speedKmh: z.number().optional().nullable(),
  accelG: z.number().optional().nullable(),
  tiltDeg: z.number().optional().nullable(),
  timestamp: z.string().optional().nullable(),
});
export type RoutePointInput = z.infer<typeof routePointSchema>;

export const addRoutePointsSchema = z.object({
  points: z.array(routePointSchema).min(1, "Nessun punto GPS fornito"),
});
export type AddRoutePointsInput = z.infer<typeof addRoutePointsSchema>;

export const stopRouteSchema = z.object({
  totalDistanceKm: z.number().optional(),
  maxSpeedKmh: z.number().optional(),
  avgSpeedKmh: z.number().optional(),
  maxAltitude: z.number().optional(),
  durationSeconds: z.number().optional(),
  idleTimeSeconds: z.number().optional(),
  maxTiltDeg: z.number().optional().nullable(),
  maxAccelerationG: z.number().optional().nullable(),
  maxDecelerationG: z.number().optional().nullable(),
  maxLateralG: z.number().optional().nullable(),
  sprint0to100Ms: z.number().optional().nullable(),
  gpsBlackoutCount: z.number().optional(),
  gpsBlackoutSeconds: z.number().optional(),
});
export type StopRouteInput = z.infer<typeof stopRouteSchema>;

export const routeStatsSchema = z.object({
  totalDistanceKm: z.number().optional(),
  maxSpeedKmh: z.number().optional(),
  avgSpeedKmh: z.number().optional(),
  maxAltitude: z.number().optional(),
  idleTimeSeconds: z.number().optional(),
});
export type RouteStatsInput = z.infer<typeof routeStatsSchema>;

export const updateRouteTitleSchema = z.object({
  title: z.string().min(1, "Titolo obbligatorio").max(200),
});
export type UpdateRouteTitleInput = z.infer<typeof updateRouteTitleSchema>;

export const createSprintSchema = z.object({
  sprint0to100Ms: z.number().finite().positive("Tempo sprint non valido"),
  maxAccelerationG: z.number().finite().optional().nullable(),
  maxDecelerationG: z.number().finite().optional().nullable(),
  maxTiltDeg: z.number().finite().optional().nullable(),
  routeId: z.string().optional().nullable(),
});
export type CreateSprintInput = z.infer<typeof createSprintSchema>;

export const createCustomRouteSchema = z.object({
  title: z.string().min(1, "Titolo obbligatorio").max(200),
  description: z.string().max(2000).optional().nullable(),
  isPublic: z.boolean().optional(),
  visibility: z.enum(["public", "friends", "private"]).optional(),
});
export type CreateCustomRouteInput = z.infer<typeof createCustomRouteSchema>;

export const updateCustomRouteSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional().nullable(),
  isPublic: z.boolean().optional(),
  visibility: z.enum(["public", "friends", "private"]).optional(),
  totalDistanceKm: z.number().optional().nullable(),
});
export type UpdateCustomRouteInput = z.infer<typeof updateCustomRouteSchema>;

export const createWaypointSchema = z.object({
  name: z.string().min(1, "Nome obbligatorio").max(200),
  latitude: z.number().finite("Latitudine non valida"),
  longitude: z.number().finite("Longitudine non valida"),
  description: z.string().max(2000).optional().nullable(),
  waypointType: z.string().optional(),
  orderIndex: z.number().int().optional(),
});
export type CreateWaypointInput = z.infer<typeof createWaypointSchema>;

export const updateWaypointSchema = createWaypointSchema.partial();
export type UpdateWaypointInput = z.infer<typeof updateWaypointSchema>;

export const curvyScoreWeightsSchema = z.object({
  weight_lean: z.number().gt(0).max(1).optional(),
  weight_gforce: z.number().gt(0).max(1).optional(),
  min_samples: z.number().int().min(1).optional(),
}).passthrough();
export type CurvyScoreWeightsInput = z.infer<typeof curvyScoreWeightsSchema>;
