import type { Response } from "express";
import { ACTIVE_PROFILE } from "../graphhopper-client";
import {
  buildGeometricWeights,
  buildTelemetryWeightsForRoute,
  extractRouteWayIds,
  normalizeDrivingProfile,
  normalizeStyle,
  type PriorityRule,
  type TelemetryCoverage,
} from "./route-weights";
import { getActiveRouter, type RouterSelectorOptions } from "./router-selector";
import type { RouteRequest, RouteResult } from "./graphhopper-adapter";
import {
  buildWeatherAvoidAreas,
  fetchWeatherForWaypoints,
  samplePointsAlongPath,
  type WeatherSample,
} from "../routes/planned-routes/weather-helper";
import {
  resolveSegmentRouteIntent,
  type GlobalRouteIntent,
  type ResolvedSegmentRouteIntent,
  type SegmentRouteIntent,
} from "@shared/route-intents";

type RoutePath = RouteResult["paths"][number];

export interface RoutingWaypoint {
  lat: number;
  lng: number;
}

export interface SegmentRouteSummary {
  index: number;
  intent: ResolvedSegmentRouteIntent;
  distanceKm: number;
  durationMinutes: number;
  warning: string | null;
  weatherWarning: string | null;
  telemetryCoverage: TelemetryCoverage | null;
}

export interface SegmentedRoutePlan {
  path: RoutePath;
  warning: string | null;
  weatherWarning: string | null;
  telemetryCoverage: TelemetryCoverage | null;
  segments: SegmentRouteSummary[];
}

interface SegmentOutcome {
  path: RoutePath;
  summary: SegmentRouteSummary;
}

const COVERAGE_REASON_PRIORITY: TelemetryCoverage["reason"][] = [
  "engine_unsupported",
  "user_km_below_target",
  "no_community_data",
  "route_coverage_insufficient",
  "not_applicable",
];

function combineTelemetryCoverage(coverages: Array<TelemetryCoverage | null>): TelemetryCoverage | null {
  const usable = coverages.filter((coverage): coverage is TelemetryCoverage => coverage !== null);
  if (usable.length === 0) return null;

  const applied = usable.some((coverage) => coverage.reason === "applied");
  const reason = applied
    ? "applied"
    : COVERAGE_REASON_PRIORITY.find((candidate) => usable.some((coverage) => coverage.reason === candidate))
      ?? "not_applicable";
  const userCoverage = usable.find((coverage) => coverage.userKm !== null);

  return {
    reason,
    coveredSegments: usable.reduce((sum, coverage) => sum + coverage.coveredSegments, 0),
    requiredSegments: usable.reduce((sum, coverage) => sum + coverage.requiredSegments, 0),
    routeSegments: usable.reduce((sum, coverage) => sum + coverage.routeSegments, 0),
    userKm: userCoverage?.userKm ?? null,
    targetKm: userCoverage?.targetKm ?? null,
  };
}

function mergeSegmentPaths(paths: RoutePath[]): RoutePath {
  if (paths.length === 0) throw new Error("Nessun tratto calcolato");
  if (paths.length === 1) return paths[0];

  const coordinates: number[][] = [];
  const instructions: NonNullable<RoutePath["instructions"]> = [];
  let coordinateOffset = 0;
  let distance = 0;
  let time = 0;
  let weight = 0;

  for (const path of paths) {
    const segmentCoordinates = (path.points as { coordinates?: number[][] } | undefined)?.coordinates;
    if (!segmentCoordinates || segmentCoordinates.length === 0) {
      throw new Error("Il motore non ha restituito la geometria di un tratto");
    }

    const isFirstSegment = coordinates.length === 0;
    coordinates.push(...segmentCoordinates.slice(isFirstSegment ? 0 : 1));
    for (const instruction of path.instructions ?? []) {
      instructions.push({
        ...instruction,
        interval: [
          instruction.interval[0] + coordinateOffset,
          instruction.interval[1] + coordinateOffset,
        ],
      });
    }
    // La prima coordinata di ogni tratto successivo coincide con l'ultima
    // del precedente e viene rimossa dalla geometria finale.
    coordinateOffset = coordinates.length - 1;
    distance += path.distance;
    time += path.time;
    weight += path.weight ?? 0;
  }

  return {
    distance,
    time,
    ...(weight > 0 ? { weight } : {}),
    points: { coordinates },
    points_encoded: false,
    instructions,
  };
}

