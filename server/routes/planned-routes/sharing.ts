// LARGE-FILE-LOCKED — limite: 246
// Aggiungi nuove funzionalità in: server/routes/planned-routes/sharing.next.ts
import { sendError } from "../../lib/api-response";
import { Router, Request, Response } from "express";
import { storage } from "../../storage";
import { requireAuth, decodePolyline, escapeXml } from "./utils";
import { plannedGpxImportSchema } from "@shared/validators";
import { haversineKm } from "../../geo";
import type { InsertPlannedRoute } from "@shared/db";
import { PROTECTED_NICKNAMES } from "../../constants";

const router = Router();

router.get("/compatible-bikers/:id", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const id = req.params["id"] as string;

  try {
    const route = await storage.getPlannedRoute(id);
    if (!route) return sendError(res, 404, "Percorso non trovato");

    const waypoints = (route.waypoints as Array<{ lat: number; lng: number; name?: string }>) ?? [];
    const originWp = waypoints.find((wp) => wp.lat !== 0 && wp.lng !== 0);
    if (!originWp) return res.json({ bikers: [], count: 0 });

    const { db } = await import("../../db");
    const { sql } = await import("drizzle-orm");

    const styleToRiderStyles: Record<string, string[]> = {
      curvy: ["sport", "adventure", "enduro", "touring", "sport_touring"],
      balanced: ["touring", "sport_touring", "naked", "adventure", "sport"],
      fast: ["sport", "sport_touring", "naked", "superbike"],
    };
    const compatibleStyles = styleToRiderStyles[route.style ?? "balanced"] ?? [];

    const nearbyProfiles = await db.execute(sql`
      SELECT up.user_id, up.latitude, up.longitude, u.nickname, u.user_type,
             u.avatar_url, up.riding_style, up.is_available, up.hide_from_map,
             u.last_login_at,
             GREATEST(0, 50 - (
               6371 * acos(
                 cos(radians(${originWp.lat})) * cos(radians(up.latitude)) *
                 cos(radians(up.longitude) - radians(${originWp.lng})) +
                 sin(radians(${originWp.lat})) * sin(radians(up.latitude))
               )
             )) AS proximity_score,
             CASE WHEN up.riding_style = ANY(${compatibleStyles}) THEN 30 ELSE 0 END AS style_score,
             CASE WHEN up.is_available IS TRUE THEN 20 ELSE 0 END AS avail_score
      FROM user_profiles up
      JOIN users u ON u.id = up.user_id
      WHERE up.latitude IS NOT NULL AND up.longitude IS NOT NULL
        AND u.status = 'active' AND u.id != ${userId}
        AND up.hide_from_map IS NOT TRUE
        AND u.nickname <> ALL(${sql.raw(`ARRAY['${PROTECTED_NICKNAMES.join("','")}']`)})
        AND (u.last_login_at IS NULL OR u.last_login_at > NOW() - INTERVAL '30 days')
        AND (
          6371 * acos(
            cos(radians(${originWp.lat})) * cos(radians(up.latitude)) *
            cos(radians(up.longitude) - radians(${originWp.lng})) +
            sin(radians(${originWp.lat})) * sin(radians(up.latitude))
          )
        ) < 50
      ORDER BY (
        GREATEST(0, 50 - (
          6371 * acos(
            cos(radians(${originWp.lat})) * cos(radians(up.latitude)) *
            cos(radians(up.longitude) - radians(${originWp.lng})) +
            sin(radians(${originWp.lat})) * sin(radians(up.latitude))
          )
        )) +
        CASE WHEN up.riding_style = ANY(${compatibleStyles}) THEN 30 ELSE 0 END +
        CASE WHEN up.is_available IS TRUE THEN 20 ELSE 0 END
      ) DESC
      LIMIT 15
    `);

    type BikerRow = { user_id: string; nickname: string; user_type: string; avatar_url: string | null; riding_style: string | null; is_available: boolean; latitude: number; longitude: number; proximity_score: number; style_score: number; avail_score: number };
    const bikers = (nearbyProfiles.rows as BikerRow[]).map((r) => ({
      userId: r.user_id,
      nickname: r.nickname,
      userType: r.user_type,
      avatarUrl: r.avatar_url,
      ridingStyle: r.riding_style,
      isAvailable: r.is_available,
      styleCompatible: compatibleStyles.includes(r.riding_style ?? ""),
      distanceKm: originWp ? Math.round(haversineKm(originWp.lat, originWp.lng, r.latitude, r.longitude)) : null,
      matchScore: Math.round(Number(r.proximity_score ?? 0) + Number(r.style_score ?? 0) + Number(r.avail_score ?? 0)),
    }));

    await storage.updatePlannedRoute(id, {
      metadata: {
        ...(route.metadata as object ?? {}),
        bikerCount: bikers.length,
        bikerUpdatedAt: new Date().toISOString(),
      },
    }).catch(() => {});

    return res.json({ bikers, count: bikers.length, routeId: id });
  } catch (err) {
    console.error("[compatible-bikers] error:", err);
    return res.json({ bikers: [], count: 0 });
  }
});

