import { RouteWaypoint } from './map-builder';
import { MARKER_SCRIPTS } from './map-markers';
import { LEAFLET_JS, LEAFLET_CSS } from '../leaflet-bundle';
import { MAP_STYLES } from './map-styles';

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
