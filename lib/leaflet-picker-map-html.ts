import { LEAFLET_JS, LEAFLET_CSS } from './leaflet-bundle';

export interface PickerWaypoint {
  lat: number;
  lng: number;
  name: string;
  waypointType: string;
}

export function buildLeafletPickerMapHtml(
  tileUrl: string,
  tileMaxZoom: number,
  initialLat: number,
  initialLng: number,
  initialZoom: number,
  existingWaypoints: PickerWaypoint[] = [],
  selectedCoord: { lat: number; lng: number } | null = null,
  accentColor: string = "#FF6600"
): string {
  const waypointsJson = JSON.stringify(existingWaypoints);
  const selectedJson = JSON.stringify(selectedCoord);

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
</style>
</head>
<body>
<div id="map"></div>
<script>${LEAFLET_JS}</script>
<script>
(function() {
  var tileUrl = ${JSON.stringify(tileUrl)};
  var accentColor = ${JSON.stringify(accentColor)};
  var existingWaypoints = ${waypointsJson};
  var initialSelected = ${selectedJson};

  function postMsg(data) {
    try {
      var json = JSON.stringify(data);
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(json);
      } else {
        window.parent.postMessage(json, window.location.origin);
      }
    } catch(e) {}
  }

  var map = L.map("map", {
    center: [${initialLat}, ${initialLng}],
    zoom: ${initialZoom},
    zoomControl: false,
    attributionControl: true
  });

  L.tileLayer(tileUrl, { maxZoom: ${tileMaxZoom}, attribution: "" }).addTo(map);

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
  map.on("zoomend", postViewState);
  map.on("moveend", postViewState);
  map.whenReady(function() { postViewState(); });

  var WAYPOINT_COLORS = { start: "#4CAF50", stop: "#FF9800", poi: "#2196F3", end: "#E63946" };

  if (existingWaypoints.length > 1) {
    var latlngs = existingWaypoints.map(function(wp) { return [wp.lat, wp.lng]; });
    L.polyline(latlngs, { color: accentColor, weight: 2, dashArray: "6 4", opacity: 0.7 }).addTo(map);
  }
  existingWaypoints.forEach(function(wp, idx) {
    var color = WAYPOINT_COLORS[wp.waypointType] || "#888";
    var label = String(idx + 1);
    var pinHtml = "<div style=\\"width:20px;height:20px;border-radius:10px;background:" + color + ";border:2px solid #fff;" +
      "box-shadow:0 2px 5px rgba(0,0,0,0.5);opacity:0.75;display:flex;align-items:center;justify-content:center;" +
      "font-size:9px;font-weight:700;color:#fff;\\">" + label + "</div>";
    L.marker([wp.lat, wp.lng], {
      icon: L.divIcon({ html: pinHtml, className: "", iconSize: [20, 20], iconAnchor: [10, 10] })
    }).addTo(map);
  });

  var selectedMarker = null;

  function makeSelectedPin() {
    return "<div style=\\"width:26px;height:26px;border-radius:13px;background:#FFD700;border:3px solid #fff;" +
      "box-shadow:0 2px 8px rgba(0,0,0,0.6);\\"></div>";
  }

  function makeDraggableMarker(lat, lng) {
    var m = L.marker([lat, lng], {
      icon: L.divIcon({ html: makeSelectedPin(), className: "", iconSize: [26, 26], iconAnchor: [13, 13] }),
      draggable: true
    }).addTo(map);
    m.on("dragend", function() {
      var pos = m.getLatLng();
      postMsg({ type: "coordPicked", lat: pos.lat, lng: pos.lng });
    });
    return m;
  }

  if (initialSelected) {
    selectedMarker = makeDraggableMarker(initialSelected.lat, initialSelected.lng);
  }

  map.on("click", function(e) {
    var lat = e.latlng.lat;
    var lng = e.latlng.lng;
    if (selectedMarker) { map.removeLayer(selectedMarker); }
    selectedMarker = makeDraggableMarker(lat, lng);
    postMsg({ type: "coordPicked", lat: lat, lng: lng });
  });

  window.pickerBridge = {
    setCoord: function(lat, lng) {
      if (selectedMarker) { map.removeLayer(selectedMarker); }
      selectedMarker = makeDraggableMarker(lat, lng);
      map.setView([lat, lng], map.getZoom() < 12 ? 12 : map.getZoom(), { animate: true });
    },
    setZoom: function(z) {
      var clamped = Math.max(map.getMinZoom(), Math.min(map.getMaxZoom(), Number(z)));
      if (!isFinite(clamped)) return;
      map.setZoom(clamped);
    }
  };

  window.addEventListener("message", function(e) {
    if (e.origin !== window.location.origin) { return; }
    try {
      var msg = JSON.parse(e.data);
      if (msg.type === "setCoord" &&
          typeof msg.lat === "number" && isFinite(msg.lat) &&
          typeof msg.lng === "number" && isFinite(msg.lng)) {
        window.pickerBridge.setCoord(msg.lat, msg.lng);
      }
    } catch(err) {}
  });

  postMsg({ type: "ready" });
})();
</script>
</body>
</html>`;
}
