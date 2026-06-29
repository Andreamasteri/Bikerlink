import { htmlHead, mapScriptWrap } from "./map-builder";
import { decimateTrack } from "../maps/track-decimate";

/**
 * Snippet JS condiviso dalle mappe secondarie per emettere lo stato della
 * camera (zoom/bearing/centro) verso React. Permette al MapZoomSlider e al
 * MapNorthCompass di stare in sync senza polling.
 */
export const VIEW_STATE_BRIDGE_SCRIPT = `
    function postViewState() {
      var c = map.getCenter();
      postMsg({
        type: "viewState",
        zoom: map.getZoom(),
        minZoom: map.getMinZoom(),
        maxZoom: map.getMaxZoom(),
        bearing: map.getBearing(),
        lat: c.lat,
        lng: c.lng
      });
    }
    map.on("zoomend", postViewState);
    map.on("rotateend", postViewState);
    map.on("moveend", postViewState);
    postViewState();
`;

/**
 * Handler bridge che MapZoomSlider/MapNorthCompass invocano per cambiare
 * zoom/bearing. Vanno aggiunti dopo che `window.mlBridge` è stato definito.
 */
export const ZOOM_BEARING_BRIDGE_HANDLERS_SCRIPT = `
    window.mlBridge = window.mlBridge || {};
    window.mlBridge.setZoom = function(payload) {
      var level = typeof payload === "object" && payload !== null ? payload.zoom : Number(payload);
      if (typeof level !== "number" || !isFinite(level)) return;
      map.setZoom(level);
    };
    window.mlBridge.resetBearing = function() {
      map.easeTo({ bearing: 0, pitch: 0, duration: 400 });
    };
`;

export function buildMapLibreRouteHtml(
  styleVar: string,
  waypoints: Array<{ lat: number; lng: number; name?: string }>,
  trackPoints?: Array<{ lat: number; lng: number; speedKmh?: number | null }>,
  accentColor: string = "#FF6600"
): string {
  const wpsJson = JSON.stringify(waypoints);
  const trackJson = JSON.stringify(decimateTrack(trackPoints ?? []));
  const accentJs = JSON.stringify(accentColor);

  return `${htmlHead()}
<body>
<div id="map"></div>
${mapScriptWrap(styleVar, "{}", `
    var waypoints = ${wpsJson};
    var track = ${trackJson};
    var accent = ${accentJs};
    var pts = track.length > 1 ? track : waypoints;
    if (pts.length > 1) {
      var coords = pts.map(function(p) { return [p.lng, p.lat]; });
      map.addSource("route", { type: "geojson", data: {
        type: "Feature", geometry: { type: "LineString", coordinates: coords }
      }});
      map.addLayer({ id: "route", type: "line", source: "route",
        layout: { "line-join": "round", "line-cap": "round" },
        paint: { "line-color": accent, "line-width": 4, "line-opacity": 0.9 }
      });
      var lngs = pts.map(function(p) { return p.lng; });
      var lats = pts.map(function(p) { return p.lat; });
      map.fitBounds([[Math.min.apply(null,lngs), Math.min.apply(null,lats)],
        [Math.max.apply(null,lngs), Math.max.apply(null,lats)]], { padding: 30, animate: false });
    } else if (pts.length === 1) {
      map.setCenter([pts[0].lng, pts[0].lat]);
      map.setZoom(13);
    }
    waypoints.forEach(function(wp, i) {
      var el = document.createElement("div");
      var label = i === 0 ? "A" : i === waypoints.length - 1 ? "Z" : String(i);
      el.style.cssText = "width:22px;height:22px;border-radius:11px;background:" + accent +
        ";border:2px solid #fff;color:#fff;font-size:10px;font-weight:bold;" +
        "display:flex;align-items:center;justify-content:center;";
      el.textContent = label;
      new maplibregl.Marker({ element: el }).setLngLat([wp.lng, wp.lat]).addTo(map);
    });
    ${ZOOM_BEARING_BRIDGE_HANDLERS_SCRIPT}
    ${VIEW_STATE_BRIDGE_SCRIPT}
`)}`;
}

