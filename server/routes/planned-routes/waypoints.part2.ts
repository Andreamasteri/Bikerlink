
import { Request, Response } from "express";
import { requireAuth } from "./utils";
import { sendError } from "../../lib/api-response";
import { calculateRouteRequestSchema } from "@shared/validators";
import { extractElevationProfile } from "./waypoints-helpers";
import { ACTIVE_PROFILE } from "../../graphhopper-client";
import {
  getActiveRouter,
  CrossGroupRoutingError,
  AreaNotEnabledError,
  AutoCurvyOfflineError,
} from "../../routing/router-selector";
import type { RouteRequest } from "../../routing/graphhopper-adapter";
import { ROUTING_AREA_OUTCOME_MESSAGES } from "@shared/routing-areas";
import {
  buildGeometricWeights,
  buildTelemetryWeightsForRoute,
  extractRouteWayIds,
  normalizeStyle,
  normalizeDrivingProfile,
} from "../../routing/route-weights";
import type { TelemetryCoverage } from "../../routing/route-weights";
import {
  fetchWeatherForWaypoints,
  samplePointsAlongPath,
  buildWeatherAvoidAreas,
  type WeatherSample,
} from "./weather-helper";

export async function handleCalculateRoute(req: Request, res: Response) {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const parsedCalc = calculateRouteRequestSchema.safeParse(req.body);
  if (!parsedCalc.success) {
    return sendError(res, 400, parsedCalc.error.issues[0].message);
  }
  const {
    waypoints,
    style = "curvy",
    drivingProfile = "geometric",
    routingProfile,
    avoidHighways = false,
    avoidTolls = false,
    avoidFerries = false,
    avoidUnpaved = false,
    avoidWeather = false,
    roundTripHours,
    isRoundTrip,
    roundTripDirection,
    headingDeg,
    language: _language,
    geocodingOk: clientGeocodingOk,
  } = parsedCalc.data;

  const normStyle = normalizeStyle(style);
  const normProfile = normalizeDrivingProfile(drivingProfile);
  // "auto panoramica": profilo veicolo Valhalla (costing auto curvy). È un asse
  // distinto dallo stile/telemetria moto — quando attivo, il router-selector
  // instrada SEMPRE a Valhalla senza fallback a GraphHopper.
  const isAutoCurvy = routingProfile === "auto_curvy";
  // Profilo GH self-hosted da usare: se l'utente ha scelto esplicitamente
  // "motorcycle_fast" o "car", usiamo quel profilo; altrimenti il default
  // ACTIVE_PROFILE ("motorcycle"). "auto_curvy" non passa a GH (va a Valhalla).
  const ghProfile: string = (routingProfile && routingProfile !== "auto_curvy")
    ? routingProfile
    : ACTIVE_PROFILE;

  const DIRECTION_DEGREES: Record<string, number> = {
    N: 0, NE: 45, E: 90, SE: 135, S: 180, SO: 225, O: 270, NO: 315,
  };

  let effectiveWaypoints = waypoints;
  if (isRoundTrip && roundTripDirection && DIRECTION_DEGREES[roundTripDirection] !== undefined) {
    const headingDeg = DIRECTION_DEGREES[roundTripDirection];
    const headingRad = headingDeg * Math.PI / 180;
    const start = waypoints[0];
    const styleAvgSpeed: Record<string, number> = { direct: 80, curvy: 55, balanced: 65, fast: 85, extra_curvy: 50 };
    const avgKmh = styleAvgSpeed[normStyle] ?? 65;
    const offsetKm = (roundTripHours ?? 2) * avgKmh * 0.4;
    const deltaLat = offsetKm / 111.32;
    const deltaLng = offsetKm / (111.32 * Math.cos(start.lat * Math.PI / 180));
    const midLat = start.lat + deltaLat * Math.cos(headingRad);
    const midLng = start.lng + deltaLng * Math.sin(headingRad);
    const last = waypoints[waypoints.length - 1];
    const otherWps = waypoints.slice(1, -1);
    effectiveWaypoints = [
      start,
      { lat: midLat, lng: midLng },
      ...otherWps,
      last,
    ];
  }

  let myStyleWarning: string | null = null;
  let telemetryCoverage: TelemetryCoverage | null = null;

  try {
    const body: Record<string, unknown> = {
      points: effectiveWaypoints.map((wp) => [wp.lng, wp.lat]),
      profile: isAutoCurvy ? "auto_curvy" : ghProfile,
      instructions: true,
      calc_points: true,
      points_encoded: false,
      optimize: false,
      elevation: true,
    };

    if (isRoundTrip && headingDeg !== undefined && headingDeg !== null) {
      body.heading = headingDeg;
    }

    // Strato geometrico (base stabile per tutti i profili) + regole di avoidance.
    const geo = buildGeometricWeights(normStyle, { avoidHighways });
    const avoidRules: Array<{ if: string; multiply_by: number }> = [];
    if (avoidTolls) avoidRules.push({ if: "toll == ALL", multiply_by: 0.0 });
    if (avoidFerries) avoidRules.push({ if: "road_environment == FERRY", multiply_by: 0.0 });
    if (avoidUnpaved) avoidRules.push({ if: "road_environment == UNPAVED", multiply_by: 0.0 });
    const basePriority = [...geo.priority, ...avoidRules];

    const { resolveRouterOpts } = await import("./waypoints.next");
    const routerOpts = await resolveRouterOpts(userId, body.points as [number, number][], normStyle);

    // geocodingOk: il client informa il server se il geocoding è andato a buon
    // fine per tutti i waypoint (es. Nominatim disponibile). Se assente, si
    // assume true (coordinate già risolte o fornite direttamente via GPS/mappa).
    const geocodingOk = clientGeocodingOk ?? true;

    const runRoute = (
      priorityRules: Array<{ if: string; multiply_by: number }>,
      areas?: Record<string, unknown>,
    ) => {
      // Richiediamo i details osm_way_id per poter valutare la copertura
      // telemetrica sui segmenti effettivi del percorso.
      const reqBody: Record<string, unknown> = { ...body, details: ["osm_way_id"] };
      const customModel: Record<string, unknown> = {};
      if (priorityRules.length > 0) customModel.priority = priorityRules;
      if (geo.distanceInfluence !== undefined) customModel.distance_influence = geo.distanceInfluence;
      if (areas) customModel.areas = areas;
      if (Object.keys(customModel).length > 0) reqBody.custom_model = customModel;
      return getActiveRouter(reqBody as unknown as RouteRequest, routerOpts, res, geocodingOk);
    };

    // Percorso geometrico di base: è il risultato per il profilo "geometric" e
    // la base su cui valutare la copertura telemetrica del percorso richiesto.
    const baseResult = await runRoute(basePriority);
    let path = baseResult.paths[0];
    // Insieme di regole di priorità effettivamente applicate al percorso finale
    // (base + eventuale strato telemetrico). Serve come base per l'eventuale
    // ricalcolo "evita maltempo" così da non perdere gli altri vincoli.
    let effectivePriority = basePriority;

    // Strato telemetrico opzionale (real / my_style): applicato SOLO se i
    // segmenti effettivi del percorso hanno copertura curvy_score valida.
    // Altrimenti si mantiene il percorso geometrico e si segnala il warning.
    // Saltato per "auto panoramica": la telemetria è specifica per la moto e
    // Valhalla non applica il custom_model GraphHopper.
    if (!isAutoCurvy && normProfile !== "geometric") {
      const routeWayIds = extractRouteWayIds(path as { details?: Record<string, unknown> });
      const telemetry = await buildTelemetryWeightsForRoute(normProfile, userId, routeWayIds);
      telemetryCoverage = telemetry.coverage;
      if (telemetry.applied) {
        try {
          const boosted = await runRoute([...basePriority, ...telemetry.priority]);
          path = boosted.paths[0];
          effectivePriority = [...basePriority, ...telemetry.priority];
        } catch (telemetryErr: unknown) {
          // Lo strato telemetrico (regole su osm_way_id) può non essere supportato
          // dal motore di routing: mantieni il geometrico (fallback stabile) e
          // segnala lo stato strutturato all'utente.
          console.warn("[routing] telemetry layer failed, keep geometric:", (telemetryErr as Error)?.message ?? telemetryErr);
          myStyleWarning = "insufficient_data";
          telemetryCoverage = { ...telemetry.coverage, reason: "engine_unsupported" };
        }
      } else {
        myStyleWarning = telemetry.warning;
      }
    }

    // Strato meteo opzionale ("evita zone con maltempo"): campiona il meteo lungo
    // il percorso finale e, se trova zone avverse, ricalcola evitandole. Se non è
    // possibile evitarle (motore senza supporto aree o zone inevitabili) si tiene
    // il percorso migliore disponibile e si restituisce un warning STRUTTURATO —
    // mai un fallimento silenzioso.
    let weatherWarning: string | null = null;
    if (avoidWeather) {
      try {
        const coords = (path.points as { coordinates?: number[][] })?.coordinates;
        const samples = samplePointsAlongPath(coords, 8);
        if (samples.length > 0) {
          const departure = new Date(Date.now() + 3600_000);
          const weather = await fetchWeatherForWaypoints(samples, departure);
          const evaluated = weather.filter((w): w is WeatherSample => !!w);
          const adverse = evaluated.filter((w) => !w.isSuitable);
          if (evaluated.length === 0) {
            // Provider meteo degradato: nessun punto valutabile → non possiamo
            // confermare l'assenza di maltempo. Mai un fallimento silenzioso.
            weatherWarning = "weather_unavoidable";
          } else if (adverse.length > 0) {
            const avoid = buildWeatherAvoidAreas(adverse.map((a) => ({ lat: a.lat, lng: a.lng })));
            try {
              const rerouted = await runRoute([...effectivePriority, ...avoid.priority], avoid.areas);
              const newPath = rerouted.paths[0];
              const newCoords = (newPath.points as { coordinates?: number[][] })?.coordinates;
              const newSamples = samplePointsAlongPath(newCoords, 8);
              const newWeather = await fetchWeatherForWaypoints(newSamples, departure);
              const stillAdverse = newWeather.filter((w): w is WeatherSample => !!w && !w.isSuitable);
              // Adottiamo comunque il percorso ricalcolato (best effort), ma se
              // restano zone avverse segnaliamo che il maltempo non è evitabile.
              path = newPath;
              if (stillAdverse.length > 0) weatherWarning = "weather_unavoidable";
            } catch (avoidErr: unknown) {
              console.warn("[routing] weather avoidance failed, keep route:", (avoidErr as Error)?.message ?? avoidErr);
              weatherWarning = "weather_unavoidable";
            }
          }
        }
      } catch (weatherErr: unknown) {
        // Campionamento meteo non disponibile: non blocchiamo il calcolo del
        // percorso, ma non possiamo confermare l'assenza di maltempo.
        console.warn("[routing] weather sampling failed:", (weatherErr as Error)?.message ?? weatherErr);
        weatherWarning = "weather_unavoidable";
      }
    }

    return res.json({
      encoded: path.points,
      distanceKm: Math.round(path.distance / 100) / 10,
      durationMinutes: Math.round(path.time / 60000),
      instructions: path.instructions ?? [],
      bikerScore: 0.8,
      elevation: extractElevationProfile(path.points as string, (path as { points_encoded?: boolean; points?: { coordinates?: number[][] } }).points_encoded === false ? (path.points as { coordinates?: number[][] })?.coordinates : undefined),
      warning: myStyleWarning,
      weatherWarning,
      telemetryCoverage,
    });
  } catch (err: unknown) {
    // Esiti bloccanti del routing ad aree: risposta 422 tipizzata { code, message }
    // con messaggio amichevole in italiano (lockstep col contratto condiviso).
    if (err instanceof CrossGroupRoutingError || err instanceof AreaNotEnabledError) {
      return res.status(422).json({
        code: err.code,
        message: ROUTING_AREA_OUTCOME_MESSAGES[err.code],
      });
    }
    // Auto Panoramica + ThinkCentre offline: errore immediato (nessun timeout).
    if (err instanceof AutoCurvyOfflineError) {
      return sendError(res, 503, err.message);
    }
    const errMsg = (err as Error)?.message ?? "Errore di routing";
    console.error("[routing] error:", errMsg);
    const isWaypointError = errMsg.includes("HTTP 400") || errMsg.toLowerCase().includes("cannot find point") || errMsg.toLowerCase().includes("point 0 is out");
    if (isWaypointError) {
      return sendError(res, 422, "Waypoint non raggiungibili: verifica i punti selezionati sulla mappa");
    }
    if (isAutoCurvy) {
      return sendError(res, 503, "Server panoramico non disponibile al momento. Riprova più tardi o scegli un altro profilo.");
    }
    return sendError(res, 503, "Server di routing non disponibile al momento, riprova tra qualche secondo");
  }
}
