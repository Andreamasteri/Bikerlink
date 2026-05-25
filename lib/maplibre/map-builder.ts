import { MAPLIBRE_GL_JS_CDN, MAPLIBRE_GL_CSS_CDN, getMapLibreStyleJson } from "./tile-config";

export interface MapLibreWaypoint {
  lat: number;
  lng: number;
  name: string;
}

export interface MapLibreRouteWaypoint {
  lat: number;
  lng: number;
  name: string;
  waypointType: string;
}

function baseHtml(bodyContent: string, extraStyle: string = ""): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"/>
<meta http-equiv="Content-Security-Policy" content="default-src * 'unsafe-inline' 'unsafe-eval' data: blob:;"/>
<link rel="stylesheet" href="${MAPLIBRE_GL_CSS_CDN}"/>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body, #map { width: 100%; height: 100%; background: #1a1a1a; overflow: hidden; }
.maplibregl-ctrl-attrib { font-size: 8px !important; opacity: 0.45; }
.maplibregl-ctrl-logo { display: none !important; }
${extraStyle}
</style>
</head>
<body>
<div id="map"></div>
${bodyContent}
</body>
</html>`;
}

function postMsgScript(): string {
  return `
function postMsg(obj) {
  try {
    var json = JSON.stringify(obj);
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(json);
    } else {
      window.parent.postMessage(json, "*");
    }
  } catch(e) {}
}`;
}

function waitForMapLibre(): string {
  return `
function waitForMapLibre(cb) {
  if (typeof maplibregl !== "undefined") { cb(); return; }
  var t = 0;
  var iv = setInterval(function() {
    t++;
    if (typeof maplibregl !== "undefined") { clearInterval(iv); cb(); return; }
    if (t > 100) { clearInterval(iv); postMsg({ type: "maplibreLoadError", error: "timeout" }); }
  }, 50);
}`;
}

function createStyleArg(styleJson: string): string {
  if (styleJson.startsWith("http") || styleJson.startsWith("https")) {
    return JSON.stringify(styleJson);
  }
  return styleJson;
}

export function buildMapLibreMiniMapHtml(lat: number, lng: number): string {
  const styleJson = getMapLibreStyleJson(true);
  const styleArg = createStyleArg(styleJson);

  const script = `<script src="${MAPLIBRE_GL_JS_CDN}"></script>
<script>
(function() {
  ${postMsgScript()}
  ${waitForMapLibre()}

  waitForMapLibre(function() {
    var map = new maplibregl.Map({
      container: "map",
      style: ${styleArg},
      center: [${lng}, ${lat}],
      zoom: 14,
      interactive: false,
      attributionControl: true,
    });

    map.on("error", function(e) {
      postMsg({ type: "maplibreLoadError", error: String(e && e.error ? e.error.message : e) });
    });

    var pinEl = document.createElement("div");
    pinEl.style.cssText = "width:20px;height:20px;border-radius:10px;background:#FF6600;border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.5);";
    new maplibregl.Marker({ element: pinEl, anchor: "center" })
      .setLngLat([${lng}, ${lat}])
      .addTo(map);
  });
})();
</script>`;

  return baseHtml(script, `.maplibregl-ctrl-bottom-right,.maplibregl-ctrl-bottom-left { display:none; }`);
}

export function buildMapLibrePickerMapHtml(
  initialLat: number,
  initialLng: number,
  initialZoom: number,
  existingWaypoints: MapLibreWaypoint[],
  selectedCoord: { lat: number; lng: number } | null,
  accentColor: string
): string {
  const styleJson = getMapLibreStyleJson(true);
  const styleArg = createStyleArg(styleJson);
  const wpsJson = JSON.stringify(existingWaypoints);
  const selJson = JSON.stringify(selectedCoord);

  const script = `<script src="${MAPLIBRE_GL_JS_CDN}"></script>
