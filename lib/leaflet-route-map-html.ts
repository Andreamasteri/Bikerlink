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
  trackPoints?: Array<{ lat: number; lng: number }>
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

  if (polylinePoints.length > 0) {
    if (polylinePoints.length > 1) {
      var latlngs = polylinePoints.map(function(p) { return [p.lat, p.lng]; });
      L.polyline(latlngs, { color: accentColor, weight: 3, dashArray: "6 3", opacity: 0.9 }).addTo(map);
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