router.post("/import-gpx", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const parsedGpxImport = plannedGpxImportSchema.safeParse(req.body);
  if (!parsedGpxImport.success) {
    return sendError(res, 400, parsedGpxImport.error.issues[0].message);
  }
  const { gpxContent, title: titleOverride, visibility = "public" } = parsedGpxImport.data;

  try {
    function gpxAttr(tag: string, attr: string): string | null {
      const m = tag.match(new RegExp(`\\b${attr}\\s*=\\s*['"]([^'"]+)['"]`, "i"));
      return m?.[1] ?? null;
    }

    const wptOpenTagRegex = /<wpt\b([^>]*?)>/g;
    const waypoints: Array<{ lat: number; lng: number; name: string }> = [];
    let wptTagMatch;
    while ((wptTagMatch = wptOpenTagRegex.exec(gpxContent)) !== null) {
      const attrs = wptTagMatch[1];
      const lat = gpxAttr(attrs, "lat");
      const lon = gpxAttr(attrs, "lon");
      if (!lat || !lon) continue;
      const rest = gpxContent.slice(wptTagMatch.index + wptTagMatch[0].length);
      const nameM = rest.match(/^[\s\S]*?(?:<name>([^<]*)<\/name>)?[\s\S]*?<\/wpt>/);
      waypoints.push({
        lat: parseFloat(lat),
        lng: parseFloat(lon),
        name: nameM?.[1] ?? "",
      });
    }

    const trkPtOpenTagRegex = /<trkpt\b([^>]*?)\/?>/g;
    const trackPoints: [number, number][] = [];
    let trkMatch;
    while ((trkMatch = trkPtOpenTagRegex.exec(gpxContent)) !== null) {
      const attrs = trkMatch[1];
      const lat = gpxAttr(attrs, "lat");
      const lon = gpxAttr(attrs, "lon");
      if (lat && lon) trackPoints.push([parseFloat(lat), parseFloat(lon)]);
    }

    const nameMeta = gpxContent.match(/<metadata>[\s\S]*?<name>([^<]*)<\/name>[\s\S]*?<\/metadata>/);
    const trkName = gpxContent.match(/<trk>[\s\S]*?<name>([^<]*)<\/name>/);
    const gpxTitle = titleOverride ?? nameMeta?.[1] ?? trkName?.[1] ?? "Percorso importato";

    let distanceKm = 0;
    for (let i = 1; i < trackPoints.length; i++) {
      distanceKm += haversineKm(trackPoints[i-1][0], trackPoints[i-1][1], trackPoints[i][0], trackPoints[i][1]);
    }

    const finalWaypoints = waypoints.length > 0 ? waypoints :
      trackPoints.length >= 2 ? [
        { lat: trackPoints[0][0], lng: trackPoints[0][1], name: "Partenza" },
        { lat: trackPoints[trackPoints.length-1][0], lng: trackPoints[trackPoints.length-1][1], name: "Arrivo" },
      ] : [];

    if (finalWaypoints.length < 2 && trackPoints.length < 2) {
      return sendError(res, 400, "GPX non valido: nessun waypoint o traccia trovata");
    }

    const routeData: InsertPlannedRoute = {
      userId,
      title: gpxTitle,
      waypoints: finalWaypoints,
      polyline: null,
      distanceKm: Math.round(distanceKm * 10) / 10,
      durationMinutes: Math.round(distanceKm / 70 * 60),
      bikerScore: 0.5,
      style: "balanced",
      visibility,
      isMultiDay: false,
      metadata: { importedFromGpx: true, trackPointCount: trackPoints.length },
    };

    const route = await storage.createPlannedRoute(routeData);

    return res.status(201).json(route);
  } catch (err) {
    console.error("[import-gpx] error:", err);
    return sendError(res, 500, "Errore importazione GPX");
  }
});

router.get("/:id/export.gpx", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const id = req.params["id"] as string;

  try {
    const route = await storage.getPlannedRoute(id);
    if (!route) return sendError(res, 404, "Non trovato");
    if (route.userId !== userId && route.visibility !== "public") {
      return sendError(res, 403, "Non autorizzato");
    }

    const waypoints = (route.waypoints as Array<{ lat: number; lng: number; name?: string }>) ?? [];
    let trackPoints: [number, number][] = [];

    if (route.polyline) {
      trackPoints = decodePolyline(route.polyline);
    } else if (waypoints.length) {
      trackPoints = waypoints.map((wp) => [wp.lat, wp.lng]);
    }

    const now = new Date().toISOString();
    const trkpts = trackPoints
      .map(([lat, lng]) => `    <trkpt lat="${lat.toFixed(6)}" lon="${lng.toFixed(6)}"></trkpt>`)
      .join("\n");

    const wpts = waypoints
      .map((wp, i) => `  <wpt lat="${wp.lat.toFixed(6)}" lon="${wp.lng.toFixed(6)}"><name>${escapeXml(wp.name ?? `Tappa ${i + 1}`)}</name></wpt>`)
      .join("\n");

    const gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="BikerLink" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>${escapeXml(route.title)}</name>
    <time>${now}</time>
  </metadata>
${wpts}
  <trk>
    <name>${escapeXml(route.title)}</name>
    <trkseg>
${trkpts}
    </trkseg>
  </trk>
</gpx>`;

    res.setHeader("Content-Type", "application/gpx+xml");
    res.setHeader("Content-Disposition", `attachment; filename="giro-${route.id}.gpx"`);
    return res.send(gpx);
  } catch (err) {
    console.error("[gpx] export error:", err);
    return sendError(res, 500, "Errore export GPX");
  }
});

export default router;
