import { z } from "zod";

export const savePlannedRouteSchema = z.object({
  title: z.string().min(1, "Titolo obbligatorio").max(200),
  description: z.string().max(5000).optional().nullable(),
  waypoints: z.array(z.unknown()).optional().nullable(),
  polyline: z.string().optional().nullable(),
  distanceKm: z.number().optional().nullable(),
  durationMinutes: z.number().int().optional().nullable(),
  bikerScore: z.number().optional().nullable(),
  style: z.enum(["curvy", "balanced", "fast"]).optional(),
  visibility: z.enum(["public", "friends", "private"]).optional(),
  isMultiDay: z.boolean().optional(),
  metadata: z.record(z.string(), z.unknown()).optional().nullable(),
  navigationSteps: z.array(z.unknown()).optional().nullable(),
  elevationProfile: z.array(z.unknown()).optional().nullable(),
  elevationGainM: z.number().int().optional().nullable(),
  altitudeMinM: z.number().int().optional().nullable(),
  altitudeMaxM: z.number().int().optional().nullable(),
});
export type SavePlannedRouteInput = z.infer<typeof savePlannedRouteSchema>;

export const updatePlannedRouteSchema = savePlannedRouteSchema.partial();
export type UpdatePlannedRouteInput = z.infer<typeof updatePlannedRouteSchema>;

export const updatePlannedRouteBodySchema = z.object({
  title: z.string().max(200).optional(),
  description: z.string().optional().nullable(),
  visibility: z.enum(["public", "friends", "private"]).optional(),
  metadata: z.record(z.string(), z.unknown()).optional().nullable(),
}).passthrough();
export type UpdatePlannedRouteBodyInput = z.infer<typeof updatePlannedRouteBodySchema>;

export const gpxImportSchema = z.object({
  title: z.string().max(200).optional().nullable(),
  description: z.string().max(5000).optional().nullable(),
  isPublic: z.boolean().optional(),
  tags: z.array(z.string()).optional().nullable(),
  gpxData: z.string().min(1, "gpxData è obbligatorio"),
});
export type GpxImportInput = z.infer<typeof gpxImportSchema>;

export const calculateRouteSchema = z.object({
  points: z.array(z.object({
    lat: z.number().finite(),
    lng: z.number().finite(),
  })).min(2, "Almeno 2 punti richiesti"),
  avoidHighways: z.boolean().optional(),
  avoidTolls: z.boolean().optional(),
  preferCurvy: z.boolean().optional(),
});
export type CalculateRouteInput = z.infer<typeof calculateRouteSchema>;

export const poiSearchSchema = z.object({
  lat: z.number().finite("lat non valida"),
  lng: z.number().finite("lng non valida"),
  radius: z.number().positive().max(100000).optional(),
  types: z.array(z.string()).optional(),
  limit: z.number().int().min(1).max(100).optional(),
});
export type PoiSearchInput = z.infer<typeof poiSearchSchema>;

export const aiParsePromptSchema = z.object({
  prompt: z.string().min(3, "Prompt troppo corto").max(2000, "Prompt troppo lungo"),
  userLat: z.number().finite().optional(),
  userLng: z.number().finite().optional(),
});
export type AiParsePromptInput = z.infer<typeof aiParsePromptSchema>;

export const weatherWaypointsSchema = z.object({
  routeId: z.string().min(1, "routeId obbligatorio"),
  waypoints: z.array(z.object({
    lat: z.number().finite(),
    lng: z.number().finite(),
    name: z.string().optional(),
  })).min(1, "Almeno un waypoint richiesto").max(8, "Massimo 8 waypoints"),
});
export type WeatherWaypointsInput = z.infer<typeof weatherWaypointsSchema>;

export const poiPhotoSchema = z.object({
  poiId: z.string().min(1, "poiId obbligatorio"),
  poiType: z.string().optional(),
  imageBase64: z.string().min(1, "Immagine obbligatoria"),
  caption: z.string().max(500).optional().nullable(),
  latitude: z.number().finite().optional().nullable(),
  longitude: z.number().finite().optional().nullable(),
});
export type PoiPhotoInput = z.infer<typeof poiPhotoSchema>;

export const hotelsSchema = z.object({
  lat: z.number().finite("lat non valida"),
  lng: z.number().finite("lng non valida"),
  radius: z.number().positive().max(50000).optional(),
  limit: z.number().int().min(1).max(50).optional(),
});
export type HotelsInput = z.infer<typeof hotelsSchema>;

export const segmentMultidaySchema = z.object({
  waypoints: z.array(z.object({
    lat: z.number().finite(),
    lng: z.number().finite(),
    name: z.string().optional(),
  })).min(2, "Almeno 2 waypoints richiesti").max(20),
  maxDailyKm: z.number().positive().max(3000).optional(),
  avoidHighways: z.boolean().optional(),
  preferCurvy: z.boolean().optional(),
});
export type SegmentMultidayInput = z.infer<typeof segmentMultidaySchema>;

export const aiPromptSchema = aiParsePromptSchema;
export type AiPromptInput = AiParsePromptInput;

export const calculateRouteRequestSchema = z.object({
  waypoints: z.array(z.object({
    lat: z.number().finite(),
    lng: z.number().finite(),
    name: z.string().optional(),
  })).min(2, "Almeno 2 waypoints richiesti"),
  style: z.enum(["direct", "fast", "balanced", "curvy", "extra_curvy"]).optional(),
  drivingProfile: z.enum(["geometric", "real", "my_style"]).optional(),
  routingProfile: z.enum(["auto_curvy"]).optional(),
  avoidHighways: z.boolean().optional(),
  avoidTolls: z.boolean().optional(),
  avoidFerries: z.boolean().optional(),
  avoidUnpaved: z.boolean().optional(),
  avoidWeather: z.boolean().optional(),
  roundTripHours: z.number().positive().optional(),
  isRoundTrip: z.boolean().optional(),
  roundTripDirection: z.string().optional(),
  headingDeg: z.number().optional(),
  language: z.string().optional(),
  geocodingOk: z.boolean().optional(),
});
export type CalculateRouteRequestInput = z.infer<typeof calculateRouteRequestSchema>;

export const poiRequestSchema = z.object({
  bbox: z.object({
    minLat: z.number().finite(),
    minLng: z.number().finite(),
    maxLat: z.number().finite(),
    maxLng: z.number().finite(),
  }),
  types: z.array(z.string()).optional(),
});
export type PoiRequestInput = z.infer<typeof poiRequestSchema>;

export const plannedGpxImportSchema = z.object({
  gpxContent: z.string().min(1, "gpxContent è obbligatorio"),
  title: z.string().max(200).optional().nullable(),
  visibility: z.enum(["public", "friends", "private"]).optional(),
});
export type PlannedGpxImportInput = z.infer<typeof plannedGpxImportSchema>;
