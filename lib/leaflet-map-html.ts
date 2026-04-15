export const LEAFLET_MAP_HTML = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"/>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
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
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
(function() {
  function postMsg(data) {
    try {
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify(data));
      }
    } catch(e) {}
  }

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
  var userDotMarker = null;

  map.on("moveend", function() {
    var c = map.getCenter();
    postMsg({ type: "regionChange", lat: c.lat, lng: c.lng });
  });

  /* ── SVG icons ────────────────────────────────────────────────────── */
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

  function getUserColor(userType, sex) {
    if (userType === "coppia") return "#FF6600";
    if (sex === "F") return "#E91E8C";
    if (sex === "M") return "#4A90D9";
    if (userType && userType.indexOf("zavorrina") === 0) return "#E91E8C";
    if (userType && userType.indexOf("biker") === 0) return "#4A90D9";
    return "#FF6600";
  }

  function getUserSvg(userType, sex) {
    if (userType === "coppia") return SVG.couple;
    if (sex === "F") return SVG.passenger;
    return SVG.motorbike;
  }

  function addMarker(lat, lng, html, size, anchor, onClick) {
    var m = L.marker([lat, lng], {
      icon: L.divIcon({ html: html, className: "", iconSize: size, iconAnchor: anchor })
    }).addTo(markersLayer);
    if (onClick) m.on("click", onClick);
    return m;
  }

  /* ── Bridge ───────────────────────────────────────────────────────── */
  window.leafletBridge = {

    updateState: function(json) {
      var state;
      try { state = JSON.parse(json); } catch(e) { return; }

      /* Tile layer */
      if (state.tileUrl && state.tileUrl !== currentTileUrl) {
        if (tileLayer) { map.removeLayer(tileLayer); }
        currentTileUrl = state.tileUrl;
        tileLayer = L.tileLayer(state.tileUrl, {
          maxZoom: state.tileMaxZoom || 19, attribution: ""
        }).addTo(map);
      }

      markersLayer.clearLayers();
      circlesLayer.clearLayers();

      /* GPS blue dot */
      if (userDotMarker) { map.removeLayer(userDotMarker); userDotMarker = null; }
      if (state.userLocation) {
        var dot = "<div style=\\"width:16px;height:16px;border-radius:8px;background:#2196F3;" +
          "border:3px solid #fff;box-shadow:0 0 10px rgba(33,150,243,0.8);\\"></div>";
        userDotMarker = L.marker([state.userLocation.lat, state.userLocation.lng], {
          icon: L.divIcon({ html: dot, className: "", iconSize: [16, 16], iconAnchor: [8, 8] }),
          zIndexOffset: 2000
        }).addTo(map);
      }

      /* Search radius circle */
      if (state.searchRadius) {
        L.circle([state.searchRadius.lat, state.searchRadius.lng], {
          radius: state.searchRadius.km * 1000,
          color: "rgba(255,179,0,0.55)", weight: 2,
          fillColor: "rgba(255,179,0,0.12)", fillOpacity: 0.12
        }).addTo(circlesLayer);
      }

      var m = state.markers || {};

      /* SOS requests */
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

      /* Users */
      (m.users || []).forEach(function(u) {
        var color = getUserColor(u.userType, u.sex);
        var svg = getUserSvg(u.userType, u.sex);
        var html;
        if (u.isCurrentUser) {
          html = "<div style=\\"display:flex;flex-direction:column;align-items:center;\\">" +
            "<div style=\\"background:" + color + ";padding:2px 6px;border-radius:8px;" +
            "font-size:10px;font-weight:700;color:#fff;margin-bottom:2px;" +
            "box-shadow:0 1px 4px rgba(0,0,0,0.4);border:1.5px solid rgba(255,255,255,0.8)\\">Tu</div>" +
            iconBadge(color, svg, 36) + "</div>";
          addMarker(u.lat, u.lng, html, [52, 60], [26, 60], function() {
            postMsg({ type: "markerPress", markerType: "user", id: u.id });
          });
        } else {
          addMarker(u.lat, u.lng, iconBadge(color, svg, 30), [30, 30], [15, 15], function() {
            postMsg({ type: "markerPress", markerType: "user", id: u.id });
          });
        }
      });

      /* Workshops — wrench icon, orange */
      (m.workshops || []).forEach(function(ws) {
        addMarker(ws.lat, ws.lng, iconBadge("#E65100", SVG.wrench, 30), [30, 30], [15, 15], null);
      });

      /* Events — calendar icon, amber */
      (m.events || []).forEach(function(ev) {
        addMarker(ev.lat, ev.lng, iconBadge("#F57C00", SVG.calendar, 30), [30, 30], [15, 15], function() {
          postMsg({ type: "markerPress", markerType: "event", id: ev.id });
        });
      });

      /* Clubs — shield icon, teal/grey */
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

      /* Easter eggs — gold */
      (m.easterEggs || []).forEach(function(egg) {
        addMarker(egg.lat, egg.lng, iconBadge("#F9A825", SVG.egg, 28), [28, 28], [14, 14], function() {
          postMsg({ type: "markerPress", markerType: "egg", id: egg.id });
        });
      });

      /* RealMe */
      if (m.realMe) {
        var realHtml = "<div style=\\"display:flex;flex-direction:column;align-items:center;\\">" +
          "<div style=\\"background:#2E7D32;padding:2px 7px;border-radius:8px;font-size:10px;" +
          "font-weight:700;color:#fff;margin-bottom:3px;border:1.5px solid rgba(255,255,255,0.8);" +
          "box-shadow:0 1px 4px rgba(0,0,0,0.4)\\">RealMe</div>" +
          "<div style=\\"width:10px;height:10px;border-radius:5px;background:#2E7D32;" +
          "border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,0.4)\\"></div></div>";
        addMarker(m.realMe.lat, m.realMe.lng, realHtml, [58, 30], [29, 30], null);
      }

      /* FakeMe */
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

    centerOnUser: function(lat, lng) {
      var z = map.getZoom();
      map.setView([lat, lng], z < 13 ? 13 : z, { animate: true });
    }
  };

  postMsg({ type: "mapReady" });
})();
</script>
</body>
</html>`;
