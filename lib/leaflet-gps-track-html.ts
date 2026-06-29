import { LEAFLET_JS, LEAFLET_CSS } from './leaflet-bundle';
import { decimateTrack } from './maps/track-decimate';

export interface GpsSample {
  ts: number;
  lat: number;
  lon: number;
  speedKmh: number | null;
  leanAngle: number | null;
}

export function buildLeafletGpsTrackHtml(
  tileUrl: string,
  tileMaxZoom: number,
  samples: GpsSample[],
  accentColor: string = "#FF6600",
  colorMode: "speed" | "lean" | "flat" = "speed"
): string {
  const samplesJson = JSON.stringify(decimateTrack(samples));

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"/>
<style>${LEAFLET_CSS}</style>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body, #map { width: 100%; height: 100%; background: #1a1a1a; }
.leaflet-container { background: #1a1a1a !important; }
.leaflet-control-zoom { display: none !important; }
.leaflet-control-attribution { font-size: 8px !important; opacity: 0.4; }
#legend {
  position: absolute;
  bottom: 18px;
  left: 10px;
  z-index: 1000;
  background: rgba(20,20,20,0.82);
  border-radius: 8px;
  padding: 7px 10px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  pointer-events: none;
}
#legend-title {
  color: #aaa;
  font-family: sans-serif;
  font-size: 10px;
  margin-bottom: 2px;
}
#legend-bar {
  width: 100px;
  height: 8px;
  border-radius: 4px;
  background: linear-gradient(to right, #22c55e, #facc15, #f97316, #ef4444);
}
#legend-labels {
  display: flex;
  justify-content: space-between;
  color: #888;
  font-family: sans-serif;
  font-size: 9px;
}
#empty-state {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  color: #888;
  font-family: sans-serif;
  font-size: 14px;
  text-align: center;
  pointer-events: none;
}
</style>
</head>
<body>
<div id="map"></div>
<div id="legend" style="display:none">
  <div id="legend-title">Velocità</div>
  <div id="legend-bar"></div>
  <div id="legend-labels"><span>0</span><span id="legend-max">—</span></div>
</div>
<script>${LEAFLET_JS}</script>
<script>
(function() {
  var samples = ${samplesJson};
  var accentColor = ${JSON.stringify(accentColor)};
  var colorMode = ${JSON.stringify(colorMode)};

  var map = L.map("map", {
    zoomControl: false,
    attributionControl: true
  });
  L.tileLayer(${JSON.stringify(tileUrl)}, { maxZoom: ${tileMaxZoom}, attribution: "" }).addTo(map);

  function isValidPt(s) {
    return s && typeof s.lat === "number" && isFinite(s.lat) &&
           typeof s.lon === "number" && isFinite(s.lon) &&
           s.lat >= -90 && s.lat <= 90 && s.lon >= -180 && s.lon <= 180;
  }

  var pts = samples.filter(isValidPt);

  if (pts.length < 2) {
    var el = document.getElementById("empty-state");
    if (!el) { el = document.createElement("div"); el.id = "empty-state"; document.body.appendChild(el); }
    el.textContent = "Tracciato non disponibile";
    map.setView([41.9, 12.5], 6);
    postViewState();
    return;
  }

  function lerp(a, b, t) { return a + (b - a) * t; }

  function speedColor(norm) {
    if (norm < 0.33) {
      var t = norm / 0.33;
      return "rgb(" + Math.round(lerp(34,250,t)) + "," + Math.round(lerp(197,204,t)) + ",30)";
    } else if (norm < 0.66) {
      var t2 = (norm - 0.33) / 0.33;
      return "rgb(" + Math.round(lerp(250,249,t2)) + "," + Math.round(lerp(204,115,t2)) + "," + Math.round(lerp(30,22,t2)) + ")";
    } else {
      var t3 = (norm - 0.66) / 0.34;
      return "rgb(" + Math.round(lerp(249,239,t3)) + "," + Math.round(lerp(115,68,t3)) + "," + Math.round(lerp(22,68,t3)) + ")";
    }
  }

  var hasMetric = false;
  var maxMetric = 0;

  if (colorMode === "speed") {
    pts.forEach(function(s) {
      if (s.speedKmh != null) { hasMetric = true; if (s.speedKmh > maxMetric) maxMetric = s.speedKmh; }
    });
  } else if (colorMode === "lean") {
    pts.forEach(function(s) {
      if (s.leanAngle != null) { hasMetric = true; var a = Math.abs(s.leanAngle); if (a > maxMetric) maxMetric = a; }
    });
  }

  var bounds = L.latLngBounds();

  for (var i = 0; i < pts.length - 1; i++) {
    var a = pts[i];
    var b = pts[i + 1];
    var color = accentColor;
    if (hasMetric && maxMetric > 0) {
      var val = colorMode === "speed"
        ? (a.speedKmh != null ? a.speedKmh : 0)
        : (a.leanAngle != null ? Math.abs(a.leanAngle) : 0);
      color = speedColor(Math.min(val / maxMetric, 1));
    }
    var seg = L.polyline([[a.lat, a.lon], [b.lat, b.lon]], {
      color: color,
      weight: 5,
      opacity: 0.9,
      lineCap: "round",
      lineJoin: "round"
    }).addTo(map);
    bounds.extend([a.lat, a.lon]);
    bounds.extend([b.lat, b.lon]);
  }

  var startPt = pts[0];
  var endPt = pts[pts.length - 1];

  function circleMarker(pt, color, label) {
    return L.marker([pt.lat, pt.lon], {
      icon: L.divIcon({
        html: "<div style='width:18px;height:18px;border-radius:50%;background:" + color +
              ";border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;" +
              "font-size:9px;color:#fff;font-weight:bold;font-family:sans-serif;'>" + label + "</div>",
        className: "",
        iconSize: [18, 18],
        iconAnchor: [9, 9]
      }),
      zIndexOffset: 500
    }).addTo(map);
  }

  circleMarker(startPt, "#22c55e", "A");
  circleMarker(endPt, "#ef4444", "B");

  if (hasMetric && maxMetric > 0) {
    var legend = document.getElementById("legend");
    if (legend) {
      legend.style.display = "flex";
      var legendTitle = document.getElementById("legend-title");
      if (legendTitle) legendTitle.textContent = colorMode === "speed" ? "Velocità (km/h)" : "Lean angle (°)";
      var legendMax = document.getElementById("legend-max");
      if (legendMax) legendMax.textContent = Math.round(maxMetric) + (colorMode === "speed" ? "" : "°");
    }
  }

  map.fitBounds(bounds, { padding: [20, 20], maxZoom: 16 });

  map.on("zoomend", postViewState);
  map.on("moveend", postViewState);

  function postViewState() {
    var c = map.getCenter();
    var msg = JSON.stringify({
      type: "viewState",
      zoom: map.getZoom(),
      minZoom: map.getMinZoom(),
      maxZoom: map.getMaxZoom(),
      lat: c.lat,
      lng: c.lng
    });
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(msg);
    } else {
      try { window.parent.postMessage(msg, window.location.origin); } catch(e) {}
    }
  }

  postViewState();
})();
</script>
</body>
</html>`;
}
