import { LEAFLET_JS, LEAFLET_CSS } from './leaflet-bundle';

export function buildNavigationMapHtml(
  tileUrl: string,
  polylinePoints: Array<[number, number]>,
  stepPoints: Array<[number, number]>,
  offlineTileBasePath?: string | null
): string {
  const routeCoords = JSON.stringify(polylinePoints.map(([lat, lng]) => [lat, lng]));
  const stepCoords = JSON.stringify(stepPoints);
  const offlinePathJs = offlineTileBasePath ? JSON.stringify(offlineTileBasePath) : "null";

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
.leaflet-control-attribution { font-size: 8px !important; opacity: 0.3; }
</style>
</head>
<body>
<div id="map"></div>
<script>${LEAFLET_JS}</script>
<script>
(function() {
  function postMsg(data) {
    try {
      if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(data));
    } catch(e) {}
  }

  var map = L.map("map", {
    center: [41.9028, 12.4964], zoom: 14,
    zoomControl: false, attributionControl: true
  });

  var offlineBasePath = ${offlinePathJs};
  if (offlineBasePath) {
    var OfflineTileLayer = L.TileLayer.extend({
      createTile: function(coords, done) {
        var img = document.createElement("img");
        img.setAttribute("role", "presentation");
        var offlineUrl = offlineBasePath + coords.z + "/" + coords.x + "/" + coords.y + ".png";
        var onlineUrl = ${JSON.stringify(tileUrl)}
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
    new OfflineTileLayer("", { maxZoom: 19, attribution: "" }).addTo(map);
  } else {
    L.tileLayer(${JSON.stringify(tileUrl)}, { maxZoom: 19, attribution: "" }).addTo(map);
  }

  var routeCoords = ${routeCoords};
  var stepCoords = ${stepCoords};

  var totalSegments = Math.max(1, routeCoords.length - 1);

  var donePolyline = null;
  var remainingPolyline = null;
  var arrowMarker = null;
  var isInitialized = false;

  function buildRoute(activeIdx) {
    if (donePolyline) map.removeLayer(donePolyline);
    if (remainingPolyline) map.removeLayer(remainingPolyline);

    var splitAt = Math.min(activeIdx, routeCoords.length - 1);

    if (splitAt > 0) {
      donePolyline = L.polyline(routeCoords.slice(0, splitAt + 1), {
        color: "#777",
        weight: 5,
        opacity: 0.7
      }).addTo(map);
    }

    remainingPolyline = L.polyline(routeCoords.slice(splitAt), {
      color: "#FF6600",
      weight: 6,
      opacity: 0.95
    }).addTo(map);
  }

  function makeArrowHtml(heading) {
    var rad = (heading || 0) * Math.PI / 180;
    return '<div style="width:40px;height:40px;display:flex;align-items:center;justify-content:center;">' +
      '<div style="width:0;height:0;border-left:10px solid transparent;border-right:10px solid transparent;' +
      'border-bottom:28px solid #2196F3;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.6));' +
      'transform:rotate(' + heading + 'deg);transform-origin:center 70%;"></div></div>';
  }

  function updatePosition(lat, lng, heading, activeIdx) {
    if (!isInitialized) {
      buildRoute(0);
      isInitialized = true;
    }

    if (arrowMarker) {
      arrowMarker.setLatLng([lat, lng]);
      arrowMarker.setIcon(L.divIcon({
        html: makeArrowHtml(heading || 0),
        className: "",
        iconSize: [40, 40],
        iconAnchor: [20, 20]
      }));
    } else {
      arrowMarker = L.marker([lat, lng], {
        icon: L.divIcon({
          html: makeArrowHtml(heading || 0),
          className: "",
          iconSize: [40, 40],
          iconAnchor: [20, 20]
        }),
        zIndexOffset: 3000
      }).addTo(map);
    }

    if (activeIdx !== undefined && activeIdx >= 0) {
      buildRoute(activeIdx);
    }

    map.setView([lat, lng], map.getZoom() < 15 ? 16 : map.getZoom(), { animate: true });
  }

  function fitRoute() {
    if (routeCoords.length > 0) {
      try {
        var bounds = L.latLngBounds(routeCoords.map(function(c) { return [c[0], c[1]]; }));
        map.fitBounds(bounds, { padding: [30, 30] });
      } catch(e) {}
    }
  }

  function updateRoute(newCoords) {
    routeCoords = newCoords;
    totalSegments = Math.max(1, routeCoords.length - 1);
    buildRoute(0);
    try {
      var bounds = L.latLngBounds(routeCoords.map(function(c) { return [c[0], c[1]]; }));
      map.fitBounds(bounds, { padding: [30, 30] });
    } catch(e) {}
  }

  window.navBridge = {
    updatePosition: updatePosition,
    fitRoute: fitRoute,
    updateRoute: updateRoute,
    init: function() {
      buildRoute(0);
      isInitialized = true;
      postMsg({ type: "mapReady" });
    }
  };

  fitRoute();
  buildRoute(0);
  isInitialized = true;
  postMsg({ type: "mapReady" });
})();
</script>
</body>
</html>`;
}
