/* Leaflet WebView bridge — JavaScript embedded in the WebView HTML.
   Estratto da leaflet-map-html.ts per rispettare il limite 600 righe. */
export const LEAFLET_MAP_BRIDGE_JS = `
(function() {
  function postMsg(data) {
    try {
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify(data));
      }
    } catch(e) {}
  }

  /* Task #3132 — Telemetria mappa nera: qualunque errore non gestito nel blocco
     di init (L.map, layerGroup, OMS, bridge) viene catturato e segnalato via
     postMsg("mapInitError") al lato RN, che lo emette come evento telemetria
     "map_init_failed". Questo rende rilevabile automaticamente la mappa nera
     senza dover leggere i log del dispositivo. */
  try {

  var map = L.map("map", {
    center: [41.9028, 12.4964],
    zoom: 6,
    zoomControl: false,
    attributionControl: true
  });

  var tileLayer = null;
  var currentTileUrl = null;
  var markersLayer = L.layerGroup().addTo(map);
  var circlesLayer = L.layerGroup().addTo(map);
  var pulseLayer = L.layerGroup().addTo(map);
  var hazardsLayer = L.layerGroup().addTo(map); var vesselsLayer = L.layerGroup().addTo(map);
  var userDotMarker = null;
  var meSelfMarker = null;
  var meSelfAnimFrame = null;
  var userPositions = {};
  var speedProfileUserPositions = [];

  /* Spiderfier: apre a ventaglio i marker biker sovrapposti.
     nearbyDistance allineato alla dimensione effettiva delle icone (30px ~
     soglia 34px) — con 22px i marker visivamente sovrapposti potevano avere
     centri >22px e OMS non li considerava "vicini" (vedi Task #1077). */
  var oms = null;
  var omsLoadError = null;
  if (typeof OverlappingMarkerSpiderfier === "function") {
    try {
      oms = new OverlappingMarkerSpiderfier(map, {
        keepSpiderfied: true,
        nearbyDistance: 44,
        circleSpiralSwitchover: 9,
        legWeight: 1.5
      });
      if (oms.legColors) {
        oms.legColors.usual = "#FF6600";
        oms.legColors.highlighted = "#FF8800";
      }
      oms.addListener("click", function(marker) {
        var d = marker.bikerlinkData;
        if (d) postMsg({ type: "markerPress", markerType: d.type, id: d.id });
      });
      oms.addListener("spiderfy", function(markers) {
        markers.forEach(function(marker) {
          if (marker._icon) marker._icon.classList.add("spiderified");
        });
      });
      oms.addListener("unspiderfy", function(markers) {
        markers.forEach(function(marker) {
          if (marker._icon) marker._icon.classList.remove("spiderified");
        });
      });
    } catch(e) {
      oms = null;
      omsLoadError = "init_failed:" + (e && e.message ? e.message : "unknown");
    }
  } else {
    omsLoadError = "constructor_undefined";
  }

  postMsg({
    type: "omsStatus",
    omsReady: oms !== null,
    nearbyDistance: oms ? 44 : null,
    error: omsLoadError
  });

  function updateLegendVisibility() {
    var legendEl = document.getElementById("speed-legend");
    if (!legendEl) return;
    if (speedProfileUserPositions.length === 0) {
      legendEl.classList.remove("visible");
      return;
    }
    var bounds = map.getBounds();
    var anyInView = speedProfileUserPositions.some(function(pos) {
      return bounds.contains([pos.lat, pos.lng]);
    });
    if (anyInView) {
      legendEl.classList.add("visible");
    } else {
      legendEl.classList.remove("visible");
    }
  }

  (function() {
    var legendEl = document.getElementById("speed-legend");
    if (legendEl) {
      legendEl.addEventListener("click", function() {
        legendEl.classList.toggle("collapsed");
      });
    }
  })();

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

  map.on("moveend", function() {
    var c = map.getCenter();
    postMsg({ type: "regionChange", lat: c.lat, lng: c.lng });
    updateLegendVisibility();
    postViewState();
  });

  map.on("zoomend", function() {
    updateLegendVisibility();
    postViewState();
  });

  var SVG = {
    motorbike: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="white"><path d="M19 7c0-1.1-.9-2-2-2h-3l2 4h-4.5L10 7H8c-1.1 0-2 .9-2 2v2H4c-.55 0-1 .45-1 1s.45 1 1 1h2v1c0 2.21 1.79 4 4 4s4-1.79 4-4h2c0 2.21 1.79 4 4 4s4-1.79 4-4V9h-5l-2-2h2zM10 17c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm10 0c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z"/></svg>',
    passenger: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="white"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>',
    couple: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="white"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>',
    wrench: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="white"><path d="M22.7 19l-9.1-9.1c.9-2.3.4-5-1.5-6.9-2-2-5-2.4-7.4-1.3L9 6 6 9 1.6 4.7C.4 7.1.9 10.1 2.9 12.1c1.9 1.9 4.6 2.4 6.9 1.5l9.1 9.1c.4.4 1 .4 1.4 0l2.3-2.3c.5-.4.5-1.1.1-1.4z"/></svg>',
    calendar: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="white"><path d="M17 12h-5v5h5v-5zM16 1v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2h-1V1h-2zm3 18H5V8h14v11z"/></svg>',
    shield: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="white"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 4l5 2.18V11c0 3.5-2.33 6.79-5 7.93C9.33 17.79 7 14.5 7 11V7.18L12 5z"/></svg>',
    egg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="14" height="14" fill="white"><ellipse cx="12" cy="13" rx="7" ry="9"/></svg>',
    warning: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="white"><path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/></svg>'
  };

  function escapeHtml(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function iconBadge(bg, svgStr, size) {
    size = size || 30;
    var half = size / 2;
    return (
      "<div style=\\"width:" + size + "px;height:" + size + "px;border-radius:" + half + "px;" +
      "background:" + bg + ";border:2px solid rgba(255,255,255,0.9);" +
      "display:flex;align-items:center;justify-content:center;" +
      "box-shadow:0 2px 6px rgba(0,0,0,0.55);\\">" +
      svgStr + "</div>"
    );
  }

  function getUserColor(userType, sex, speedProfile) {
    if (speedProfile === "city")    return "#4A90D9";
    if (speedProfile === "highway") return "#E53935";
    if (speedProfile === "mountain") return "#43A047";
    if (userType === "coppia") return "#FF6600";
    if (sex === "F") return "#E91E8C";
    if (sex === "M") return "#4A90D9";
    if (userType && userType.indexOf("zavorrina") === 0) return "#E91E8C";
    if (userType && userType.indexOf("biker") === 0) return "#4A90D9";
    return "#FF6600";
  }

  var GLOBAL_COUNTRY_CHIPS = {
    IN: { flag: "🇮🇳", name: "India", color: "#FF9933" },
    AU: { flag: "🇦🇺", name: "Australia", color: "#00843D" },
    ID: { flag: "🇮🇩", name: "Indonesia", color: "#E70011" },
    TH: { flag: "🇹🇭", name: "Thailand", color: "#A51931" },
    ZA: { flag: "🇿🇦", name: "South Africa", color: "#007749" },
    NG: { flag: "🇳🇬", name: "Nigeria", color: "#008753" },
    KE: { flag: "🇰🇪", name: "Kenya", color: "#BB0000" }
  };
`;