<script>
(function() {
  ${postMsgScript()}
  ${waitForMapLibre()}

  waitForMapLibre(function() {
    var accentColor = ${JSON.stringify(accentColor)};
    var existingWaypoints = ${wpsJson};
    var initialSelected = ${selJson};
    var selectedMarker = null;

    var map = new maplibregl.Map({
      container: "map",
      style: ${styleArg},
      center: [${initialLng}, ${initialLat}],
      zoom: ${initialZoom},
      attributionControl: true,
    });

    map.on("error", function(e) {
      postMsg({ type: "maplibreLoadError", error: String(e && e.error ? e.error.message : e) });
    });

    existingWaypoints.forEach(function(wp, idx) {
      var el = document.createElement("div");
      el.style.cssText = "width:18px;height:18px;border-radius:9px;background:#888;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.4);";
      new maplibregl.Marker({ element: el, anchor: "center" })
        .setLngLat([wp.lng, wp.lat])
        .addTo(map);
    });

    function setPickedMarker(lngLat) {
      if (selectedMarker) { selectedMarker.remove(); }
      var el = document.createElement("div");
      el.style.cssText = "width:22px;height:22px;border-radius:11px;background:" + accentColor + ";border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.5);";
      selectedMarker = new maplibregl.Marker({ element: el, anchor: "center" })
        .setLngLat(lngLat)
        .addTo(map);
      postMsg({ type: "coordPicked", lat: lngLat.lat, lng: lngLat.lng });
    }

    if (initialSelected) {
      setPickedMarker({ lat: initialSelected.lat, lng: initialSelected.lng });
    }

    map.on("click", function(e) {
      setPickedMarker({ lat: e.lngLat.lat, lng: e.lngLat.lng });
    });

    window.pickerBridge = {
      setCoord: function(lat, lng) {
        map.flyTo({ center: [lng, lat], zoom: 14 });
        setPickedMarker({ lat: lat, lng: lng });
      }
    };
  });
})();
</script>`;

  return baseHtml(script);
}

export function buildMapLibreRouteMapHtml(
  waypoints: MapLibreRouteWaypoint[],
  trackPoints: Array<{ lat: number; lng: number; speedKmh?: number | null }>,
  accentColor: string,
  showMarkers: boolean
): string {
  const styleJson = getMapLibreStyleJson(true);
  const styleArg = createStyleArg(styleJson);
  const waypointsJson = JSON.stringify(waypoints);
  const trackJson = JSON.stringify(trackPoints);

  const script = `<script src="${MAPLIBRE_GL_JS_CDN}"></script>
