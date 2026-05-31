import { sendError } from "../../lib/api-response";
import { Router, Request, Response } from "express";
import { storage } from "../../storage";
import { requireAuth, decodePolyline } from "./utils";

const router = Router();

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

router.get("/:id/export.kml", async (req: Request, res: Response) => {
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
    const wptPlacemarks = waypoints
      .map((wp, i) => `    <Placemark>\n      <name>${escapeXml(wp.name ?? `Tappa ${i + 1}`)}</name>\n      <Point>\n        <coordinates>${wp.lng.toFixed(6)},${wp.lat.toFixed(6)},0</coordinates>\n      </Point>\n    </Placemark>`)
      .join("\n");

    const coords = trackPoints
      .map(([lat, lng]) => `${lng.toFixed(6)},${lat.toFixed(6)},0`)
      .join(" ");

    const kml = `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2">\n  <Document>\n    <name>${escapeXml(route.title)}</name>\n    <description>Esportato da BikerLink</description>\n    <TimeStamp><when>${now}</when></TimeStamp>\n${wptPlacemarks}\n    <Placemark>\n      <name>${escapeXml(route.title)}</name>\n      <Style>\n        <LineStyle>\n          <color>FF0000FF</color>\n          <width>4</width>\n        </LineStyle>\n      </Style>\n      <LineString>\n        <tessellate>1</tessellate>\n        <coordinates>${coords}</coordinates>\n      </LineString>\n    </Placemark>\n  </Document>\n</kml>`;

    res.setHeader("Content-Type", "application/vnd.google-earth.kml+xml");
    res.setHeader("Content-Disposition", `attachment; filename="giro-${route.id}.kml"`);
    return res.send(kml);
  } catch (err) {
    console.error("[kml] export error:", err);
    return sendError(res, 500, "Errore export KML");
  }
});

export default router;
