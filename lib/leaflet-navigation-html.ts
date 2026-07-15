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
  const tileUrlJs = JSON.stringify(tileUrl);

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
  // Tuning for the two-stage weak-signal degradation.
  var ERROR_WINDOW_MS = 8000;   // a tile error is "recent" for this long
  var STABLE_MS = 30000;        // tiles must load continuously this long to restore the map
  var PROBE_INTERVAL_MS = 3000; // how often to probe connectivity while in minimal view
  var PROBE_TIMEOUT_MS = 4000;  // per-probe timeout

  function postMsg(data) {
    try {
      if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(data));
    } catch(e) {}
  }

  var map = L.map("map", {
    center: [41.9028, 12.4964], zoom: 14,
    zoomControl: false, attributionControl: true
  });

  var tileUrlTemplate = ${tileUrlJs};
  var offlineBasePath = ${offlinePathJs};

  // --- tile layer factory (online or offline-first) ------------------------
  function makeTileLayer() {
    if (offlineBasePath) {
      var OfflineTileLayer = L.TileLayer.extend({
        createTile: function(coords, done) {
          var img = document.createElement("img");
          img.setAttribute("role", "presentation");
          var offlineUrl = offlineBasePath + coords.z + "/" + coords.x + "/" + coords.y + ".png";
          var onlineUrl = buildTileUrl(coords.z, coords.x, coords.y);
          img.onload = function() { done(null, img); };
          img.onerror = function() {
            img.src = onlineUrl;
            img.onerror = function() { done(new Error("tile load failed"), img); };
          };
          img.src = offlineUrl;
          return img;
        }
      });
      return new OfflineTileLayer("", { maxZoom: 19, attribution: "" });
    }
    return L.tileLayer(tileUrlTemplate, { maxZoom: 19, attribution: "" });
  }

  function buildTileUrl(z, x, y) {
    return tileUrlTemplate
      .replace(/{s}/g, "a")
      .replace(/{r}/g, "")
      .replace("{z}", z)
      .replace("{x}", x)
      .replace("{y}", y);
  }

  // --- weak-signal / minimal-view state ------------------------------------
  var loadedTiles = {};      // "z:x:y" -> true, tiles that actually rendered
  var lastTileErrorAt = 0;   // timestamp of most recent tile load failure
  var manualMinimal = false; // user forced the red-stripe view
  var autoMinimal = false;   // signal-driven red-stripe view
  var minimalActive = false; // effective state currently applied to the map
  var lastPos = null;        // { lat, lng }
  var lastActiveIdx = 0;

  function attachTileEvents(layer) {
    layer.on("tileload", function(e) {
      if (e && e.coords) loadedTiles[e.coords.z + ":" + e.coords.x + ":" + e.coords.y] = true;
    });
    layer.on("tileerror", function(e) {
      if (e && e.coords) delete loadedTiles[e.coords.z + ":" + e.coords.x + ":" + e.coords.y];
      lastTileErrorAt = Date.now();
      evaluateAutoMinimal();
    });
  }

  function currentTileKey() {
    if (!lastPos) return null;
    var z = Math.round(map.getZoom());
    var p = map.project([lastPos.lat, lastPos.lng], z);
    return z + ":" + Math.floor(p.x / 256) + ":" + Math.floor(p.y / 256);
  }

  // Stage 1 keeps the already-rendered map visible: we only escalate to the
  // minimal view once the tile covering the CURRENT position is missing (user
  // left the rendered/offline-covered area) AND tiles are actively failing.
  function isCurrentCovered() {
    var k = currentTileKey();
    if (!k) return true;
    return !!loadedTiles[k];
  }

  function evaluateAutoMinimal() {
    if (manualMinimal || autoMinimal) return;
    if (!isCurrentCovered() && (Date.now() - lastTileErrorAt) < ERROR_WINDOW_MS) {
      autoMinimal = true;
      applyView();
    }
  }

  var tileLayer = makeTileLayer();
  attachTileEvents(tileLayer);
  tileLayer.addTo(map);

  var routeCoords = ${routeCoords};
  var stepCoords = ${stepCoords};

  var totalSegments = Math.max(1, routeCoords.length - 1);

  var donePolyline = null;
  var remainingPolyline = null;
  var minimalPolyline = null;
  var arrowMarker = null;
  var isInitialized = false;

  function buildRoute(activeIdx) {
    lastActiveIdx = activeIdx;
    if (minimalActive) return; // minimal view draws its own single red stripe
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

  // --- minimal red-stripe view ---------------------------------------------
  function showMinimalRoute() {
    if (donePolyline) { map.removeLayer(donePolyline); donePolyline = null; }
    if (remainingPolyline) { map.removeLayer(remainingPolyline); remainingPolyline = null; }
    if (!minimalPolyline && routeCoords.length > 1) {
      minimalPolyline = L.polyline(routeCoords, {
        color: "#FF0000",
        weight: 6,
        opacity: 1
      }).addTo(map);
    }
  }

  function hideMinimalRoute() {
    if (minimalPolyline) { map.removeLayer(minimalPolyline); minimalPolyline = null; }
  }

  function notifyView() {
    postMsg({ type: "viewMode", minimal: minimalActive, manual: manualMinimal, auto: autoMinimal });
  }

  // Applies the effective view. Entering minimal ACTUALLY removes the tile
  // layer (frees the WebView tile memory); exiting rebuilds a fresh one.
  function applyView() {
    var minimal = manualMinimal || autoMinimal;
    if (minimal && !minimalActive) {
      if (tileLayer) { map.removeLayer(tileLayer); tileLayer = null; }
      loadedTiles = {};
      minimalActive = true;
      showMinimalRoute();
      startProbe();
      notifyView();
    } else if (!minimal && minimalActive) {
      minimalActive = false;
      hideMinimalRoute();
      stopProbe();
      if (!tileLayer) {
        tileLayer = makeTileLayer();
        attachTileEvents(tileLayer);
        tileLayer.addTo(map);
      }
      buildRoute(lastActiveIdx);
      notifyView();
    }
  }

  // --- connectivity probe + restore hysteresis -----------------------------
  var probeTimer = null;
  var stableStart = 0;

  function probeCoords() {
    var z = Math.round(map.getZoom()) || 14;
    var center = lastPos ? [lastPos.lat, lastPos.lng] : [map.getCenter().lat, map.getCenter().lng];
    var p = map.project(center, z);
    return { z: z, x: Math.floor(p.x / 256), y: Math.floor(p.y / 256) };
  }

  function runProbe() {
    var c = probeCoords();
    var url = buildTileUrl(c.z, c.x, c.y);
    url += (url.indexOf("?") > -1 ? "&" : "?") + "_p=" + Date.now();
    var img = new Image();
    var settled = false;
    function settle(ok) {
      if (settled) return;
      settled = true;
      onProbeResult(ok);
    }
    img.onload = function() { settle(true); };
    img.onerror = function() { settle(false); };
    setTimeout(function() { settle(false); }, PROBE_TIMEOUT_MS);
    img.src = url;
  }

  function onProbeResult(ok) {
    if (ok) {
      if (!stableStart) stableStart = Date.now();
      // Restore the full map only when the signal has been continuously good
      // for 30s AND the minimal view was signal-driven (not a manual toggle).
      if (autoMinimal && !manualMinimal && (Date.now() - stableStart) >= STABLE_MS) {
        autoMinimal = false;
        applyView();
      }
    } else {
      stableStart = 0; // any failure resets the 30s window (no flapping)
    }
  }

  function startProbe() {
    stopProbe();
    stableStart = 0;
    probeTimer = setInterval(runProbe, PROBE_INTERVAL_MS);
    runProbe();
  }

  function stopProbe() {
    if (probeTimer) { clearInterval(probeTimer); probeTimer = null; }
    stableStart = 0;
  }

  function makeArrowHtml(heading) {
    var rad = (heading || 0) * Math.PI / 180;
    return '<div style="width:40px;height:40px;display:flex;align-items:center;justify-content:center;">' +
      '<div style="width:0;height:0;border-left:10px solid transparent;border-right:10px solid transparent;' +
      'border-bottom:28px solid #2196F3;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.6));' +
      'transform:rotate(' + heading + 'deg);transform-origin:center 70%;"></div></div>';
  }

  function updatePosition(lat, lng, heading, activeIdx) {
    lastPos = { lat: lat, lng: lng };

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

    // A move may have taken us out of the already-rendered area.
    evaluateAutoMinimal();
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
    if (minimalActive) {
      hideMinimalRoute();
      showMinimalRoute();
    } else {
      buildRoute(0);
    }
    try {
      var bounds = L.latLngBounds(routeCoords.map(function(c) { return [c[0], c[1]]; }));
      map.fitBounds(bounds, { padding: [30, 30] });
    } catch(e) {}
  }

  function setManualMinimal(on) {
    manualMinimal = !!on;
    applyView();
    notifyView();
  }

  window.navBridge = {
    updatePosition: updatePosition,
    fitRoute: fitRoute,
    updateRoute: updateRoute,
    setManualMinimal: setManualMinimal,
    init: function() {
      buildRoute(0);
      isInitialized = true;
      postMsg({ type: "mapReady" });
      notifyView();
    }
  };

  fitRoute();
  buildRoute(0);
  isInitialized = true;
  postMsg({ type: "mapReady" });
  notifyView();
})();
</script>
</body>
</html>`;
}