<script>
(function() {
  ${postMsgScript()}
  ${waitForMapLibre()}

  waitForMapLibre(function() {
    var waypoints = ${waypointsJson};
    var trackPoints = ${trackJson};
    var accentColor = ${JSON.stringify(accentColor)};
    var showMarkers = ${showMarkers ? "true" : "false"};

    var center = trackPoints.length > 0
      ? [trackPoints[Math.floor(trackPoints.length / 2)].lng, trackPoints[Math.floor(trackPoints.length / 2)].lat]
      : waypoints.length > 0 ? [waypoints[0].lng, waypoints[0].lat] : [12.5, 41.9];

    var map = new maplibregl.Map({
      container: "map",
      style: ${styleArg},
      center: center,
      zoom: 6,
      attributionControl: true,
    });

    map.on("error", function(e) {
      postMsg({ type: "maplibreLoadError", error: String(e && e.error ? e.error.message : e) });
    });

    function speedColor(kmh) {
      if (kmh == null || kmh < 0) return accentColor;
      if (kmh < 60) return "#22c55e";
      if (kmh < 100) return "#eab308";
      if (kmh < 130) return "#f97316";
      return "#ef4444";
    }

    map.on("load", function() {
      var pts = trackPoints.length > 0 ? trackPoints : waypoints.map(function(w) { return { lat: w.lat, lng: w.lng }; });

      if (pts.length > 1) {
        var hasSpeed = trackPoints.some(function(p) { return p.speedKmh != null; });

        if (hasSpeed) {
          trackPoints.forEach(function(p, i) {
            if (i >= trackPoints.length - 1) return;
            var next = trackPoints[i + 1];
            var color = speedColor(p.speedKmh);
            var segId = "seg-" + i;
            map.addSource(segId, {
              type: "geojson",
              data: {
                type: "Feature",
                properties: {},
                geometry: {
                  type: "LineString",
                  coordinates: [[p.lng, p.lat], [next.lng, next.lat]]
                }
              }
            });
            map.addLayer({
              id: segId,
              type: "line",
              source: segId,
              layout: { "line-join": "round", "line-cap": "round" },
              paint: { "line-color": color, "line-width": 4, "line-opacity": 0.9 }
            });
          });
        } else {
          var coords = pts.map(function(p) { return [p.lng, p.lat]; });
          map.addSource("route", {
            type: "geojson",
            data: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: coords } }
          });
          map.addLayer({
            id: "route",
            type: "line",
            source: "route",
            layout: { "line-join": "round", "line-cap": "round" },
            paint: { "line-color": accentColor, "line-width": 4, "line-opacity": 0.9 }
          });
        }

        if (showMarkers && waypoints.length > 0) {
          waypoints.forEach(function(wp, idx) {
            var label = idx === 0 ? "A" : idx === waypoints.length - 1 ? "Z" : String(idx);
            var el = document.createElement("div");
            el.style.cssText = "width:24px;height:24px;border-radius:12px;background:" + accentColor + ";border:2px solid #fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:bold;color:#fff;box-shadow:0 2px 6px rgba(0,0,0,0.4);";
            el.textContent = label;
            new maplibregl.Marker({ element: el, anchor: "center" })
              .setLngLat([wp.lng, wp.lat])
              .addTo(map);
          });
        }

        var lats = pts.map(function(p) { return p.lat; });
        var lngs = pts.map(function(p) { return p.lng; });
        var sw = [Math.min.apply(null, lngs), Math.min.apply(null, lats)];
        var ne = [Math.max.apply(null, lngs), Math.max.apply(null, lats)];
        if (sw[0] === ne[0] && sw[1] === ne[1]) {
          map.setCenter([sw[0], sw[1]]);
          map.setZoom(13);
        } else {
          map.fitBounds([sw, ne], { padding: 30, animate: false });
        }
      }
    });
  });
})();
</script>`;

  return baseHtml(script);
}

export function buildMapLibreTrackingMapHtml(accentColor: string): string {
  const styleJson = getMapLibreStyleJson(true);
  const styleArg = createStyleArg(styleJson);

  const script = `<script src="${MAPLIBRE_GL_JS_CDN}"></script>
