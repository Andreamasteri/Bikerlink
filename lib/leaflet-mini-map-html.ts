import { LEAFLET_JS, LEAFLET_CSS } from './leaflet-bundle';

export function buildLeafletMiniMapHtml(tileUrl: string, tileMaxZoom: number, lat: number, lng: number): string {
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
  var lat = ${lat};
  var lng = ${lng};
  var map = L.map("map", {
    center: [lat, lng],
    zoom: 14,
    zoomControl: false,
    attributionControl: true,
    scrollWheelZoom: false,
    dragging: false,
    touchZoom: false,
    doubleClickZoom: false,
    boxZoom: false,
    keyboard: false
  });
  L.tileLayer(${JSON.stringify(tileUrl)}, { maxZoom: ${tileMaxZoom}, attribution: "" }).addTo(map);
  var pinHtml = "<div style=\\"width:20px;height:20px;border-radius:10px;background:#FF6600;border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.5);\\"></div>";
  L.marker([lat, lng], {
    icon: L.divIcon({ html: pinHtml, className: "", iconSize: [20, 20], iconAnchor: [10, 10] })
  }).addTo(map);
})();
</script>
</body>
</html>`;
}
