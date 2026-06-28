// @no-split
import { MAP_STYLES, CURVATURE_LEGEND_HTML, TAP_HINT_HTML } from './map-styles';
import { COMMON_SCRIPTS } from './map-scripts';
import { MARKER_SCRIPTS } from './map-markers';
import { LEAFLET_JS, LEAFLET_CSS } from '../leaflet-bundle';

export interface PlannerWaypoint {
  lat: number;
  lng: number;
  name: string;
}

export interface RouteWaypoint {
  lat: number;
  lng: number;
  name: string;
  waypointType: string;
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
<style>${LEAFLET_CSS}</style>
<style>${MAP_STYLES}</style>
</head>
<body>
<div id="map"></div>
${CURVATURE_LEGEND_HTML}
${TAP_HINT_HTML}
<script>${LEAFLET_JS}</script>
<script>
(function() {
  ${COMMON_SCRIPTS}
  ${MARKER_SCRIPTS}

  var waypoints = ${wpsJson};
  var routePts = ${polyJson};
  var accent = ${JSON.stringify(accentColor)};

  var map = L.map("map", { zoomControl: false, attributionControl: true });
  L.tileLayer(${JSON.stringify(tileUrl)}, { maxZoom: ${tileMaxZoom}, attribution: "" }).addTo(map);

  var wpMarkers = [];
  function renderWaypoints() {
    wpMarkers.forEach(function(m) { map.removeLayer(m); });
    wpMarkers = [];
    waypoints.forEach(function(wp, idx) {
      var m = L.marker([wp.lat, wp.lng], { icon: wpIcon(idx, waypoints.length, accent) })
        .bindTooltip(wp.name || ("Tappa " + (idx+1)), { permanent: false, direction: "top" })
        .addTo(map);
      wpMarkers.push(m);
    });
  }

  var routeSegments = [];
  var routeFallback = null;

  function clearRouteLayer() {
    routeSegments.forEach(function(seg) { map.removeLayer(seg); });
    routeSegments = [];
    if (routeFallback) { map.removeLayer(routeFallback); routeFallback = null; }
  }

  var legendEl = document.getElementById("curvature-legend");

  function renderCurvatureRoute(pts) {
    clearRouteLayer();
    if (pts.length < 2) { if (legendEl) legendEl.classList.remove("visible"); return; }
    if (legendEl) legendEl.classList.add("visible");
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
      if (legendEl) legendEl.classList.remove("visible");
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

  var COMPASS_BEARING = { N:0, NE:45, E:90, SE:135, S:180, SO:225, O:270, NO:315 };
  var dirArrowLine = null;
  var dirArrowHead = null;
  var currentDir = ${initialDirJs};

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

    var pathEl = dirArrowLine.getElement();
    if (pathEl) { pathEl.classList.add("dir-arrow-path"); }

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

  map.on("click", function(e) {
    var msg = JSON.stringify({ type: "tap", lat: e.latlng.lat, lng: e.latlng.lng });
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(msg);
    } else {
      window.postMessage(msg, window.location.origin);
    }
  });

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

export function buildLeafletPostRideHtml(
  tileUrl: string,
  tileMaxZoom: number,
  accentColor: string,
  points: Array<{ lat: number; lng: number }>
): string {
  const _pointsJson = JSON.stringify(points);

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"/>
<style>${LEAFLET_CSS}</style>
<style>\${MAP_STYLES}</style>
</head>
<body>
<div id="map"></div>
<script>${LEAFLET_JS}</script>
<script>
(function() {
  \${MARKER_SCRIPTS}
  var accentColor = \${JSON.stringify(accentColor)};
  var points = \${pointsJson};

  var map = L.map("map", { zoomControl: false, attributionControl: true });
  L.tileLayer(\${JSON.stringify(tileUrl)}, { maxZoom: \${tileMaxZoom}, attribution: "" }).addTo(map);

  if (points.length > 1) {
    var latlngs = points.map(function(p) { return [p.lat, p.lng]; });

    L.polyline(latlngs, { color: accentColor, weight: 4, opacity: 0.9 }).addTo(map);

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

export function buildLeafletCurvatureGradientHtml(
  tileUrl: string,
  tileMaxZoom: number,
  points: Array<{ lat: number; lng: number }>,
  offlineTileBasePath?: string | null
): string {
  const _pointsJson = JSON.stringify(points);
  const _offlinePathJs = offlineTileBasePath
    ? JSON.stringify(offlineTileBasePath)
    : "null";
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"/>
<style>${LEAFLET_CSS}</style>
<style>\${MAP_STYLES}</style>
</head>
<body>
<div id="map"></div>
\${CURVATURE_LEGEND_HTML}
<script>${LEAFLET_JS}</script>
<script>
(function() {
  \${COMMON_SCRIPTS}
  \${MARKER_SCRIPTS}
  var points = \${pointsJson};
  var offlineBasePath = \${offlinePathJs};
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
        var onlineUrl = \${JSON.stringify(tileUrl)}
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
    new OfflineTileLayer("", { maxZoom: \${tileMaxZoom}, attribution: "" }).addTo(map);
  } else {
    L.tileLayer(\${JSON.stringify(tileUrl)}, { maxZoom: \${tileMaxZoom}, attribution: "" }).addTo(map);
  }

  var legendEl = document.getElementById("curvature-legend");

  if (points.length > 1) {
    if (legendEl) legendEl.classList.add("visible");
    var bearings = [];
    for (var i = 0; i < points.length - 1; i++) {
      bearings.push(bearing(points[i], points[i+1]));
    }

    var polylineSegments = [];
    for (var i = 0; i < points.length - 1; i++) {
      var prevB = i > 0 ? bearings[i-1] : bearings[i];
      var nextB = i < bearings.length - 1 ? bearings[i+1] : bearings[i];
      var angle = (angleDiff(prevB, bearings[i]) + angleDiff(bearings[i], nextB)) / 2;
      var color = curvatureColor(angle);
      var seg = L.polyline([[points[i].lat, points[i].lng], [points[i+1].lat, points[i+1].lng]],
        { color: color, weight: 5, opacity: 0.95 }).addTo(map);
      (function(p1, p2) {
        seg.on("click", function(e) {
          var midLat = (p1.lat + p2.lat) / 2;
          var midLng = (p1.lng + p2.lng) / 2;
          postMsg({ type: "routeTap", lat: midLat, lng: midLng });
        });
      })(points[i], points[i+1]);
      polylineSegments.push(seg);
    }

    L.marker([points[0].lat, points[0].lng], { icon: dotIcon("#22c55e"), zIndexOffset: 1000 }).addTo(map);
    L.marker([points[points.length-1].lat, points[points.length-1].lng], { icon: dotIcon("#ef4444"), zIndexOffset: 1001 }).addTo(map);

    var lats = points.map(function(p){return p.lat;});
    var lngs = points.map(function(p){return p.lng;});
    map.fitBounds([[Math.min.apply(null,lats), Math.min.apply(null,lngs)],
                   [Math.max.apply(null,lats), Math.max.apply(null,lngs)]], { padding: [20,20], animate: false });
  } else {
    if (legendEl) legendEl.classList.remove("visible");
    map.setView([41.9, 12.5], 6, { animate: false });
  }
})();
</script>
</body>
</html>`;
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
  const resolvedTypeColors: Record<string, string> = {};
  for (const w of waypoints) {
    resolvedTypeColors[w.waypointType] =
      (typeColors && typeColors[w.waypointType]) || (require('./map-markers').getWaypointColor(w.waypointType));
  }
  const polylinePoints = trackPoints ?? waypoints.map((w) => ({ lat: w.lat, lng: w.lng }));
  const waypointsJson = JSON.stringify(waypoints);
  const colorsJson = JSON.stringify(resolvedTypeColors);
  const polylineJson = JSON.stringify(polylinePoints);
  const showMarkersJs = showMarkers ? "true" : "false";

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"/>
<style>${LEAFLET_CSS}</style>
<style>${MAP_STYLES}</style>
</head>
<body>
<div id="map"></div>
<script>${LEAFLET_JS}</script>
<script>
(function() {
  ${MARKER_SCRIPTS}
  function postMsg(data) {
    try {
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify(data));
      }
    } catch(e) {}
  }
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

  function postViewState() {
    var c = map.getCenter();
    postMsg({
      type: "viewState",
      zoom: map.getZoom(),
      minZoom: map.getMinZoom(),
      maxZoom: map.getMaxZoom(),
      bearing: 0,
      lat: c.lat,
      lng: c.lng
    });
  }
  map.on("zoomend", postViewState);
  map.on("moveend", postViewState);
  map.whenReady(function() { postViewState(); });

  window.leafletRouteBridge = {
    setZoom: function(z) {
      var clamped = Math.max(map.getMinZoom(), Math.min(map.getMaxZoom(), Number(z)));
      if (!isFinite(clamped)) return;
      map.setZoom(clamped);
    }
  };

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
        L.marker([wp.lat, wp.lng], {
          icon: getWaypointPin(color, label)
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
