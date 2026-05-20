// ── Interactive planner map: tap-to-add waypoints ────────────────────────────

export interface PlannerWaypoint {
  lat: number;
  lng: number;
  name: string;
}

export function buildPlannerMapHtml(
  tileUrl: string,
  tileMaxZoom: number,
  accentColor: string,
  waypoints: PlannerWaypoint[],
  routePolylinePts?: Array<{ lat: number; lng: number }>,
  compassDirection?: string | null
): string {
  const wpsJson = JSON.stringify(waypoints.filter((w) => w.lat !== 0 || w.lng !== 0));
  const polyJson = JSON.stringify(routePolylinePts ?? []);
  const initialDir = compassDirection ?? null;
  const initialDirJs = JSON.stringify(initialDir);

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"/>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body, #map { width: 100%; height: 100%; background: #1a1a1a; }
.leaflet-container { background: #1a1a1a !important; }
.leaflet-control-zoom { display: none !important; }
.leaflet-control-attribution { font-size: 8px !important; opacity: 0.4; }
#tap-hint {
  position: absolute; bottom: 8px; left: 50%; transform: translateX(-50%);
  background: rgba(0,0,0,0.72); color: #ccc; font-size: 11px;
  padding: 5px 10px; border-radius: 20px; z-index: 2000;
  pointer-events: none; white-space: nowrap;
  font-family: -apple-system, sans-serif;
}
@keyframes dir-flow {
  from { stroke-dashoffset: 24; }
  to   { stroke-dashoffset: 0; }
}
.dir-arrow-path {
  animation: dir-flow 0.7s linear infinite;
}
</style>
</head>
<body>
<div id="map"></div>
<div id="tap-hint">Tocca la mappa per aggiungere una tappa</div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
(function() {
  var waypoints = ${wpsJson};
  var routePts = ${polyJson};
  var accent = ${JSON.stringify(accentColor)};

  var map = L.map("map", { zoomControl: false, attributionControl: true });
  L.tileLayer(${JSON.stringify(tileUrl)}, { maxZoom: ${tileMaxZoom}, attribution: "" }).addTo(map);

  function wpIcon(idx, total) {
    var bg = idx === 0 ? "#22c55e" : idx === total - 1 ? "#ef4444" : accent;
    var label = idx === 0 ? "P" : idx === total - 1 ? "A" : String(idx);
    return L.divIcon({
      html: "<div style=\\"width:26px;height:26px;border-radius:13px;background:" + bg + ";border:2.5px solid #fff;" +
        "box-shadow:0 2px 6px rgba(0,0,0,0.55);display:flex;align-items:center;justify-content:center;" +
        "font-size:11px;font-weight:700;color:#fff;\\">" + label + "</div>",
      className: "", iconSize: [26,26], iconAnchor: [13,13]
    });
  }

  var wpMarkers = [];
  function renderWaypoints() {
    wpMarkers.forEach(function(m) { map.removeLayer(m); });
    wpMarkers = [];
    waypoints.forEach(function(wp, idx) {
      var m = L.marker([wp.lat, wp.lng], { icon: wpIcon(idx, waypoints.length) })
        .bindTooltip(wp.name || ("Tappa " + (idx+1)), { permanent: false, direction: "top" })
        .addTo(map);
      wpMarkers.push(m);
    });
  }

  // ── Curvature gradient helpers ────────────────────────────────────────────
  function bearing(p1, p2) {
    var dLng = (p2.lng - p1.lng) * Math.PI / 180;
    var lat1 = p1.lat * Math.PI / 180;
    var lat2 = p2.lat * Math.PI / 180;
    var y = Math.sin(dLng) * Math.cos(lat2);
    var x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
    return Math.atan2(y, x) * 180 / Math.PI;
  }
  function angleDiff(a, b) {
    var d = Math.abs(a - b) % 360;
    return d > 180 ? 360 - d : d;
  }
  function curvatureColor(angle) {
    var t = Math.min(1, angle / 90);
    if (t < 0.33) {
      var s = t / 0.33;
      return "rgb(" + Math.round(34 + s*(234-34)) + "," + Math.round(197 + s*(179-197)) + ",58)";
    } else if (t < 0.66) {
      var s2 = (t - 0.33) / 0.33;
      return "rgb(" + Math.round(234 + s2*(249-234)) + "," + Math.round(179 + s2*(115-179)) + ",0)";
    } else {
      var s3 = (t - 0.66) / 0.34;
      return "rgb(" + Math.round(249 + s3*(239-249)) + "," + Math.round(115 + s3*(68-115)) + ",68)";
    }
  }

  var routeSegments = [];
  var routeFallback = null;

  function clearRouteLayer() {
    routeSegments.forEach(function(seg) { map.removeLayer(seg); });
    routeSegments = [];
    if (routeFallback) { map.removeLayer(routeFallback); routeFallback = null; }
  }

  function renderCurvatureRoute(pts) {
    clearRouteLayer();
    if (pts.length < 2) return;
    var bearings = [];
    for (var i = 0; i < pts.length - 1; i++) {
      bearings.push(bearing(pts[i], pts[i+1]));
    }
    for (var j = 0; j < pts.length - 1; j++) {
      var prevB = j > 0 ? bearings[j-1] : bearings[j];
      var nextB = j < bearings.length - 1 ? bearings[j+1] : bearings[j];
      var angle = (angleDiff(prevB, bearings[j]) + angleDiff(bearings[j], nextB)) / 2;
      var col = curvatureColor(angle);
      var seg = L.polyline([[pts[j].lat, pts[j].lng], [pts[j+1].lat, pts[j+1].lng]],
        { color: col, weight: 4.5, opacity: 0.92 }).addTo(map);
      routeSegments.push(seg);
    }
  }

  function renderRoute() {
    if (routePts.length > 1) {
      renderCurvatureRoute(routePts);
    } else {
      clearRouteLayer();
      if (waypoints.length > 1) {
        routeFallback = L.polyline(waypoints.map(function(w) { return [w.lat, w.lng]; }),
          { color: accent, weight: 2, dashArray: "6 4", opacity: 0.6 }).addTo(map);
      }
    }
  }

  renderWaypoints();
  renderRoute();

  // Fit map to content
  var allPts = routePts.length > 1 ? routePts : waypoints;
  if (allPts.length > 1) {
    var lats = allPts.map(function(p) { return p.lat; });
    var lngs = allPts.map(function(p) { return p.lng; });
    map.fitBounds([[Math.min.apply(null,lats), Math.min.apply(null,lngs)],
                   [Math.max.apply(null,lats), Math.max.apply(null,lngs)]], { padding: [24,24], animate: false });
  } else if (allPts.length === 1) {
    map.setView([allPts[0].lat, allPts[0].lng], 13, { animate: false });
  } else {
    map.setView([45.5, 10.5], 6, { animate: false });
  }

  // ── Compass direction arrow ───────────────────────────────────────────────
  var COMPASS_BEARING = { N:0, NE:45, E:90, SE:135, S:180, SO:225, O:270, NO:315 };
  var dirArrowLine = null;
  var dirArrowHead = null;
  var currentDir = ${initialDirJs};

  function destPoint(lat, lng, bearingDeg, distKm) {
    var R = 6371;
    var d = distKm / R;
    var brng = bearingDeg * Math.PI / 180;
    var lat1 = lat * Math.PI / 180;
    var lng1 = lng * Math.PI / 180;
    var lat2 = Math.asin(Math.sin(lat1)*Math.cos(d) + Math.cos(lat1)*Math.sin(d)*Math.cos(brng));
    var lng2 = lng1 + Math.atan2(Math.sin(brng)*Math.sin(d)*Math.cos(lat1), Math.cos(d)-Math.sin(lat1)*Math.sin(lat2));
    return [lat2 * 180/Math.PI, lng2 * 180/Math.PI];
  }

  function renderDirectionArrow(dir) {
    if (dirArrowLine) { map.removeLayer(dirArrowLine); dirArrowLine = null; }
    if (dirArrowHead) { map.removeLayer(dirArrowHead); dirArrowHead = null; }
    if (!dir || waypoints.length === 0) return;
    var bearing = COMPASS_BEARING[dir];
    if (bearing === undefined) return;
    var origin = waypoints[0];
    var midPt  = destPoint(origin.lat, origin.lng, bearing, 40);
    var tipPt  = destPoint(origin.lat, origin.lng, bearing, 70);

    dirArrowLine = L.polyline(
      [[origin.lat, origin.lng], midPt, tipPt],
      { color: "#facc15", weight: 3, dashArray: "10 8", opacity: 0.9, interactive: false }
    ).addTo(map);

    // Apply CSS animation to the SVG path element
    var pathEl = dirArrowLine.getElement();
    if (pathEl) { pathEl.classList.add("dir-arrow-path"); }

    // Arrowhead (rotated triangle)
    var rot = bearing;
    var arrowHtml = "<div style=\\"width:0;height:0;" +
      "border-left:8px solid transparent;border-right:8px solid transparent;" +
      "border-bottom:18px solid #facc15;" +
      "transform:rotate(" + rot + "deg);opacity:0.95;filter:drop-shadow(0 0 4px rgba(250,204,21,0.6));\\"></div>";
    dirArrowHead = L.marker(tipPt, {
      icon: L.divIcon({ html: arrowHtml, className: "", iconSize: [16, 18], iconAnchor: [8, 9] }),
      interactive: false
    }).addTo(map);
  }

  renderDirectionArrow(currentDir);

  window.updateCompassDirection = function(dir) {
    currentDir = dir;
    renderDirectionArrow(dir);
  };

  // Tap handler
  map.on("click", function(e) {
    var msg = JSON.stringify({ type: "tap", lat: e.latlng.lat, lng: e.latlng.lng });
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(msg);
    } else {
      window.postMessage(msg, window.location.origin);
    }
  });

  // Allow JS injection to update waypoints and route
  window.updateWaypoints = function(newWps, newRoutePts) {
    waypoints = newWps.filter(function(w) { return w.lat !== 0 || w.lng !== 0; });
    if (newRoutePts) routePts = newRoutePts;
    renderWaypoints();
    renderRoute();
    renderDirectionArrow(currentDir);
    var pts = newRoutePts && newRoutePts.length > 1 ? newRoutePts : waypoints;
    if (pts.length > 1) {
      var lats = pts.map(function(p) { return p.lat; });
      var lngs = pts.map(function(p) { return p.lng; });
      map.fitBounds([[Math.min.apply(null,lats), Math.min.apply(null,lngs)],
                     [Math.max.apply(null,lats), Math.max.apply(null,lngs)]], { padding: [24,24] });
    }
  };

  // Live curvature update — called via JS injection after auto-recalculate
  window.updateRouteWithCurvature = function(pts, fitMap) {
    routePts = pts;
    renderCurvatureRoute(pts);
    renderWaypoints();
    renderDirectionArrow(currentDir);
    if (fitMap && pts.length > 1) {
      var lats = pts.map(function(p) { return p.lat; });
      var lngs = pts.map(function(p) { return p.lng; });
      map.fitBounds([[Math.min.apply(null,lats), Math.min.apply(null,lngs)],
                     [Math.max.apply(null,lats), Math.max.apply(null,lngs)]], { padding: [24,24] });
    }
  };
})();
</script>
</body>
</html>`;
}

// ── Post-ride route display (solid polyline + start/stop dots + fitBounds) ──

export function buildLeafletPostRideHtml(
  tileUrl: string,
  tileMaxZoom: number,
  accentColor: string,
  points: Array<{ lat: number; lng: number }>
): string {
  const pointsJson = JSON.stringify(points);

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"/>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body, #map { width: 100%; height: 100%; background: #1a1a1a; }
.leaflet-container { background: #1a1a1a !important; }
.leaflet-control-zoom { display: none !important; }
.leaflet-control-attribution { font-size: 8px !important; opacity: 0.4; }
</style>
</head>
<body>
<div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
(function() {
  var accentColor = ${JSON.stringify(accentColor)};
  var points = ${pointsJson};

  var map = L.map("map", { zoomControl: false, attributionControl: true });
  L.tileLayer(${JSON.stringify(tileUrl)}, { maxZoom: ${tileMaxZoom}, attribution: "" }).addTo(map);

  if (points.length > 1) {
    var latlngs = points.map(function(p) { return [p.lat, p.lng]; });

    L.polyline(latlngs, { color: accentColor, weight: 4, opacity: 0.9 }).addTo(map);

    function dotIcon(bg) {
      return L.divIcon({
        html: "<div style=\\"width:14px;height:14px;border-radius:7px;background:" + bg + ";border:3px solid #fff;box-shadow:0 0 4px rgba(0,0,0,0.5);\\"></div>",
        className: "", iconSize: [14,14], iconAnchor: [7,7]
      });
    }
    L.marker(latlngs[0], { icon: dotIcon("#22c55e"), zIndexOffset: 1000 }).addTo(map);
    L.marker(latlngs[latlngs.length-1], { icon: dotIcon("#ef4444"), zIndexOffset: 1001 }).addTo(map);

    var lats = points.map(function(p){return p.lat;});
    var lngs = points.map(function(p){return p.lng;});
    var bounds = [[Math.min.apply(null,lats), Math.min.apply(null,lngs)],
                  [Math.max.apply(null,lats), Math.max.apply(null,lngs)]];
    if (lats[0]===lats[lats.length-1] && lngs[0]===lngs[lngs.length-1]) {
      map.setView(bounds[0], 14, { animate: false });
    } else {
      map.fitBounds(bounds, { padding: [20, 20], animate: false });
    }
  } else if (points.length === 1) {
    map.setView([points[0].lat, points[0].lng], 14, { animate: false });
  } else {
    map.setView([41.9, 12.5], 6, { animate: false });
  }
})();
</script>
</body>
</html>`;
}

