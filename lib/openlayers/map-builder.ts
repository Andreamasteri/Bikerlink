import { OL_BRIDGE_RECEIVE_SCRIPT, OL_BRIDGE_SEND_LISTENER } from "./bridge-events";

export const OL_CDN_JS = "https://cdn.jsdelivr.net/npm/ol@10.4.0/dist/ol.js";
export const OL_CDN_CSS = "https://cdn.jsdelivr.net/npm/ol@10.4.0/ol.css";

export const OL_BASE_STYLES = `
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body, #map { width: 100%; height: 100%; background: #1a1a1a; }
.ol-attribution, .ol-zoom, .ol-rotate, .ol-scale-line { display: none !important; }
`;

export function olHtmlHead(extraStyles: string = ""): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"/>
<link rel="stylesheet" href="${OL_CDN_CSS}"/>
<style>${OL_BASE_STYLES}${extraStyles}</style>
</head>`;
}

export function buildOLInteractiveHtml(
  tileUrl: string,
  initialCenter?: { lat: number; lng: number } | null
): string {
  const centerLng = initialCenter?.lng ?? 10.5;
  const centerLat = initialCenter?.lat ?? 45.5;
  const zoom = initialCenter ? 12 : 6;

  return `${olHtmlHead()}
<body>
<div id="map"></div>
<script src="${OL_CDN_JS}"></script>
<script>
(function() {
  ${OL_BRIDGE_RECEIVE_SCRIPT}
  ${OL_BRIDGE_SEND_LISTENER}
  var map = new ol.Map({
    target: "map",
    layers: [new ol.layer.Tile({ source: new ol.source.XYZ({ url: ${JSON.stringify(tileUrl)}, crossOrigin: "anonymous" }) })],
    view: new ol.View({ center: ol.proj.fromLonLat([${centerLng}, ${centerLat}]), zoom: ${zoom} }),
    controls: []
  });
  var vectorSource = new ol.source.Vector();
  var styleCache = {};
  function makeStyle(color, radius) {
    return new ol.style.Style({ image: new ol.style.Circle({ radius: radius, fill: new ol.style.Fill({ color: color }), stroke: new ol.style.Stroke({ color: "#fff", width: 2 }) }) });
  }
  function featureStyle(feature) {
    var mt = feature.get("markerType");
    var ut = feature.get("userType");
    var key = mt || ut || "default";
    if (!styleCache[key]) {
      var color = mt === "egg" ? "#FFD700" : ut === "biker" ? "#FF6600" : ut === "zavorrina" ? "#E91E8C" : "#9C27B0";
      styleCache[key] = makeStyle(color, mt === "egg" ? 10 : 7);
    }
    return styleCache[key];
  }
  var highlightStyle = makeStyle("rgba(255,200,0,0.9)", 10);
  map.addLayer(new ol.layer.Vector({ source: vectorSource, style: function(f) {
    return f.get("highlighted") ? highlightStyle : featureStyle(f);
  }}));
  map.on("click", function(e) {
    var hit = false;
    map.forEachFeatureAtPixel(e.pixel, function(f) {
      if (hit) return;
      hit = true;
      var uid = f.get("userId"), eid = f.get("eggId");
      if (uid) postMsg({ type: "userPress", userId: uid });
      else if (eid) postMsg({ type: "easterEggPress", eggId: eid });
    });
    if (!hit) { var c = ol.proj.toLonLat(e.coordinate); postMsg({ type: "tap", lat: c[1], lng: c[0] }); }
  });
  map.on("moveend", function() {
    var c = ol.proj.toLonLat(map.getView().getCenter());
    postMsg({ type: "regionChange", lat: c[1], lng: c[0], zoom: map.getView().getZoom() });
  });
  window.olBridge = {
    updateState: function(payload) {
      var state; try { state = typeof payload === "string" ? JSON.parse(payload) : payload; } catch(e) { return; }
      vectorSource.clear();
      var features = [];
      ((state.markers && state.markers.users) || []).forEach(function(u) {
        var f = new ol.Feature(new ol.geom.Point(ol.proj.fromLonLat([u.lng, u.lat])));
        f.set("userId", u.id); f.set("userType", u.userType); features.push(f);
      });
      ((state.markers && state.markers.easterEggs) || []).forEach(function(egg) {
        var f = new ol.Feature(new ol.geom.Point(ol.proj.fromLonLat([egg.lng, egg.lat])));
        f.set("eggId", egg.id); f.set("markerType", "egg"); features.push(f);
      });
      vectorSource.addFeatures(features);
      if (state.center) map.getView().animate({ center: ol.proj.fromLonLat([state.center.lng, state.center.lat]), zoom: state.zoom || 13, duration: 300 });
    },
    focusOn: function(payload) { var d = typeof payload === "string" ? JSON.parse(payload) : payload; if (d) map.getView().animate({ center: ol.proj.fromLonLat([d.lng, d.lat]), zoom: d.zoom || 13, duration: 300 }); },
    centerOnUser: function(payload) { var d = typeof payload === "string" ? JSON.parse(payload) : payload; if (d) map.getView().animate({ center: ol.proj.fromLonLat([d.lng, d.lat]), zoom: 14, duration: 300 }); },
    highlightUser: function(payload) {
      var id = String(payload);
      vectorSource.forEachFeature(function(f) { if (f.get("userId") === id) { f.set("highlighted", true); f.changed(); } });
    },
    updateHazards: function() {},
  };
  postMsg({ type: "ready" });
})();
</script>
</body>
</html>`;
}