async function calculateOneSegment(params: {
  index: number;
  start: RoutingWaypoint;
  end: RoutingWaypoint;
  requestedIntent: SegmentRouteIntent | undefined;
  globalIntent: GlobalRouteIntent;
  routingProfile?: "auto_curvy" | "motorcycle" | "motorcycle_fast" | "car";
  userId: string;
  response: Response;
  geocodingOk: boolean;
}): Promise<SegmentOutcome> {
  const intent = resolveSegmentRouteIntent(params.requestedIntent, params.globalIntent);
  const style = normalizeStyle(intent.style);
  const drivingProfile = normalizeDrivingProfile(intent.drivingProfile);
  const isAutoCurvy = params.routingProfile === "auto_curvy";
  const profile = isAutoCurvy ? "auto_curvy" : (params.routingProfile ?? ACTIVE_PROFILE);
  const points: [number, number][] = [
    [params.start.lng, params.start.lat],
    [params.end.lng, params.end.lat],
  ];
  const { resolveRouterOpts } = await import("../routes/planned-routes/waypoints.next");
  const routerOpts: RouterSelectorOptions = await resolveRouterOpts(params.userId, points, style);
  const geometric = buildGeometricWeights(style, { avoidHighways: intent.avoidHighways });
  const avoidRules: PriorityRule[] = [];
  if (intent.avoidTolls) avoidRules.push({ if: "toll == ALL", multiply_by: 0.0 });
  if (intent.avoidFerries) avoidRules.push({ if: "road_environment == FERRY", multiply_by: 0.0 });
  if (intent.avoidUnpaved) avoidRules.push({ if: "road_environment == UNPAVED", multiply_by: 0.0 });
  const basePriority = [...geometric.priority, ...avoidRules];

  const runRoute = (priority: PriorityRule[], areas?: Record<string, unknown>) => {
    const body: RouteRequest = {
      points,
      profile,
      instructions: true,
      calc_points: true,
      points_encoded: false,
      optimize: false,
      elevation: true,
      details: ["osm_way_id"],
    };
    const customModel: Record<string, unknown> = {};
    if (priority.length > 0) customModel.priority = priority;
    if (geometric.distanceInfluence !== undefined) customModel.distance_influence = geometric.distanceInfluence;
    if (areas) customModel.areas = areas;
    if (Object.keys(customModel).length > 0) body.custom_model = customModel;
    return getActiveRouter(body, routerOpts, params.response, params.geocodingOk);
  };

  const base = await runRoute(basePriority);
  let path = base.paths[0];
  let effectivePriority = basePriority;
  let warning: string | null = null;
  let telemetryCoverage: TelemetryCoverage | null = null;

  if (!isAutoCurvy && drivingProfile !== "geometric") {
    const telemetry = await buildTelemetryWeightsForRoute(
      drivingProfile,
      params.userId,
      extractRouteWayIds(path as { details?: Record<string, unknown> }),
    );
    telemetryCoverage = telemetry.coverage;
    if (telemetry.applied) {
      try {
        const boosted = await runRoute([...basePriority, ...telemetry.priority]);
        path = boosted.paths[0];
        effectivePriority = [...basePriority, ...telemetry.priority];
      } catch (error) {
        console.warn("[routing] segment telemetry layer failed, keep geometric:", (error as Error)?.message ?? error);
        warning = "insufficient_data";
        telemetryCoverage = { ...telemetry.coverage, reason: "engine_unsupported" };
      }
    } else {
      warning = telemetry.warning;
    }
  }

  let weatherWarning: string | null = null;
  if (intent.avoidWeather) {
    try {
      const coordinates = (path.points as { coordinates?: number[][] } | undefined)?.coordinates;
      const samples = samplePointsAlongPath(coordinates, 8);
      if (samples.length > 0) {
        const departure = new Date(Date.now() + 3600_000);
        const weather = await fetchWeatherForWaypoints(samples, departure);
        const evaluated = weather.filter((sample): sample is WeatherSample => !!sample);
        const adverse = evaluated.filter((sample) => !sample.isSuitable);
        if (evaluated.length === 0) {
          weatherWarning = "weather_unavoidable";
        } else if (adverse.length > 0) {
          const avoid = buildWeatherAvoidAreas(adverse.map((sample) => ({ lat: sample.lat, lng: sample.lng })));
          try {
            const rerouted = await runRoute([...effectivePriority, ...avoid.priority], avoid.areas);
            path = rerouted.paths[0];
            const reroutedCoordinates = (path.points as { coordinates?: number[][] } | undefined)?.coordinates;
            const reroutedWeather = await fetchWeatherForWaypoints(samplePointsAlongPath(reroutedCoordinates, 8), departure);
            if (reroutedWeather.some((sample) => !!sample && !sample.isSuitable)) weatherWarning = "weather_unavoidable";
          } catch (error) {
            console.warn("[routing] segment weather avoidance failed, keep route:", (error as Error)?.message ?? error);
            weatherWarning = "weather_unavoidable";
          }
        }
      }
    } catch (error) {
      console.warn("[routing] segment weather sampling failed:", (error as Error)?.message ?? error);
      weatherWarning = "weather_unavoidable";
    }
  }

  return {
    path,
    summary: {
      index: params.index,
      intent,
      distanceKm: Math.round(path.distance / 100) / 10,
      durationMinutes: Math.round(path.time / 60_000),
      warning,
      weatherWarning,
      telemetryCoverage,
    },
  };
}

export async function calculateSegmentedRoute(params: {
  waypoints: RoutingWaypoint[];
  segmentIntents: SegmentRouteIntent[];
  globalIntent: GlobalRouteIntent;
  routingProfile?: "auto_curvy" | "motorcycle" | "motorcycle_fast" | "car";
  userId: string;
  response: Response;
  geocodingOk: boolean;
}): Promise<SegmentedRoutePlan> {
  const outcomes: SegmentOutcome[] = [];
  for (let index = 0; index < params.segmentIntents.length; index += 1) {
    outcomes.push(await calculateOneSegment({
      index,
      start: params.waypoints[index],
      end: params.waypoints[index + 1],
      requestedIntent: params.segmentIntents[index],
      globalIntent: params.globalIntent,
      routingProfile: params.routingProfile,
      userId: params.userId,
      response: params.response,
      geocodingOk: params.geocodingOk,
    }));
  }

  const segments = outcomes.map((outcome) => outcome.summary);
  return {
    path: mergeSegmentPaths(outcomes.map((outcome) => outcome.path)),
    warning: segments.find((segment) => segment.warning)?.warning ?? null,
    weatherWarning: segments.find((segment) => segment.weatherWarning)?.weatherWarning ?? null,
    telemetryCoverage: combineTelemetryCoverage(segments.map((segment) => segment.telemetryCoverage)),
    segments,
  };
}
