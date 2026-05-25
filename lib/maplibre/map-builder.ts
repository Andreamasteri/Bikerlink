import { BRIDGE_RECEIVE_SCRIPT, BRIDGE_SEND_LISTENER } from "./bridge-events";

export const CDN_URL = "https://unpkg.com/maplibre-gl@5.24.0/dist";

export const BASE_STYLES = `
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body, #map { width: 100%; height: 100%; background: #1a1a1a; }
.maplibregl-ctrl-bottom-left,
.maplibregl-ctrl-bottom-right { display: none !important; }
.maplibregl-ctrl-top-left,
.maplibregl-ctrl-top-right { display: none !important; }
`;

export function htmlHead(extraStyles: string = ""): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"/>
<link rel="stylesheet" href="${CDN_URL}/maplibre-gl.css"/>
<style>${BASE_STYLES}${extraStyles}</style>
</head>`;
}

export function mapScriptWrap(
  styleVar: string,
  options: string,
  bodyScript: string
): string {
  return `<script src="${CDN_URL}/maplibre-gl.js"></script>
<script>
(function() {
  ${BRIDGE_RECEIVE_SCRIPT}
  ${BRIDGE_SEND_LISTENER}
  var map = new maplibregl.Map(Object.assign({
    container: "map",
    style: ${styleVar},
    zoom: 6,
    center: [10.5, 45.5],
    pitch: 0,
    bearing: 0,
    attributionControl: false
  }, ${options}));
  map.on("load", function() {
    ${bodyScript}
    postMsg({ type: "ready" });
  });
  map.on("error", function(e) {
    postMsg({ type: "error", message: String(e.error && e.error.message) });
  });
})();
</script>
</body>
</html>`;
}

export function buildMapLibreInteractiveHtml(
  styleVar: string,
  initialCenter?: { lat: number; lng: number } | null
): string {
  const options = initialCenter
    ? `{ center: [${initialCenter.lng}, ${initialCenter.lat}], zoom: 12 }`
    : "{}";
  return `${htmlHead()}
<body>
<div id="map"></div>
${mapScriptWrap(styleVar, options, `
    var markers = {};
    var eggMarkers = {};
    window.mlBridge = {
      updateState: function(payload) {
        var state;
        try { state = typeof payload === "string" ? JSON.parse(payload) : payload; } catch(e) { return; }
        if (state.center) {
          map.easeTo({ center: [state.center.lng, state.center.lat], zoom: state.zoom || 13 });
        }
        Object.keys(markers).forEach(function(k) { markers[k].remove(); });
        markers = {};
        var all = (state.markers && state.markers.users) || [];
        all.forEach(function(u) {
          var el = document.createElement("div");
          el.style.cssText = "width:14px;height:14px;border-radius:7px;background:" +
            (u.userType === "biker" ? "#FF6600" : u.userType === "zavorrina" ? "#E91E8C" : "#9C27B0") +
            ";border:2px solid #fff;box-shadow:0 2px 4px rgba(0,0,0,0.5);cursor:pointer;";
          var m = new maplibregl.Marker({ element: el })
            .setLngLat([u.lng, u.lat])
            .addTo(map);
          el.addEventListener("click", function() {
            postMsg({ type: "userPress", userId: u.id });
          });
          markers[u.id] = m;
        });
        Object.keys(eggMarkers).forEach(function(k) { eggMarkers[k].remove(); });
        eggMarkers = {};
        var eggs = (state.markers && state.markers.easterEggs) || [];
        eggs.forEach(function(egg) {
          var el = document.createElement("div");
          el.style.cssText = "width:20px;height:20px;border-radius:10px;background:#FFD700;border:2px solid #fff;box-shadow:0 2px 4px rgba(0,0,0,0.5);cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:12px;";
          el.textContent = "\\u2605";
          var m = new maplibregl.Marker({ element: el })
            .setLngLat([egg.lng, egg.lat])
            .addTo(map);
          el.addEventListener("click", function() {
            postMsg({ type: "easterEggPress", eggId: egg.id });
          });
          eggMarkers[egg.id] = m;
        });
      },
      focusOn: function(payload) {
        var data = typeof payload === "string" ? JSON.parse(payload) : payload;
        if (!data) return;
        map.easeTo({ center: [data.lng, data.lat], zoom: data.zoom || 13 });
      },
      centerOnUser: function(payload) {
        var data = typeof payload === "string" ? JSON.parse(payload) : payload;
        if (!data) return;
        map.easeTo({ center: [data.lng, data.lat], zoom: 14 });
      },
      highlightUser: function(payload) {
        var id = typeof payload === "string" ? payload : String(payload);
        var m = markers[id];
        if (m) {
          var el = m.getElement();
          if (el) { el.style.boxShadow = "0 0 0 4px rgba(255,200,0,0.8)"; }
        }
      },
      updateHazards: function() {},
    };
    map.on("click", function(e) {
      postMsg({ type: "tap", lat: e.lngLat.lat, lng: e.lngLat.lng });
    });
    map.on("moveend", function() {
      var c = map.getCenter();
      postMsg({ type: "regionChange", lat: c.lat, lng: c.lng, zoom: map.getZoom() });
    });
`)}`;
}