export function buildMapLibreMiniHtml(
  styleVar: string,
  lat: number,
  lng: number
): string {
  return `${htmlHead()}
<body>
<div id="map"></div>
${mapScriptWrap(styleVar, `{ center: [${lng}, ${lat}], zoom: 14, interactive: false }`, `
    var el = document.createElement("div");
    el.style.cssText = "width:20px;height:20px;border-radius:10px;background:#FF6600;border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.5);";
    new maplibregl.Marker({ element: el }).setLngLat([${lng}, ${lat}]).addTo(map);
`)}`;
}

export function buildMapLibrePickerHtml(
  styleVar: string,
  initialLat: number,
  initialLng: number,
  initialZoom: number,
  selectedCoord: { lat: number; lng: number } | null,
  accentColor: string
): string {
  const selJson = JSON.stringify(selectedCoord);
  const accentJs = JSON.stringify(accentColor);

  return `${htmlHead()}
<body>
<div id="map"></div>
${mapScriptWrap(styleVar, `{ center: [${initialLng}, ${initialLat}], zoom: ${initialZoom} }`, `
    var accent = ${accentJs};
    var pickerMarker = null;
    var initialSel = ${selJson};
    function placePicker(lng, lat) {
      if (pickerMarker) { pickerMarker.remove(); }
      var el = document.createElement("div");
      el.style.cssText = "width:24px;height:24px;border-radius:12px;background:" + accent +
        ";border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.55);";
      pickerMarker = new maplibregl.Marker({ element: el }).setLngLat([lng, lat]).addTo(map);
      postMsg({ type: "coordPicked", lat: lat, lng: lng });
    }
    if (initialSel && initialSel.lat != null) {
      placePicker(initialSel.lng, initialSel.lat);
      map.setCenter([initialSel.lng, initialSel.lat]);
      map.setZoom(12);
    }
    map.on("click", function(e) { placePicker(e.lngLat.lng, e.lngLat.lat); });
    window.mlBridge = {
      setCoord: function(payload) {
        var data = typeof payload === "string" ? JSON.parse(payload) : payload;
        if (data && data.lat != null) {
          placePicker(data.lng, data.lat);
          map.easeTo({ center: [data.lng, data.lat] });
        }
      },
    };
    ${ZOOM_BEARING_BRIDGE_HANDLERS_SCRIPT}
    ${VIEW_STATE_BRIDGE_SCRIPT}
`)}`;
}

export function buildMapLibreTrackingHtml(
  styleVar: string,
  accentColor: string
): string {
  const accentJs = JSON.stringify(accentColor);

  return `${htmlHead()}
<body>
<div id="map"></div>
${mapScriptWrap(styleVar, "{}", `
    var accent = ${accentJs};
    var currentMarker = null;
    var initialized = false;
    map.addSource("track", { type: "geojson", data: { type: "Feature", geometry: { type: "LineString", coordinates: [] } } });
    map.addLayer({ id: "track", type: "line", source: "track",
      layout: { "line-join": "round", "line-cap": "round" },
      paint: { "line-color": accent, "line-width": 3, "line-opacity": 0.9 }
    });
    function updateTrack(data) {
      var coords = data.points.map(function(p) { return [p.lng, p.lat]; });
      map.getSource("track").setData({ type: "Feature", geometry: { type: "LineString", coordinates: coords } });
      if (data.current) {
        if (currentMarker) { currentMarker.remove(); }
        var el = document.createElement("div");
        el.style.cssText = "width:16px;height:16px;border-radius:8px;background:#2196F3;" +
          "border:3px solid #fff;box-shadow:0 0 10px rgba(33,150,243,0.8);";
        currentMarker = new maplibregl.Marker({ element: el })
          .setLngLat([data.current.lng, data.current.lat]).addTo(map);
        if (!initialized) { initialized = true; map.easeTo({ center: [data.current.lng, data.current.lat], zoom: 14 }); }
      }
    }
    window.mlBridge = {
      updateLocation: function(payload) {
        var data;
        try { data = typeof payload === "string" ? JSON.parse(payload) : payload; } catch(e) { return; }
        updateTrack(data);
      },
    };
    ${ZOOM_BEARING_BRIDGE_HANDLERS_SCRIPT}
    ${VIEW_STATE_BRIDGE_SCRIPT}
    postMsg({ type: "trackingReady" });
`)}`;
}
