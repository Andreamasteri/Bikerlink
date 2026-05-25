import { olHtmlHead, OL_CDN_JS } from "./map-builder";
import { OL_BRIDGE_RECEIVE_SCRIPT, OL_BRIDGE_SEND_LISTENER } from "./bridge-events";

export function buildOLMiniHtml(tileUrl: string, lat: number, lng: number): string {
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
    view: new ol.View({ center: ol.proj.fromLonLat([${lng}, ${lat}]), zoom: 14 }),
    controls: [], interactions: []
  });
  var vs = new ol.source.Vector();
  var f = new ol.Feature(new ol.geom.Point(ol.proj.fromLonLat([${lng}, ${lat}])));
  f.setStyle(new ol.style.Style({ image: new ol.style.Circle({ radius: 10, fill: new ol.style.Fill({ color: "#FF6600" }), stroke: new ol.style.Stroke({ color: "#fff", width: 3 }) }) }));
  vs.addFeature(f);
  map.addLayer(new ol.layer.Vector({ source: vs }));
})();
</script>
</body>
</html>`;
}

export function buildOLRouteHtml(
  tileUrl: string,
  waypoints: Array<{ lat: number; lng: number; name?: string }>,
  trackPoints?: Array<{ lat: number; lng: number; speedKmh?: number | null }>,
  accentColor: string = "#FF6600"
): string {
  const pts = (trackPoints && trackPoints.length > 1) ? trackPoints : waypoints;
  const ptsJson = JSON.stringify(pts);
  const wpsJson = JSON.stringify(waypoints);
  const accentJs = JSON.stringify(accentColor);

  return `${olHtmlHead()}
<body>
<div id="map"></div>
<script src="${OL_CDN_JS}"></script>
<script>
(function() {
  ${OL_BRIDGE_RECEIVE_SCRIPT}
  ${OL_BRIDGE_SEND_LISTENER}
  var accent = ${accentJs};
  var pts = ${ptsJson};
  var waypoints = ${wpsJson};
  var map = new ol.Map({
    target: "map",
    layers: [new ol.layer.Tile({ source: new ol.source.XYZ({ url: ${JSON.stringify(tileUrl)}, crossOrigin: "anonymous" }) })],
    view: new ol.View({ center: ol.proj.fromLonLat([10.5, 45.5]), zoom: 6 }),
    controls: []
  });
  var vs = new ol.source.Vector();
  if (pts.length > 1) {
    var coords = pts.map(function(p) { return ol.proj.fromLonLat([p.lng, p.lat]); });
    var line = new ol.Feature(new ol.geom.LineString(coords));
    line.setStyle(new ol.style.Style({ stroke: new ol.style.Stroke({ color: accent, width: 4 }) }));
    vs.addFeature(line);
    var lngs = pts.map(function(p) { return p.lng; });
    var lats = pts.map(function(p) { return p.lat; });
    var extent = ol.proj.transformExtent([Math.min.apply(null,lngs), Math.min.apply(null,lats), Math.max.apply(null,lngs), Math.max.apply(null,lats)], "EPSG:4326", "EPSG:3857");
    map.getView().fit(extent, { padding: [30,30,30,30], maxZoom: 16 });
  } else if (pts.length === 1) {
    map.getView().setCenter(ol.proj.fromLonLat([pts[0].lng, pts[0].lat]));
    map.getView().setZoom(13);
  }
  waypoints.forEach(function(wp, i) {
    var label = i === 0 ? "A" : i === waypoints.length - 1 ? "Z" : String(i);
    var f = new ol.Feature(new ol.geom.Point(ol.proj.fromLonLat([wp.lng, wp.lat])));
    f.setStyle(new ol.style.Style({ image: new ol.style.Circle({ radius: 11, fill: new ol.style.Fill({ color: accent }), stroke: new ol.style.Stroke({ color: "#fff", width: 2 }) }), text: new ol.style.Text({ text: label, fill: new ol.style.Fill({ color: "#fff" }), font: "bold 10px sans-serif" }) }));
    vs.addFeature(f);
  });
  map.addLayer(new ol.layer.Vector({ source: vs }));
})();
</script>
</body>
</html>`;
}
