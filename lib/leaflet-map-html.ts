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
.leaflet-control-attribution { font-size: 8px !important; opacity: 0.5; }
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

  function getUserColor(userType, sex) {
    if (userType === "coppia") return "#FF6600";
    if (sex === "F") return "#E91E8C";
    if (sex === "M") return "#4A90D9";
    if (userType && userType.indexOf("zavorrina") === 0) return "#E91E8C";
    if (userType && userType.indexOf("biker") === 0) return "#4A90D9";
    return "#FF6600";
  }

  function pin(bg, size, content, border) {
    border = border || "#fff";
    var s = size || 28;
    var half = s / 2;
    return (
      "<div style=\\"width:" + s + "px;height:" + s + "px;border-radius:" + half + "px;" +
      "background:" + bg + ";border:2px solid " + border + ";" +
      "display:flex;align-items:center;justify-content:center;" +
      "box-shadow:0 2px 4px rgba(0,0,0,0.5);font-size:" + (s * 0.5) + "px;\\">" +
      (content || "") + "</div>"
    );
  }

  function addMarker(lat, lng, html, size, anchor, onClick) {
    var m = L.marker([lat, lng], {
      icon: L.divIcon({
        html: html,
        className: "",
        iconSize: size,
        iconAnchor: anchor
      })
    }).addTo(markersLayer);
    if (onClick) m.on("click", onClick);
    return m;
  }

  window.leafletBridge = {
    updateState: function(json) {
      var state;
      try { state = JSON.parse(json); } catch(e) { return; }

      if (state.tileUrl && state.tileUrl !== currentTileUrl) {
        if (tileLayer) { map.removeLayer(tileLayer); }
        currentTileUrl = state.tileUrl;
        tileLayer = L.tileLayer(state.tileUrl, {
          maxZoom: state.tileMaxZoom || 19,
          attribution: ""
        }).addTo(map);
      }

      markersLayer.clearLayers();
      circlesLayer.clearLayers();

      if (userDotMarker) { map.removeLayer(userDotMarker); userDotMarker = null; }
      if (state.userLocation) {
        var dotHtml = "<div style=\\"width:16px;height:16px;border-radius:8px;background:#2196F3;border:3px solid #fff;box-shadow:0 0 8px rgba(33,150,243,0.7);\\"></div>";
        userDotMarker = L.marker([state.userLocation.lat, state.userLocation.lng], {
          icon: L.divIcon({ html: dotHtml, className: "", iconSize: [16, 16], iconAnchor: [8, 8] }),
          zIndexOffset: 2000
        }).addTo(map);
      }

      if (state.searchRadius) {
        L.circle([state.searchRadius.lat, state.searchRadius.lng], {
          radius: state.searchRadius.km * 1000,
          color: "rgba(255,179,0,0.5)", weight: 2,
          fillColor: "rgba(255,179,0,0.12)", fillOpacity: 0.12
        }).addTo(circlesLayer);
      }

      var m = state.markers || {};

      (m.sos || []).forEach(function(sos) {
        L.circle([sos.lat, sos.lng], {
          radius: (sos.radiusKm || 10) * 1000,
          color: "#FF0000", weight: 4,
          fillColor: "rgba(255,0,0,0.30)", fillOpacity: 0.30
        }).addTo(circlesLayer);
        var sosHtml = "<div style=\\"background:#FF0000;border-radius:14px;padding:2px 7px;border:2px solid #fff;font-size:11px;color:#fff;font-weight:800;white-space:nowrap;box-shadow:0 2px 4px rgba(0,0,0,0.5)\\">! SOS</div>";
        addMarker(sos.lat, sos.lng, sosHtml, [60, 22], [30, 22], null);
      });

      (m.users || []).forEach(function(u) {
        var color = getUserColor(u.userType, u.sex);
        var html;
        if (u.isCurrentUser) {
          html = "<div style=\\"display:flex;flex-direction:column;align-items:center;\\">" +
            "<div style=\\"background:" + color + ";padding:1px 5px;border-radius:6px;font-size:10px;font-weight:700;color:#fff;margin-bottom:2px;box-shadow:0 1px 3px rgba(0,0,0,0.3)\\">Tu</div>" +
            pin(color, 34, "", "#fff") +
            "</div>";
          addMarker(u.lat, u.lng, html, [50, 52], [25, 52], function() {
            postMsg({ type: "markerPress", markerType: "user", id: u.id });
          });
        } else {
          html = pin(color, 28, "", "#fff");
          addMarker(u.lat, u.lng, html, [28, 28], [14, 14], function() {
            postMsg({ type: "markerPress", markerType: "user", id: u.id });
          });
        }
      });

      (m.workshops || []).forEach(function(ws) {
        addMarker(ws.lat, ws.lng, pin("#FF6B00", 28, "", "#fff"), [28, 28], [14, 14], null);
      });

      (m.events || []).forEach(function(ev) {
        var html = "<div style=\\"width:32px;height:32px;border-radius:16px;background:#FF8C00;border:2px solid #fff;display:flex;align-items:center;justify-content:center;font-size:13px;box-shadow:0 2px 4px rgba(0,0,0,0.5)\\">ev</div>";
        addMarker(ev.lat, ev.lng, html, [32, 32], [16, 16], function() {
          postMsg({ type: "markerPress", markerType: "event", id: ev.id });
        });
      });

      (m.clubs || []).forEach(function(club) {
        var color = club.isFictitious ? "#607D8B" : "#009688";
        var dot = club.isFictitious
          ? "<div style=\\"position:absolute;top:-4px;right:-4px;width:10px;height:10px;border-radius:5px;background:#FF9800;border:1.5px solid #fff;\\"></div>"
          : "";
        var html = "<div style=\\"position:relative;width:30px;height:30px;border-radius:15px;background:" + color + ";border:2px solid #fff;display:flex;align-items:center;justify-content:center;font-size:13px;box-shadow:0 2px 4px rgba(0,0,0,0.5)\\">" + dot + "cl</div>";
        addMarker(club.lat, club.lng, html, [30, 30], [15, 15], function() {
          postMsg({ type: "markerPress", markerType: "club", id: club.id });
        });
      });

      (m.easterEggs || []).forEach(function(egg) {
        addMarker(egg.lat, egg.lng, pin("#FFD700", 28, "", "#fff"), [28, 28], [14, 14], function() {
          postMsg({ type: "markerPress", markerType: "egg", id: egg.id });
        });
      });

      if (m.realMe) {
        var realHtml = "<div style=\\"display:flex;flex-direction:column;align-items:center;\\">" +
          "<div style=\\"background:#2E7D32;padding:2px 6px;border-radius:7px;font-size:10px;font-weight:700;color:#fff;margin-bottom:3px;border:1.5px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,0.35)\\">RealMe</div>" +
          "<div style=\\"width:10px;height:10px;border-radius:5px;background:#2E7D32;border:2px solid #fff;\\"></div></div>";
        addMarker(m.realMe.lat, m.realMe.lng, realHtml, [56, 28], [28, 28], null);
      }

      if (m.fakeMe) {
        var fakeHtml = "<div style=\\"display:flex;flex-direction:column;align-items:center;\\">" +
          "<div style=\\"background:#E65100;padding:2px 6px;border-radius:7px;font-size:10px;font-weight:700;color:#fff;margin-bottom:3px;border:1.5px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,0.35)\\">FakeMe</div>" +
          "<div style=\\"width:10px;height:10px;border-radius:5px;background:#E65100;border:2px solid #fff;\\"></div></div>";
        addMarker(m.fakeMe.lat, m.fakeMe.lng, fakeHtml, [56, 28], [28, 28], null);
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