<script>
(function() {
  ${postMsgScript()}
  ${waitForMapLibre()}

  waitForMapLibre(function() {
    var accentColor = ${JSON.stringify(accentColor)};

    var map = new maplibregl.Map({
      container: "map",
      style: ${styleArg},
      center: [12.5, 41.9],
      zoom: 6,
      attributionControl: true,
    });

    map.on("error", function(e) {
      postMsg({ type: "maplibreLoadError", error: String(e && e.error ? e.error.message : e) });
    });

    var trackCoords = [];
    var currentMarker = null;
    var initialized = false;
    var mapLoaded = false;
    var pendingUpdate = null;

    function isValidCoord(lat, lng) {
      return typeof lat === "number" && isFinite(lat) && lat >= -90 && lat <= 90 &&
             typeof lng === "number" && isFinite(lng) && lng >= -180 && lng <= 180;
    }

    function applyUpdate(data) {
      if (Array.isArray(data.points)) {
        trackCoords = data.points
          .filter(function(p) { return p && isValidCoord(p.lat, p.lng); })
          .map(function(p) { return [p.lng, p.lat]; });

        if (mapLoaded) {
          var src = map.getSource("track");
          if (src) {
            src.setData({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: trackCoords } });
          }
        }
      }

      if (data.current && isValidCoord(data.current.lat, data.current.lng)) {
        var lat = data.current.lat;
        var lng = data.current.lng;

        if (currentMarker) { currentMarker.remove(); }
        var el = document.createElement("div");
        el.style.cssText = "width:18px;height:18px;border-radius:9px;background:#2196F3;border:3px solid #fff;box-shadow:0 0 8px rgba(33,150,243,0.7);animation:pulse 2s infinite;";
        currentMarker = new maplibregl.Marker({ element: el, anchor: "center" })
          .setLngLat([lng, lat])
          .addTo(map);

        if (!initialized) {
          map.setCenter([lng, lat]);
          map.setZoom(14);
          initialized = true;
        } else {
          map.easeTo({ center: [lng, lat] });
        }
      }
    }

    map.on("load", function() {
      mapLoaded = true;
      map.addSource("track", {
        type: "geojson",
        data: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [] } }
      });
      map.addLayer({
        id: "track",
        type: "line",
        source: "track",
        layout: { "line-join": "round", "line-cap": "round" },
        paint: { "line-color": accentColor, "line-width": 4, "line-opacity": 0.85 }
      });

      if (pendingUpdate) { applyUpdate(pendingUpdate); pendingUpdate = null; }
      postMsg({ type: "trackingReady" });
    });

    window.trackingBridge = {
      updateLocation: function(json) {
        var data;
        try { data = JSON.parse(json); } catch(e) { return; }
        if (!mapLoaded) { pendingUpdate = data; return; }
        applyUpdate(data);
      }
    };
  });
})();
</script>`;

  return baseHtml(script, `@keyframes pulse { 0%{box-shadow:0 0 0 0 rgba(33,150,243,0.7)} 70%{box-shadow:0 0 0 10px rgba(33,150,243,0)} 100%{box-shadow:0 0 0 0 rgba(33,150,243,0)} }`);
}

export function buildMapLibreInteractiveMapHtml(): string {
  const styleJson = getMapLibreStyleJson(true);
  const styleArg = createStyleArg(styleJson);

  const script = `<script src="${MAPLIBRE_GL_JS_CDN}"></script>
