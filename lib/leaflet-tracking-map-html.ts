import { LEAFLET_JS, LEAFLET_CSS } from './leaflet-bundle';

export function buildLeafletTrackingMapHtml(tileUrl: string, tileMaxZoom: number, accentColor: string = "#FF6600", debug: boolean = false): string {
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
@keyframes pulse {
  0% { box-shadow: 0 0 0 0 rgba(33,150,243,0.7); }
  70% { box-shadow: 0 0 0 10px rgba(33,150,243,0); }
  100% { box-shadow: 0 0 0 0 rgba(33,150,243,0); }
}
.current-dot { animation: pulse 2s infinite; }
</style>
</head>
<body>
<div id="map"></div>
<script>${LEAFLET_JS}</script>
<script>
(function() {
  var __DEBUG__ = ${debug ? 'true' : 'false'};
  var accentColor = ${JSON.stringify(accentColor)};

  var map = L.map("map", {
    center: [41.9, 12.5],
    zoom: 6,
    zoomControl: false,
    attributionControl: true
  });

  L.tileLayer(${JSON.stringify(tileUrl)}, { maxZoom: ${tileMaxZoom}, attribution: "" }).addTo(map);

  var MAX_TRACK_POINTS = 1500;

  function decimatePoints(pts, maxPts) {
    if (pts.length <= maxPts) return pts;
    var result = [];
    var stride = (pts.length - 1) / (maxPts - 1);
    for (var i = 0; i < maxPts; i++) {
      var idx = i === maxPts - 1 ? pts.length - 1 : Math.round(i * stride);
      result.push(pts[idx]);
    }
    return result;
  }

  var trackPoints = [];
  var trackPolyline = null;
  var currentMarker = null;
  var initialized = false;

  function currentDotHtml() {
    return "<div class=\\"current-dot\\" style=\\"width:18px;height:18px;border-radius:9px;background:#2196F3;" +
      "border:3px solid #fff;box-shadow:0 0 0 0 rgba(33,150,243,0.7);\\"></div>";
  }

  function isValidCoord(lat, lng) {
    return typeof lat === "number" && isFinite(lat) && lat >= -90 && lat <= 90 &&
           typeof lng === "number" && isFinite(lng) && lng >= -180 && lng <= 180;
  }

  function applyUpdate(data) {
    if (Array.isArray(data.points)) {
      var badPoints = data.points.filter(function(p) {
        return !p || !isValidCoord(p.lat, p.lng);
      });
      if (__DEBUG__ && badPoints.length > 0) {
        console.warn("[BikerLink] applyUpdate: skipping " + badPoints.length + " out-of-range point(s).", badPoints.slice(0, 3).map(function(p) { return p ? { lat: p.lat, lng: p.lng } : p; }));
        postMsg({ type: "trackingCoordError", source: "points", skipped: badPoints.length, samples: badPoints.slice(0, 3) });
      }
      trackPoints = decimatePoints(data.points.filter(function(p) {
        return p && isValidCoord(p.lat, p.lng);
      }), MAX_TRACK_POINTS);
      if (trackPolyline) { map.removeLayer(trackPolyline); }
      if (trackPoints.length > 1) {
        trackPolyline = L.polyline(trackPoints.map(function(p) { return [p.lat, p.lng]; }), {
          color: accentColor, weight: 4, opacity: 0.85
        }).addTo(map);
      }
    }

    if (data.current) {
      var lat = data.current.lat;
      var lng = data.current.lng;
      if (!isValidCoord(lat, lng)) {
        if (__DEBUG__) {
          console.warn("[BikerLink] applyUpdate: out-of-range current coordinate rejected.", { lat: lat, lng: lng });
          postMsg({ type: "trackingCoordError", source: "current", payload: data.current });
        }
        return;
      }
      if (currentMarker) { map.removeLayer(currentMarker); }
      currentMarker = L.marker([lat, lng], {
        icon: L.divIcon({ html: currentDotHtml(), className: "", iconSize: [18, 18], iconAnchor: [9, 9] }),
        zIndexOffset: 1000
      }).addTo(map);
      if (!initialized) {
        map.setView([lat, lng], 14, { animate: false });
        initialized = true;
      } else {
        map.setView([lat, lng], map.getZoom(), { animate: true });
      }
    }
  }

  var pendingUpdate = null;
  var bridgeReady = false;

  function postViewState() {
    var c = map.getCenter();
    postMsg({
      type: "viewState",
      zoom: map.getZoom(),
      minZoom: map.getMinZoom(),
      maxZoom: map.getMaxZoom(),
      lat: c.lat,
      lng: c.lng
    });
  }

  window.trackingBridge = {
    updateLocation: function(json) {
      var data;
      try { data = JSON.parse(json); } catch(e) { return; }
      if (!bridgeReady) { pendingUpdate = data; return; }
      applyUpdate(data);
    },
    setZoom: function(payload) {
      var data;
      try { data = typeof payload === "string" ? JSON.parse(payload) : payload; } catch(e) { return; }
      var level = data && typeof data === "object" ? data.zoom : Number(data);
      if (typeof level !== "number" || !isFinite(level)) return;
      map.setZoom(level);
    }
  };

  map.on("zoomend", postViewState);
  map.on("moveend", postViewState);

  function postMsg(obj) {
    try {
      var json = JSON.stringify(obj);
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(json);
      } else {
        window.parent.postMessage(json, window.location.origin);
      }
    } catch(e) {}
  }

  window.addEventListener("message", function(e) {
    if (e.origin !== window.location.origin) { return; }
    try {
      var msg = JSON.parse(e.data);
      if (msg.type === "updateLocation" &&
          typeof msg.json === "string" && msg.json.length > 0) {
        window.trackingBridge.updateLocation(msg.json);
      }
    } catch(err) {}
  });

  bridgeReady = true;
  if (pendingUpdate) { applyUpdate(pendingUpdate); pendingUpdate = null; }
  postViewState();
  postMsg({ type: "trackingReady" });
})();
</script>
</body>
</html>`;
}
