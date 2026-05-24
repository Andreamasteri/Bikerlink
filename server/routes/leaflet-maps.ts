import type { Request, Response } from "express";
import type { Express } from "express-serve-static-core";
import { LEAFLET_MAP_HTML } from "../../lib/leaflet-map-html";
import { buildLeafletMiniMapHtml } from "../../lib/leaflet-mini-map-html";
import { buildNavigationMapHtml } from "../../lib/leaflet-navigation-html";
import { buildLeafletTrackingMapHtml } from "../../lib/leaflet-tracking-map-html";
import { buildLeafletPickerMapHtml } from "../../lib/leaflet-picker-map-html";
import type { PickerWaypoint } from "../../lib/leaflet-picker-map-html";
import {
  buildLeafletCurvatureGradientHtml,
  buildLeafletRouteMapHtml,
} from "../../lib/leaflet/map-builder";
import type { RouteWaypoint } from "../../lib/leaflet/map-builder";

function sendHtml(res: Response, html: string) {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.send(html);
}

export function registerLeafletMapRoutes(app: Express) {
  app.get("/leaflet-map.html", (_req: Request, res: Response) => {
    sendHtml(res, LEAFLET_MAP_HTML);
  });

  app.get("/leaflet-mini-map.html", (req: Request, res: Response) => {
    const tileUrl = String(req.query.tileUrl || "");
    const tileMaxZoom = Number(req.query.tileMaxZoom) || 19;
    const lat = Number(req.query.lat) || 41.9028;
    const lng = Number(req.query.lng) || 12.4964;
    if (!tileUrl) return res.status(400).send("Missing tileUrl");
    sendHtml(res, buildLeafletMiniMapHtml(tileUrl, tileMaxZoom, lat, lng));
  });

  app.get("/leaflet-tracking-map.html", (req: Request, res: Response) => {
    const tileUrl = String(req.query.tileUrl || "");
    const tileMaxZoom = Number(req.query.tileMaxZoom) || 19;
    const accentColor = String(req.query.accentColor || "#FF6600");
    const debug = req.query.debug === "true";
    if (!tileUrl) return res.status(400).send("Missing tileUrl");
    sendHtml(res, buildLeafletTrackingMapHtml(tileUrl, tileMaxZoom, accentColor, debug));
  });

  app.get("/leaflet-picker-map.html", (req: Request, res: Response) => {
    const tileUrl = String(req.query.tileUrl || "");
    const tileMaxZoom = Number(req.query.tileMaxZoom) || 19;
    const lat = Number(req.query.lat) || 42.5;
    const lng = Number(req.query.lng) || 12.5;
    const zoom = Number(req.query.zoom) || 6;
    const accentColor = String(req.query.accentColor || "#FF6600");
    let waypoints: PickerWaypoint[] = [];
    let selectedCoord: { lat: number; lng: number } | null = null;
    try { waypoints = JSON.parse(String(req.query.waypoints || "[]")); } catch { /* ignore */ }
    try { selectedCoord = JSON.parse(String(req.query.selectedCoord || "null")); } catch { /* ignore */ }
    if (!tileUrl) return res.status(400).send("Missing tileUrl");
    sendHtml(res, buildLeafletPickerMapHtml(tileUrl, tileMaxZoom, lat, lng, zoom, waypoints, selectedCoord, accentColor));
  });

  app.get("/leaflet-navigation-map.html", (req: Request, res: Response) => {
    const tileUrl = String(req.query.tileUrl || "");
    let routeCoords: Array<[number, number]> = [];
    let stepCoords: Array<[number, number]> = [];
    try { routeCoords = JSON.parse(String(req.query.routeCoords || "[]")); } catch { /* ignore */ }
    try { stepCoords = JSON.parse(String(req.query.stepCoords || "[]")); } catch { /* ignore */ }
    if (!tileUrl) return res.status(400).send("Missing tileUrl");
    sendHtml(res, buildNavigationMapHtml(tileUrl, routeCoords, stepCoords));
  });

  app.get("/leaflet-curvature-map.html", (req: Request, res: Response) => {
    const tileUrl = String(req.query.tileUrl || "");
    const tileMaxZoom = Number(req.query.tileMaxZoom) || 19;
    let points: Array<{ lat: number; lng: number }> = [];
    try { points = JSON.parse(String(req.query.points || "[]")); } catch { /* ignore */ }
    if (!tileUrl) return res.status(400).send("Missing tileUrl");
    sendHtml(res, buildLeafletCurvatureGradientHtml(tileUrl, tileMaxZoom, points, null));
  });

  app.get("/leaflet-route-map.html", (req: Request, res: Response) => {
    const tileUrl = String(req.query.tileUrl || "");
    const tileMaxZoom = Number(req.query.tileMaxZoom) || 19;
    const accentColor = String(req.query.accentColor || "#FF6600");
    const showMarkers = req.query.showMarkers !== "false";
    let waypoints: RouteWaypoint[] = [];
    let typeColors: Record<string, string> = {};
    let trackPoints: Array<{ lat: number; lng: number; speedKmh?: number | null }> | undefined;
    try { waypoints = JSON.parse(String(req.query.waypoints || "[]")); } catch { /* ignore */ }
    try { typeColors = JSON.parse(String(req.query.typeColors || "{}")); } catch { /* ignore */ }
    try {
      const tp = JSON.parse(String(req.query.trackPoints || "[]"));
      if (Array.isArray(tp) && tp.length > 0) trackPoints = tp;
    } catch { /* ignore */ }
    if (!tileUrl) return res.status(400).send("Missing tileUrl");
    sendHtml(res, buildLeafletRouteMapHtml(tileUrl, tileMaxZoom, waypoints, accentColor, typeColors, showMarkers, trackPoints));
  });
}