<script>
(function() {
  ${postMsgScript()}
  ${waitForMapLibre()}

  waitForMapLibre(function() {
    var STATE = {
      users: [], workshops: [], easterEggs: [], sos: [], clubs: [], events: [],
      meReal: null, meFake: null, radiusKm: null,
      filterBiker: true, filterZavorrina: true,
      filterClubs: true, filterEvents: true,
      currentUserId: null
    };
    var markers = {};
    var markerEls = {};
    var mapLoaded = false;
    var pendingOps = [];

    var map = new maplibregl.Map({
      container: "map",
      style: ${styleArg},
      center: [12.5, 41.9],
      zoom: 6,
      attributionControl: true,
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");

    map.on("error", function(e) {
      postMsg({ type: "maplibreLoadError", error: String(e && e.error ? e.error.message : e) });
    });

    function getUserColor(u) {
      if (u.userType === "biker") return u.sex === "F" ? "#e879f9" : u.sex === "M" ? "#3b82f6" : "#94a3b8";
      if (u.userType === "zavorrina") return "#f472b6";
      if (u.userType === "coppia") return "#a78bfa";
      return "#94a3b8";
    }

    function createUserEl(u, isMe) {
      var el = document.createElement("div");
      var color = isMe ? "#FF6600" : getUserColor(u);
      var size = isMe ? 22 : 18;
      var border = isMe ? "3px solid #fff" : "2px solid rgba(255,255,255,0.7)";
      el.style.cssText = "width:" + size + "px;height:" + size + "px;border-radius:50%;background:" + color + ";border:" + border + ";box-shadow:0 2px 6px rgba(0,0,0,0.4);cursor:pointer;transition:transform 0.15s;";
      el.addEventListener("mouseenter", function() { el.style.transform = "scale(1.3)"; });
      el.addEventListener("mouseleave", function() { el.style.transform = "scale(1)"; });
      return el;
    }

    function removeMarker(id) {
      if (markers[id]) { markers[id].remove(); delete markers[id]; delete markerEls[id]; }
    }

    function upsertUserMarker(u, isMe) {
      var show = true;
      if (!isMe) {
        if (u.userType === "biker" && !STATE.filterBiker) show = false;
        if (u.userType === "zavorrina" && !STATE.filterZavorrina) show = false;
      }
      if (!show) { removeMarker("u_" + u.id); return; }
      if (markers["u_" + u.id]) { markers["u_" + u.id].setLngLat([u.longitude, u.latitude]); return; }
      var el = createUserEl(u, isMe);
      el.addEventListener("click", function(e) {
        e.stopPropagation();
        postMsg({ type: "userPress", userId: u.id });
      });
      markers["u_" + u.id] = new maplibregl.Marker({ element: el, anchor: "center" })
        .setLngLat([u.longitude, u.latitude])
        .addTo(map);
      markerEls["u_" + u.id] = el;
    }

    function updateUsers() {
      var existingKeys = {};
      STATE.users.forEach(function(u) {
        var isMe = u.id == STATE.currentUserId;
        upsertUserMarker(u, isMe);
        existingKeys["u_" + u.id] = true;
      });
      Object.keys(markers).forEach(function(k) {
        if (k.startsWith("u_") && !existingKeys[k]) removeMarker(k);
      });
    }

    function upsertWorkshopMarker(w) {
      if (markers["ws_" + w.id]) return;
      var el = document.createElement("div");
      el.style.cssText = "width:18px;height:18px;border-radius:4px;background:" + (w.isSynecoPartner ? "#FF6600" : "#22c55e") + ";border:2px solid #fff;display:flex;align-items:center;justify-content:center;font-size:10px;box-shadow:0 2px 6px rgba(0,0,0,0.4);cursor:pointer;";
      el.textContent = "\\uD83D\\uDD27";
      el.addEventListener("click", function(e) { e.stopPropagation(); postMsg({ type: "workshopPress", workshopId: w.id }); });
      markers["ws_" + w.id] = new maplibregl.Marker({ element: el, anchor: "center" }).setLngLat([w.longitude, w.latitude]).addTo(map);
    }

    function updateWorkshops() {
      var existingKeys = {};
      STATE.workshops.forEach(function(w) { upsertWorkshopMarker(w); existingKeys["ws_" + w.id] = true; });
      Object.keys(markers).forEach(function(k) { if (k.startsWith("ws_") && !existingKeys[k]) removeMarker(k); });
    }

    function upsertSosMarker(s) {
      if (markers["sos_" + s.id]) return;
      var el = document.createElement("div");
      el.style.cssText = "width:22px;height:22px;border-radius:11px;background:#ef4444;border:2px solid #fff;display:flex;align-items:center;justify-content:center;font-size:12px;box-shadow:0 0 8px rgba(239,68,68,0.7);animation:sosPulse 1s infinite;cursor:pointer;";
      el.textContent = "\\uD83C\\uDD98";
      el.addEventListener("click", function(e) { e.stopPropagation(); postMsg({ type: "sosPress", sosId: s.id }); });
      markers["sos_" + s.id] = new maplibregl.Marker({ element: el, anchor: "center" }).setLngLat([s.longitude, s.latitude]).addTo(map);
    }

    function updateSos() {
      var existingKeys = {};
      STATE.sos.forEach(function(s) { upsertSosMarker(s); existingKeys["sos_" + s.id] = true; });
      Object.keys(markers).forEach(function(k) { if (k.startsWith("sos_") && !existingKeys[k]) removeMarker(k); });
    }

    function upsertEventMarker(ev) {
      if (markers["ev_" + ev.id]) return;
      if (!STATE.filterEvents) return;
      var el = document.createElement("div");
      el.style.cssText = "width:18px;height:18px;border-radius:9px;background:#f97316;border:2px solid #fff;display:flex;align-items:center;justify-content:center;font-size:10px;box-shadow:0 2px 6px rgba(0,0,0,0.4);cursor:pointer;";
      el.textContent = "\\uD83D\\uDCC5";
      el.addEventListener("click", function(e) { e.stopPropagation(); postMsg({ type: "eventPress", eventId: ev.id }); });
      markers["ev_" + ev.id] = new maplibregl.Marker({ element: el, anchor: "center" }).setLngLat([ev.longitude, ev.latitude]).addTo(map);
    }

    function updateEvents() {
      var existingKeys = {};
      if (STATE.filterEvents) {
        STATE.events.forEach(function(ev) { upsertEventMarker(ev); existingKeys["ev_" + ev.id] = true; });
      }
      Object.keys(markers).forEach(function(k) { if (k.startsWith("ev_") && !existingKeys[k]) removeMarker(k); });
    }

    function upsertClubMarker(c) {
      if (markers["cl_" + c.id]) return;
      if (!STATE.filterClubs) return;
      var el = document.createElement("div");
      el.style.cssText = "width:18px;height:18px;border-radius:4px;background:#8b5cf6;border:2px solid #fff;display:flex;align-items:center;justify-content:center;font-size:10px;box-shadow:0 2px 6px rgba(0,0,0,0.4);cursor:pointer;";
      el.textContent = "\\uD83C\\uDFCD";
      el.addEventListener("click", function(e) { e.stopPropagation(); postMsg({ type: "clubPress", clubId: c.id }); });
      markers["cl_" + c.id] = new maplibregl.Marker({ element: el, anchor: "center" }).setLngLat([c.longitude, c.latitude]).addTo(map);
    }

    function updateClubs() {
      var existingKeys = {};
      if (STATE.filterClubs) {
        STATE.clubs.forEach(function(c) { upsertClubMarker(c); existingKeys["cl_" + c.id] = true; });
      }
      Object.keys(markers).forEach(function(k) { if (k.startsWith("cl_") && !existingKeys[k]) removeMarker(k); });
    }

    function upsertEasterEggMarker(e) {
      if (markers["ee_" + e.id]) return;
      var el = document.createElement("div");
      el.style.cssText = "width:20px;height:20px;border-radius:4px;background:#facc15;border:2px solid #fff;display:flex;align-items:center;justify-content:center;font-size:11px;box-shadow:0 2px 6px rgba(0,0,0,0.4);cursor:pointer;";
      el.textContent = "\\uD83E\\uDD5A";
      el.addEventListener("click", function(ev) { ev.stopPropagation(); postMsg({ type: "easterEggPress", eggId: e.id, name: e.name, latitude: e.latitude, longitude: e.longitude }); });
      markers["ee_" + e.id] = new maplibregl.Marker({ element: el, anchor: "center" }).setLngLat([e.longitude, e.latitude]).addTo(map);
    }

    function updateEasterEggs() {
      var existingKeys = {};
      STATE.easterEggs.forEach(function(e) { upsertEasterEggMarker(e); existingKeys["ee_" + e.id] = true; });
      Object.keys(markers).forEach(function(k) { if (k.startsWith("ee_") && !existingKeys[k]) removeMarker(k); });
    }

    function updateRadius() {
      var src = mapLoaded && map.getSource("radius-source");
      if (!src) return;
      if (!STATE.meReal || !STATE.radiusKm) {
        src.setData({ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [[]] } });
        return;
      }
      var c = [STATE.meReal.longitude, STATE.meReal.latitude];
      var r = STATE.radiusKm * 1000;
      var steps = 64;
      var coords = [];
      for (var i = 0; i <= steps; i++) {
        var a = (i / steps) * 2 * Math.PI;
        var dLng = (r / 111320) * Math.cos(a) / Math.cos(c[1] * Math.PI / 180);
        var dLat = (r / 111320) * Math.sin(a);
        coords.push([c[0] + dLng, c[1] + dLat]);
      }
      src.setData({ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [coords] } });
    }

    map.on("load", function() {
      mapLoaded = true;

      map.addSource("radius-source", {
        type: "geojson",
        data: { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [[]] } }
      });
      map.addLayer({
        id: "radius-fill",
        type: "fill",
        source: "radius-source",
        paint: { "fill-color": "#FF6600", "fill-opacity": 0.06 }
      });
      map.addLayer({
        id: "radius-border",
        type: "line",
        source: "radius-source",
        paint: { "line-color": "#FF6600", "line-width": 1.5, "line-opacity": 0.4 }
      });

      updateUsers();
      updateWorkshops();
      updateSos();
      updateEvents();
      updateClubs();
      updateEasterEggs();
      updateRadius();
      pendingOps.forEach(function(fn) { fn(); });
      pendingOps = [];
      postMsg({ type: "mapReady" });
    });

    map.on("moveend", function() {
      var c = map.getCenter();
      postMsg({ type: "regionChange", latitude: c.lat, longitude: c.lng });
    });

    window.maplibreBridge = {
      updateState: function(json) {
        var data;
        try { data = JSON.parse(json); } catch(e) { return; }
        if (data.users !== undefined) STATE.users = data.users;
        if (data.workshops !== undefined) STATE.workshops = data.workshops;
        if (data.sos !== undefined) STATE.sos = data.sos;
        if (data.events !== undefined) STATE.events = data.events;
        if (data.clubs !== undefined) STATE.clubs = data.clubs;
        if (data.easterEggs !== undefined) STATE.easterEggs = data.easterEggs;
        if (data.filterBiker !== undefined) STATE.filterBiker = data.filterBiker;
        if (data.filterZavorrina !== undefined) STATE.filterZavorrina = data.filterZavorrina;
        if (data.filterClubs !== undefined) STATE.filterClubs = data.filterClubs;
        if (data.filterEvents !== undefined) STATE.filterEvents = data.filterEvents;
        if (data.meReal !== undefined) STATE.meReal = data.meReal;
        if (data.meFake !== undefined) STATE.meFake = data.meFake;
        if (data.radiusKm !== undefined) STATE.radiusKm = data.radiusKm;
        if (data.currentUserId !== undefined) STATE.currentUserId = data.currentUserId;
        if (!mapLoaded) {
          pendingOps.push(function() {
            updateUsers(); updateWorkshops(); updateSos();
            updateEvents(); updateClubs(); updateEasterEggs(); updateRadius();
          });
          return;
        }
        updateUsers();
        if (data.workshops !== undefined) updateWorkshops();
        if (data.sos !== undefined) updateSos();
        if (data.events !== undefined || data.filterEvents !== undefined) updateEvents();
        if (data.clubs !== undefined || data.filterClubs !== undefined) updateClubs();
        if (data.easterEggs !== undefined) updateEasterEggs();
        if (data.meReal !== undefined || data.radiusKm !== undefined) updateRadius();
      },
      focusOn: function(lat, lng, zoom) {
        map.flyTo({ center: [lng, lat], zoom: zoom || 14 });
      },
      centerOnUser: function(lat, lng) {
        map.easeTo({ center: [lng, lat] });
      },
      highlightUser: function(userId) {
        var el = markerEls["u_" + userId];
        if (el) { el.style.transform = "scale(1.6)"; setTimeout(function() { el.style.transform = "scale(1)"; }, 800); }
      }
    };
  });
})();
</script>`;

  return baseHtml(script, `.maplibregl-ctrl-bottom-right { bottom: 80px !important; }
@keyframes sosPulse { 0%{box-shadow:0 0 0 0 rgba(239,68,68,0.7)} 70%{box-shadow:0 0 0 10px rgba(239,68,68,0)} 100%{box-shadow:0 0 0 0 rgba(239,68,68,0)} }`);
}