// ── Curvature gradient map (green=straight → yellow → red=curvy) ─────────────

export function buildLeafletCurvatureGradientHtml(
  tileUrl: string,
  tileMaxZoom: number,
  points: Array<{ lat: number; lng: number }>,
  offlineTileBasePath?: string | null
): string {
  const pointsJson = JSON.stringify(points);
  const offlinePathJs = offlineTileBasePath
    ? JSON.stringify(offlineTileBasePath)
    : "null";
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"/>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body, #map { width: 100%; height: 100%; background: #1a1a1a; }
.leaflet-container { background: #1a1a1a !important; }
.leaflet-control-zoom { display: none !important; }
.leaflet-control-attribution { font-size: 8px !important; opacity: 0.4; }
</style>
</head>
<body>
<div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
(function() {
  var points = ${pointsJson};
  var offlineBasePath = ${offlinePathJs};
  var map = L.map("map", { zoomControl: false, attributionControl: true });

  if (offlineBasePath) {
    var OfflineTileLayer = L.TileLayer.extend({
      getTileUrl: function(coords) {
        return offlineBasePath + coords.z + "/" + coords.x + "/" + coords.y + ".png";
      },
      createTile: function(coords, done) {
        var img = document.createElement("img");
        img.setAttribute("role", "presentation");
        var offlineUrl = this.getTileUrl(coords);
        var onlineUrl = ${JSON.stringify(tileUrl)}
          .replace("{z}", coords.z)
          .replace("{x}", coords.x)
          .replace("{y}", coords.y);
        img.onload = function() { done(null, img); };
        img.onerror = function() {
          img.src = onlineUrl;
          img.onerror = function() { done(new Error("tile load failed"), img); };
        };
        img.src = offlineUrl;
        return img;
      }
    });
    new OfflineTileLayer("", { maxZoom: ${tileMaxZoom}, attribution: "" }).addTo(map);
  } else {
    L.tileLayer(${JSON.stringify(tileUrl)}, { maxZoom: ${tileMaxZoom}, attribution: "" }).addTo(map);
  }

  function bearing(p1, p2) {
    var dLng = (p2.lng - p1.lng) * Math.PI / 180;
    var lat1 = p1.lat * Math.PI / 180;
    var lat2 = p2.lat * Math.PI / 180;
    var y = Math.sin(dLng) * Math.cos(lat2);
    var x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
    return Math.atan2(y, x) * 180 / Math.PI;
  }

  function angleDiff(a, b) {
    var d = Math.abs(a - b) % 360;
    return d > 180 ? 360 - d : d;
  }

  function curvatureColor(angle) {
    // angle: 0=straight, 180=U-turn
    // green (30°) → yellow (60°) → orange (90°) → red (>120°)
    var t = Math.min(1, angle / 90);
    if (t < 0.33) {
      // green → yellow
      var s = t / 0.33;
      var r = Math.round(34 + s * (234 - 34));
      var g = Math.round(197 + s * (179 - 197));
      return "rgb(" + r + "," + g + ",58)";
    } else if (t < 0.66) {
      // yellow → orange
      var s2 = (t - 0.33) / 0.33;
      var r2 = Math.round(234 + s2 * (249 - 234));
      var g2 = Math.round(179 + s2 * (115 - 179));
      return "rgb(" + r2 + "," + g2 + ",0)";
    } else {
      // orange → red
      var s3 = (t - 0.66) / 0.34;
      var r3 = Math.round(249 + s3 * (239 - 249));
      var g3 = Math.round(115 + s3 * (68 - 115));
      return "rgb(" + r3 + "," + g3 + ",68)";
    }
  }

  function postMsg(data) {
    try {
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify(data));
      } else {
        window.postMessage(JSON.stringify(data), window.location.origin);
      }
    } catch(e) {}
  }

  if (points.length > 1) {
    var bearings = [];
    for (var i = 0; i < points.length - 1; i++) {
      bearings.push(bearing(points[i], points[i+1]));
    }

    // Smooth angle change with window=3
    var polylineSegments = [];
    for (var i = 0; i < points.length - 1; i++) {
      var prevB = i > 0 ? bearings[i-1] : bearings[i];
      var nextB = i < bearings.length - 1 ? bearings[i+1] : bearings[i];
      var angle = (angleDiff(prevB, bearings[i]) + angleDiff(bearings[i], nextB)) / 2;
      var color = curvatureColor(angle);
      var seg = L.polyline([[points[i].lat, points[i].lng], [points[i+1].lat, points[i+1].lng]],
        { color: color, weight: 5, opacity: 0.95 }).addTo(map);
      // Street View: tap on route → open at midpoint of this segment
      (function(p1, p2) {
        seg.on("click", function(e) {
          var midLat = (p1.lat + p2.lat) / 2;
          var midLng = (p1.lng + p2.lng) / 2;
          postMsg({ type: "routeTap", lat: midLat, lng: midLng });
        });
      })(points[i], points[i+1]);
      polylineSegments.push(seg);
    }

    function dotIcon(bg) {
      return L.divIcon({
        html: "<div style=\\"width:14px;height:14px;border-radius:7px;background:" + bg + ";border:3px solid #fff;box-shadow:0 0 4px rgba(0,0,0,0.5);\\"></div>",
        className: "", iconSize: [14,14], iconAnchor: [7,7]
      });
    }
    L.marker([points[0].lat, points[0].lng], { icon: dotIcon("#22c55e"), zIndexOffset: 1000 }).addTo(map);
    L.marker([points[points.length-1].lat, points[points.length-1].lng], { icon: dotIcon("#ef4444"), zIndexOffset: 1001 }).addTo(map);

    var lats = points.map(function(p){return p.lat;});
    var lngs = points.map(function(p){return p.lng;});
    map.fitBounds([[Math.min.apply(null,lats), Math.min.apply(null,lngs)],
                   [Math.max.apply(null,lats), Math.max.apply(null,lngs)]], { padding: [20,20], animate: false });
  } else {
    map.setView([41.9, 12.5], 6, { animate: false });
  }
})();
</script>
</body>
</html>`;
}

// ── Waypoint-based planning map ──────────────────────────────────────────────

export interface RouteWaypoint {
  lat: number;
  lng: number;
  name: string;
  waypointType: string;
}

const WAYPOINT_TYPE_COLORS: Record<string, string> = {
  start: "#4CAF50",
  stop: "#FF9800",
  poi: "#2196F3",
  end: "#E63946",
};

function getWaypointColor(type: string): string {
  return WAYPOINT_TYPE_COLORS[type] || "#FF6600";
}

export function buildLeafletRouteMapHtml(
  tileUrl: string,
  tileMaxZoom: number,
  waypoints: RouteWaypoint[],
  accentColor: string = "#FF6600",
  typeColors?: Record<string, string>,
  showMarkers: boolean = true,
  trackPoints?: Array<{ lat: number; lng: number; speedKmh?: number | null }>
): string {
  const waypointsJson = JSON.stringify(waypoints);
  const resolvedTypeColors: Record<string, string> = {};
  for (const w of waypoints) {
    resolvedTypeColors[w.waypointType] =
      (typeColors && typeColors[w.waypointType]) || getWaypointColor(w.waypointType);
  }
  const colorsJson = JSON.stringify(resolvedTypeColors);
  const showMarkersJs = showMarkers ? "true" : "false";
  const polylinePoints = trackPoints ?? waypoints.map((w) => ({ lat: w.lat, lng: w.lng }));
  const polylineJson = JSON.stringify(polylinePoints);

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"/>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body, #map { width: 100%; height: 100%; background: #1a1a1a; }
.leaflet-container { background: #1a1a1a !important; }
.leaflet-control-zoom { display: none !important; }
.leaflet-control-attribution { font-size: 8px !important; opacity: 0.4; }
.speed-legend {
  position: absolute;
  bottom: 20px;
  left: 10px;
  background: rgba(0,0,0,0.72);
  border-radius: 8px;
  padding: 7px 10px;
  z-index: 1000;
  font-family: sans-serif;
  pointer-events: none;
}
.speed-legend-title {
  font-size: 9px;
  color: #aaa;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 5px;
}
.speed-legend-row {
  display: flex;
  align-items: center;
  margin-bottom: 3px;
}
.speed-legend-row:last-child { margin-bottom: 0; }
.speed-legend-dot {
  width: 14px;
  height: 4px;
  border-radius: 2px;
  margin-right: 6px;
  flex-shrink: 0;
}
.speed-legend-label {
  font-size: 10px;
  color: #e5e5e5;
  white-space: nowrap;
}
</style>
</head>
<body>
<div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
(function() {
  var waypoints = ${waypointsJson};
  var typeColors = ${colorsJson};
  var accentColor = ${JSON.stringify(accentColor)};
  var polylinePoints = ${polylineJson};

  var map = L.map("map", {
    center: [41.9, 12.5],
    zoom: 6,
    zoomControl: false,
    attributionControl: true
  });

  L.tileLayer(${JSON.stringify(tileUrl)}, { maxZoom: ${tileMaxZoom}, attribution: "" }).addTo(map);

  function speedColor(kmh) {
    if (kmh == null || kmh < 0) return null;
    if (kmh < 60)  return "#22c55e";
    if (kmh < 100) return "#eab308";
    if (kmh < 130) return "#f97316";
    return "#ef4444";
  }

  if (polylinePoints.length > 0) {
    if (polylinePoints.length > 1) {
      var hasSpeed = polylinePoints.some(function(p) { return p.speedKmh != null; });

      if (hasSpeed) {
        for (var i = 0; i < polylinePoints.length - 1; i++) {
          var color = speedColor(polylinePoints[i].speedKmh) || accentColor;
          L.polyline(
            [[polylinePoints[i].lat, polylinePoints[i].lng],
             [polylinePoints[i+1].lat, polylinePoints[i+1].lng]],
            { color: color, weight: 4, opacity: 0.9, lineCap: "round", lineJoin: "round" }
          ).addTo(map);
        }

        var legend = document.createElement("div");
        legend.className = "speed-legend";
        legend.innerHTML =
          "<div class=\\"speed-legend-title\\">Velocit\\u00e0 km/h</div>" +
          "<div class=\\"speed-legend-row\\"><div class=\\"speed-legend-dot\\" style=\\"background:#22c55e\\"></div><span class=\\"speed-legend-label\\">&lt; 60</span></div>" +
          "<div class=\\"speed-legend-row\\"><div class=\\"speed-legend-dot\\" style=\\"background:#eab308\\"></div><span class=\\"speed-legend-label\\">60 – 100</span></div>" +
          "<div class=\\"speed-legend-row\\"><div class=\\"speed-legend-dot\\" style=\\"background:#f97316\\"></div><span class=\\"speed-legend-label\\">100 – 130</span></div>" +
          "<div class=\\"speed-legend-row\\"><div class=\\"speed-legend-dot\\" style=\\"background:#ef4444\\"></div><span class=\\"speed-legend-label\\">&gt; 130</span></div>";
        document.body.appendChild(legend);
      } else {
        var latlngs = polylinePoints.map(function(p) { return [p.lat, p.lng]; });
        L.polyline(latlngs, { color: accentColor, weight: 3, dashArray: "6 3", opacity: 0.9 }).addTo(map);
      }
    }

    if (${showMarkersJs}) {
      waypoints.forEach(function(wp, idx) {
        var color = typeColors[wp.waypointType] || accentColor;
        var label = idx === 0 ? "A" : idx === waypoints.length - 1 ? "Z" : String(idx);
        var pinHtml = "<div style=\\"width:24px;height:24px;border-radius:12px;background:" + color + ";border:2px solid #fff;" +
          "box-shadow:0 2px 6px rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;" +
          "font-size:10px;font-weight:700;color:#fff;\\">" + label + "</div>";
        L.marker([wp.lat, wp.lng], {
          icon: L.divIcon({ html: pinHtml, className: "", iconSize: [24, 24], iconAnchor: [12, 12] })
        }).addTo(map);
      });
    }

    var lats = polylinePoints.map(function(p) { return p.lat; });
    var lngs = polylinePoints.map(function(p) { return p.lng; });
    var minLat = Math.min.apply(null, lats);
    var maxLat = Math.max.apply(null, lats);
    var minLng = Math.min.apply(null, lngs);
    var maxLng = Math.max.apply(null, lngs);
    if (minLat === maxLat && minLng === maxLng) {
      map.setView([minLat, minLng], 13);
    } else {
      map.fitBounds([[minLat, minLng], [maxLat, maxLng]], { padding: [30, 30] });
    }
  }
})();
</script>
</body>
</html>`;
}
