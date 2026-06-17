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

  function getGlobalCountryChip(country) {
    if (!country) return null;
    var code = String(country).toUpperCase();
    var c = GLOBAL_COUNTRY_CHIPS[code];
    if (!c) return null;
    return { label: c.flag + " " + c.name, color: c.color };
  }

  function getUserSvg(userType, sex) {
    if (userType === "coppia") return SVG.couple;
    if (sex === "F") return SVG.passenger;
    return SVG.motorbike;
  }

  function addMarker(lat, lng, html, size, anchor, onClick, omsData) {
    var m = L.marker([lat, lng], {
      icon: L.divIcon({ html: html, className: "", iconSize: size, iconAnchor: anchor })
    }).addTo(markersLayer);
    if (omsData && omsData.nickname) {
      m.bindTooltip(escapeHtml(omsData.nickname), {
        permanent: false,
        direction: "top",
        offset: [0, -18],
        className: "nick-tooltip"
      });
    }
    if (omsData && oms) {
      m.bikerlinkData = omsData;
      try {
        oms.addMarker(m);
      } catch(e) {
        m.on("click", function() {
          postMsg({ type: "markerPress", markerType: omsData.type, id: omsData.id });
        });
      }
    } else if (omsData && !oms) {
      m.on("click", function() {
        postMsg({ type: "markerPress", markerType: omsData.type, id: omsData.id });
      });
    } else if (onClick) {
      m.on("click", onClick);
    }
    return m;
  }

  function clearAllMarkers() {
    if (oms) {
      try { oms.clearMarkers(); } catch(e) {}
    }
    markersLayer.clearLayers();
  }

  var ME_ANIM_MS = 300;
  function animateMeMarkerTo(toLat, toLng) {
    if (!meSelfMarker) return;
    if (meSelfAnimFrame) { cancelAnimationFrame(meSelfAnimFrame); meSelfAnimFrame = null; }
    var from = meSelfMarker.getLatLng();
    var fromLat = from.lat;
    var fromLng = from.lng;
    if (fromLat === toLat && fromLng === toLng) return;
    var startTime = null;
    function step(ts) {
      if (!startTime) startTime = ts;
      var t = Math.min((ts - startTime) / ME_ANIM_MS, 1);
      var ease = 1 - Math.pow(1 - t, 3);
      meSelfMarker.setLatLng([fromLat + (toLat - fromLat) * ease, fromLng + (toLng - fromLng) * ease]);
      if (t < 1) {
        meSelfAnimFrame = requestAnimationFrame(step);
      } else {
        meSelfAnimFrame = null;
      }
    }
    meSelfAnimFrame = requestAnimationFrame(step);
  }

  window.leafletBridge = {

    updateState: function(json) {
      var state;
      try { state = JSON.parse(json); } catch(e) { return; }

      if (state.tileUrl && state.tileUrl !== currentTileUrl) {
        if (tileLayer) { map.removeLayer(tileLayer); }
        currentTileUrl = state.tileUrl;
        tileLayer = L.tileLayer(state.tileUrl, {
          maxZoom: state.tileMaxZoom || 19, attribution: ""
        }).addTo(map);
      }

      clearAllMarkers();
      circlesLayer.clearLayers();
      userPositions = {};

      if (userDotMarker) { map.removeLayer(userDotMarker); userDotMarker = null; }
      if (state.userLocation) {
        var dot = "<div style=\\"width:16px;height:16px;border-radius:8px;background:#2196F3;" +
          "border:3px solid #fff;box-shadow:0 0 10px rgba(33,150,243,0.8);\\"></div>";
        userDotMarker = L.marker([state.userLocation.lat, state.userLocation.lng], {
          icon: L.divIcon({ html: dot, className: "", iconSize: [16, 16], iconAnchor: [8, 8] }),
          zIndexOffset: 2000
        }).addTo(map);
      }

      if (state.searchRadius) {
        L.circle([state.searchRadius.lat, state.searchRadius.lng], {
          radius: state.searchRadius.km * 1000,
          color: "rgba(255,179,0,0.55)", weight: 2,
          fillColor: "rgba(255,179,0,0.12)", fillOpacity: 0.12
        }).addTo(circlesLayer);
      }

      var m = state.markers || {};

      (m.sos || []).forEach(function(sos) {
        L.circle([sos.lat, sos.lng], {
          radius: (sos.radiusKm || 10) * 1000,
          color: "#FF0000", weight: 4,
          fillColor: "rgba(255,0,0,0.28)", fillOpacity: 0.28
        }).addTo(circlesLayer);
        var sosHtml = "<div style=\\"background:#D32F2F;border-radius:14px;padding:3px 9px;" +
          "border:2px solid #fff;display:flex;align-items:center;gap:4px;" +
          "box-shadow:0 2px 6px rgba(0,0,0,0.55);white-space:nowrap;\\">" +
          SVG.warning +
          "<span style=\\"font-size:11px;color:#fff;font-weight:800;\\">SOS</span></div>";
        addMarker(sos.lat, sos.lng, sosHtml, [80, 24], [40, 24], null);
      });

      function getSpeedBadgeHtml(speedProfile, speedKph) {
        if (!speedProfile || speedKph == null) return "";
        var label = speedProfile === "city" ? "🏙 " + speedKph + " km/h"
          : speedProfile === "highway" ? "🛣 " + speedKph + " km/h"
          : "⛰ " + speedKph + " km/h";
        var bg = speedProfile === "city" ? "#4A90D9"
          : speedProfile === "highway" ? "#E53935"
          : "#43A047";
        return "<div style=\\"margin-top:2px;background:" + bg + ";" +
          "padding:1px 5px;border-radius:7px;font-size:9px;font-weight:800;color:#fff;" +
          "letter-spacing:0.3px;box-shadow:0 1px 3px rgba(0,0,0,0.45);" +
          "border:1px solid rgba(255,255,255,0.85);white-space:nowrap;\\">" +
          label + "</div>";
      }

      var meSelfSeen = false;
      (m.users || []).forEach(function(u) {
        userPositions[u.id] = { lat: u.lat, lng: u.lng };
        var color = getUserColor(u.userType, u.sex, u.speedProfile);
        var svg = getUserSvg(u.userType, u.sex);
        var omsData = { type: "user", id: u.id, nickname: u.nickname || "" };
        var globalChip = getGlobalCountryChip(u.country);
        var speedBadge = getSpeedBadgeHtml(u.speedProfile, u.currentSpeedKph);
        var hasSpeed = !!speedBadge;
        var html;
        if (u.isCurrentUser) {
          meSelfSeen = true;
          var lockBadge = state.fixedPositionEnabled
            ? "<div style=\\"margin-top:2px;background:#FF6F00;" +
              "padding:1px 6px;border-radius:7px;font-size:9px;font-weight:800;color:#fff;" +
              "letter-spacing:0.3px;box-shadow:0 1px 3px rgba(0,0,0,0.45);" +
              "border:1px solid rgba(255,255,255,0.85);white-space:nowrap;\\">" +
              "&#128274; Pos. fissa</div>"
            : "";
          var meIconH = state.fixedPositionEnabled ? 78 : 60;
          html = "<div style=\\"display:flex;flex-direction:column;align-items:center;\\">" +
            "<div style=\\"background:" + color + ";padding:2px 6px;border-radius:8px;" +
            "font-size:10px;font-weight:700;color:#fff;margin-bottom:2px;" +
            "box-shadow:0 1px 4px rgba(0,0,0,0.4);border:1.5px solid rgba(255,255,255,0.8)\\">Tu</div>" +
            iconBadge(color, svg, 36) + lockBadge + "</div>";
          var meIcon = L.divIcon({ html: html, className: "", iconSize: [52, meIconH], iconAnchor: [26, meIconH] });
          if (!meSelfMarker) {
            meSelfMarker = L.marker([u.lat, u.lng], { icon: meIcon, zIndexOffset: 2500, interactive: true }).addTo(map);
            meSelfMarker.on("click", (function(uid) {
              return function() { postMsg({ type: "markerPress", markerType: "user", id: uid }); };
            })(u.id));
          } else {
            meSelfMarker.setIcon(meIcon);
            animateMeMarkerTo(u.lat, u.lng);
          }
        } else if (globalChip) {
          var rawNick2 = u.nickname || "";
          var truncNick2 = rawNick2.length > 10 ? rawNick2.substring(0, 10) + "\\u2026" : rawNick2;
          var safeNick2 = escapeHtml(truncNick2);
          var labelHtml2 = "<div class=\\"nick-label\\" style=\\"background:" + color + ";padding:2px 6px;border-radius:8px;" +
            "font-size:10px;font-weight:700;color:#fff;margin-bottom:2px;" +
            "box-shadow:0 1px 4px rgba(0,0,0,0.4);border:1.5px solid rgba(255,255,255,0.8);" +
            "white-space:nowrap;max-width:80px;overflow:hidden;text-overflow:ellipsis;" +
            "text-align:center;\\">" + safeNick2 + "</div>";
          var totalH2 = hasSpeed ? 86 : 68;
          html = "<div style=\\"display:flex;flex-direction:column;align-items:center;\\">" +
            labelHtml2 +
            iconBadge(color, svg, 30) +
            "<div style=\\"margin-top:2px;background:" + globalChip.color + ";" +
            "padding:1px 5px;border-radius:7px;font-size:9px;font-weight:800;color:#fff;" +
            "letter-spacing:0.4px;box-shadow:0 1px 3px rgba(0,0,0,0.45);" +
            "border:1px solid rgba(255,255,255,0.85);white-space:nowrap;\\">" +
            globalChip.label + "</div>" +
            speedBadge + "</div>";
          addMarker(u.lat, u.lng, html, [90, totalH2], [45, 35], null, omsData);
        } else {
          var rawNick = u.nickname || "";
          var truncNick = rawNick.length > 10 ? rawNick.substring(0, 10) + "\\u2026" : rawNick;
          var safeNick = escapeHtml(truncNick);
          var labelHtml = "<div class=\\"nick-label\\" style=\\"background:" + color + ";padding:2px 6px;border-radius:8px;" +
            "font-size:10px;font-weight:700;color:#fff;margin-bottom:2px;" +
            "box-shadow:0 1px 4px rgba(0,0,0,0.4);border:1.5px solid rgba(255,255,255,0.8);" +
            "white-space:nowrap;max-width:80px;overflow:hidden;text-overflow:ellipsis;" +
            "text-align:center;\\">" + safeNick + "</div>";
          var totalH = hasSpeed ? 68 : 50;
          html = "<div style=\\"display:flex;flex-direction:column;align-items:center;\\">" +
            labelHtml + iconBadge(color, svg, 30) + speedBadge + "</div>";
          addMarker(u.lat, u.lng, html, [90, totalH], [45, 35], null, omsData);
        }
      });

      if (!meSelfSeen && meSelfMarker) {
        if (meSelfAnimFrame) { cancelAnimationFrame(meSelfAnimFrame); meSelfAnimFrame = null; }
        map.removeLayer(meSelfMarker);
        meSelfMarker = null;
      }

      speedProfileUserPositions = (m.users || [])
        .filter(function(u) { return !!u.speedProfile; })
        .map(function(u) { return { lat: u.lat, lng: u.lng }; });
      updateLegendVisibility();

      (m.workshops || []).forEach(function(ws) {
        addMarker(ws.lat, ws.lng, iconBadge("#E65100", SVG.wrench, 30), [30, 30], [15, 15], null);
      });

      (m.events || []).forEach(function(ev) {
        addMarker(ev.lat, ev.lng, iconBadge("#F57C00", SVG.calendar, 30), [30, 30], [15, 15], function() {
          postMsg({ type: "markerPress", markerType: "event", id: ev.id });
        });
      });

      (m.clubs || []).forEach(function(club) {
        var color = club.isFictitious ? "#607D8B" : "#00796B";
        var dot = club.isFictitious
          ? "<div style=\\"position:absolute;top:-4px;right:-4px;width:10px;height:10px;" +
            "border-radius:5px;background:#FF9800;border:1.5px solid #fff;\\"></div>"
          : "";
        var html = "<div style=\\"position:relative;width:30px;height:30px;border-radius:15px;" +
          "background:" + color + ";border:2px solid rgba(255,255,255,0.9);" +
          "display:flex;align-items:center;justify-content:center;" +
          "box-shadow:0 2px 6px rgba(0,0,0,0.55);\\">" + SVG.shield + dot + "</div>";
        addMarker(club.lat, club.lng, html, [30, 30], [15, 15], function() {
          postMsg({ type: "markerPress", markerType: "club", id: club.id });
        });
      });

      (m.easterEggs || []).forEach(function(egg) {
        addMarker(egg.lat, egg.lng, iconBadge("#F9A825", SVG.egg, 28), [28, 28], [14, 14], function() {
          postMsg({ type: "markerPress", markerType: "egg", id: egg.id });
        });
      });

      if (m.realMe) {
        var realHtml = "<div style=\\"display:flex;flex-direction:column;align-items:center;\\">" +
          "<div style=\\"background:#2E7D32;padding:2px 7px;border-radius:8px;font-size:10px;" +
          "font-weight:700;color:#fff;margin-bottom:3px;border:1.5px solid rgba(255,255,255,0.8);" +
          "box-shadow:0 1px 4px rgba(0,0,0,0.4)\\">RealMe</div>" +
          "<div style=\\"width:10px;height:10px;border-radius:5px;background:#2E7D32;" +
          "border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,0.4)\\"></div></div>";
        addMarker(m.realMe.lat, m.realMe.lng, realHtml, [58, 30], [29, 30], null);
      }

      if (m.fakeMe) {
        var fakeHtml = "<div style=\\"display:flex;flex-direction:column;align-items:center;\\">" +
          "<div style=\\"background:#BF360C;padding:2px 7px;border-radius:8px;font-size:10px;" +
          "font-weight:700;color:#fff;margin-bottom:3px;border:1.5px solid rgba(255,255,255,0.8);" +
          "box-shadow:0 1px 4px rgba(0,0,0,0.4)\\">FakeMe</div>" +
          "<div style=\\"width:10px;height:10px;border-radius:5px;background:#BF360C;" +
          "border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,0.4)\\"></div></div>";
        addMarker(m.fakeMe.lat, m.fakeMe.lng, fakeHtml, [58, 30], [29, 30], null);
      }
    },

    focusOn: function(lat, lng, zoom) {
      map.setView([lat, lng], zoom || 14, { animate: true });
    },

    highlightUser: function(userId) {
      var pos = userPositions[userId];
      if (!pos) return;
      pulseLayer.clearLayers();
      var pulseHtml =
        "<div style=\\"position:relative;width:44px;height:44px;\\">" +
        "<div class=\\"bl-pulse-ring\\" style=\\"position:absolute;top:0;left:0;\\"></div>" +
        "<div class=\\"bl-pulse-ring-2\\" style=\\"position:absolute;top:0;left:0;\\"></div>" +
        "<div class=\\"bl-pulse-ring-3\\" style=\\"position:absolute;top:0;left:0;\\"></div>" +
        "</div>";
      var pulseMarker = L.marker([pos.lat, pos.lng], {
        icon: L.divIcon({ html: pulseHtml, className: "", iconSize: [44, 44], iconAnchor: [22, 22] }),
        zIndexOffset: 3000,
        interactive: false
      }).addTo(pulseLayer);
      setTimeout(function() {
        try { pulseLayer.removeLayer(pulseMarker); } catch(e) {}
      }, 1800);
    },

    centerOnUser: function(lat, lng) {
      var z = map.getZoom();
      map.setView([lat, lng], z < 13 ? 13 : z, { animate: true });
    },

    setZoom: function(level) {
      var z = Number(level);
      if (!isFinite(z)) return;
      map.setZoom(z, { animate: false });
    },

    updateHazards: function(jsonStr) {
      hazardsLayer.clearLayers();
      var hazards;
      try { hazards = JSON.parse(jsonStr); } catch(e) { return; }
      if (!Array.isArray(hazards)) return;
      var HAZARD_COLORS = {
        oil: "#FF6F00", gravel: "#795548", animals: "#2E7D32",
        roadwork: "#F57C00", wet: "#1565C0", accident: "#C62828",
        fog: "#546E7A", slowdown: "#6A1B9A"
      };
      hazards.forEach(function(h) {
        var color = HAZARD_COLORS[h.type] || "#FF6F00";
        var icon = L.divIcon({
          className: "",
          html: '<div style="background:' + color + ';width:36px;height:36px;border-radius:18px;border:2.5px solid rgba(255,255,255,0.9);display:flex;align-items:center;justify-content:center;font-size:18px;box-shadow:0 2px 8px rgba(0,0,0,0.5);">' + h.icon + '</div>',
          iconSize: [36, 36],
          iconAnchor: [18, 18],
          popupAnchor: [0, -20]
        });
        var marker = L.marker([h.lat, h.lng], { icon: icon });
        marker.on("click", function() {
          postMsg({ type: "markerPress", markerType: "hazard", id: h.id });
        });
        hazardsLayer.addLayer(marker);
      });
    },

    updateVessels: function(j) {
      var v;
      try { v = JSON.parse(j); } catch(e) { return; }
      if (!Array.isArray(v)) return;
      vesselsLayer.clearLayers();
      v.forEach(function(s) {
        var c = Number(s.cog) || 0;
        var ic = L.divIcon({
          className: "",
          html: '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28"><g transform="rotate(' + c + ' 14 14)"><polygon points="14,3 20,22 14,18 8,22" fill="#0284c7" stroke="#fff" stroke-width="1.5"/></g></svg>',
          iconSize: [28, 28],
          iconAnchor: [14, 14]
        });
        var m = L.marker([s.lat, s.lng], { icon: ic, zIndexOffset: 500 });
        m.on("click", function() {
          postMsg({ type: "markerPress", markerType: "vessel", id: String(s.mmsi) });
        });
        vesselsLayer.addLayer(m);
      });
    },

    invalidateSize: function() { map.invalidateSize({ animate: false }); }
  };

  var NICK_ZOOM_THRESHOLD = 10;
  function updateNickLabels() {
    var mapEl = document.getElementById("map");
    if (!mapEl) return;
    if (map.getZoom() < NICK_ZOOM_THRESHOLD) {
      mapEl.classList.add("labels-hidden");
    } else {
      mapEl.classList.remove("labels-hidden");
    }
  }
  map.on("zoomend", updateNickLabels);
  updateNickLabels();

  postMsg({ type: "mapReady" });
  postViewState();

  } catch(e) {
    postMsg({
      type: "mapInitError",
      error: (e && e.message) ? String(e.message).slice(0, 300) : String(e).slice(0, 300)
    });
  }

})();
`;
