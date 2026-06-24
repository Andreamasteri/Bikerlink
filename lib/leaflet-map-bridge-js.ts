import { LEAFLET_MAP_BRIDGE_JS as PART1 } from './leaflet-map-bridge-js.part1';

const BRIDGE_PART2 = `
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
        var dot = "<div style=\\\\\\"width:16px;height:16px;border-radius:8px;background:#2196F3;" +
          "border:3px solid #fff;box-shadow:0 0 10px rgba(33,150,243,0.8);\\\\\\"></div>";
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
        var sosHtml = "<div style=\\\\\\"background:#D32F2F;border-radius:14px;padding:3px 9px;" +
          "border:2px solid #fff;display:flex;align-items:center;gap:4px;" +
          "box-shadow:0 2px 6px rgba(0,0,0,0.55);white-space:nowrap;\\\\\\">" +
          SVG.warning +
          "<span style=\\\\\\"font-size:11px;color:#fff;font-weight:800;\\\\\\">SOS</span></div>";
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
        return "<div style=\\\\\\"margin-top:2px;background:" + bg + ";" +
          "padding:1px 5px;border-radius:7px;font-size:9px;font-weight:800;color:#fff;" +
          "letter-spacing:0.3px;box-shadow:0 1px 3px rgba(0,0,0,0.45);" +
          "border:1px solid rgba(255,255,255,0.85);white-space:nowrap;\\\\\\">" +
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
            ? "<div style=\\\\\\"margin-top:2px;background:#FF6F00;" +
              "padding:1px 6px;border-radius:7px;font-size:9px;font-weight:800;color:#fff;" +
              "letter-spacing:0.3px;box-shadow:0 1px 3px rgba(0,0,0,0.45);" +
              "border:1px solid rgba(255,255,255,0.85);white-space:nowrap;\\\\\\">" +
              "&#128274; Pos. fissa</div>"
            : "";
          var meIconH = state.fixedPositionEnabled ? 78 : 60;
          html = "<div style=\\\\\\"display:flex;flex-direction:column;align-items:center;\\\\\\">" +
            "<div style=\\\\\\"background:" + color + ";padding:2px 6px;border-radius:8px;" +
            "font-size:10px;font-weight:700;color:#fff;margin-bottom:2px;" +
            "box-shadow:0 1px 4px rgba(0,0,0,0.4);border:1.5px solid rgba(255,255,255,0.8)\\\\\\">Tu</div>" +
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
          var truncNick2 = rawNick2.length > 10 ? rawNick2.substring(0, 10) + "\\\\\\\\u2026" : rawNick2;
          var safeNick2 = escapeHtml(truncNick2);
          var labelHtml2 = "<div class=\\\\\\"nick-label\\\\\\" style=\\\\\\"background:" + color + ";padding:2px 6px;border-radius:8px;" +
            "font-size:10px;font-weight:700;color:#fff;margin-bottom:2px;" +
            "box-shadow:0 1px 4px rgba(0,0,0,0.4);border:1.5px solid rgba(255,255,255,0.8);" +
            "white-space:nowrap;max-width:80px;overflow:hidden;text-overflow:ellipsis;" +
            "text-align:center;\\\\\\">" + safeNick2 + "</div>";
          var totalH2 = hasSpeed ? 86 : 68;
          html = "<div style=\\\\\\"display:flex;flex-direction:column;align-items:center;\\\\\\">" +
            labelHtml2 +
            iconBadge(color, svg, 30) +
            "<div style=\\\\\\"margin-top:2px;background:" + globalChip.color + ";" +
            "padding:1px 5px;border-radius:7px;font-size:9px;font-weight:800;color:#fff;" +
            "letter-spacing:0.4px;box-shadow:0 1px 3px rgba(0,0,0,0.45);" +
            "border:1px solid rgba(255,255,255,0.85);white-space:nowrap;\\\\\\">" +
            globalChip.label + "</div>" +
            speedBadge + "</div>";
          addMarker(u.lat, u.lng, html, [90, totalH2], [45, 35], null, omsData);
        } else {
          var rawNick = u.nickname || "";
          var truncNick = rawNick.length > 10 ? rawNick.substring(0, 10) + "\\\\\\\\u2026" : rawNick;
          var safeNick = escapeHtml(truncNick);
          var labelHtml = "<div class=\\\\\\"nick-label\\\\\\" style=\\\\\\"background:" + color + ";padding:2px 6px;border-radius:8px;" +
            "font-size:10px;font-weight:700;color:#fff;margin-bottom:2px;" +
            "box-shadow:0 1px 4px rgba(0,0,0,0.4);border:1.5px solid rgba(255,255,255,0.8);" +
            "white-space:nowrap;max-width:80px;overflow:hidden;text-overflow:ellipsis;" +
            "text-align:center;\\\\\\">" + safeNick + "</div>";
          var totalH = hasSpeed ? 68 : 50;
          html = "<div style=\\\\\\"display:flex;flex-direction:column;align-items:center;\\\\\\">" +
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

      (m.businesses || []).forEach(function(biz) {
        var isDealer = biz.type === "concessionaria";
        var color = isDealer ? "#1565C0" : "#AD1457";
        var svg = isDealer ? SVG.car : SVG.store;
        addMarker(biz.lat, biz.lng, iconBadge(color, svg, 32), [32, 32], [16, 16], function() {
          postMsg({ type: "markerPress", markerType: "business", id: biz.id });
        });
      });

      (m.events || []).forEach(function(ev) {
        addMarker(ev.lat, ev.lng, iconBadge("#F57C00", SVG.calendar, 30), [30, 30], [15, 15], function() {
          postMsg({ type: "markerPress", markerType: "event", id: ev.id });
        });
      });

      (m.clubs || []).forEach(function(club) {
        var color = club.isFictitious ? "#607D8B" : "#00796B";
        var dot = club.isFictitious
          ? "<div style=\\\\\\"position:absolute;top:-4px;right:-4px;width:10px;height:10px;" +
            "border-radius:5px;background:#FF9800;border:1.5px solid #fff;\\\\\\"></div>"
          : "";
        var html = "<div style=\\\\\\"position:relative;width:30px;height:30px;border-radius:15px;" +
          "background:" + color + ";border:2px solid rgba(255,255,255,0.9);" +
          "display:flex;align-items:center;justify-content:center;" +
          "box-shadow:0 2px 6px rgba(0,0,0,0.55);\\\\\\">" + SVG.shield + dot + "</div>";
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
        var realHtml = "<div style=\\\\\\"display:flex;flex-direction:column;align-items:center;\\\\\\">" +
          "<div style=\\\\\\"background:#2E7D32;padding:2px 7px;border-radius:8px;font-size:10px;" +
          "font-weight:700;color:#fff;margin-bottom:3px;border:1.5px solid rgba(255,255,255,0.8);" +
          "box-shadow:0 1px 4px rgba(0,0,0,0.4)\\\\\\">RealMe</div>" +
          "<div style=\\\\\\"width:10px;height:10px;border-radius:5px;background:#2E7D32;" +
          "border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,0.4)\\\\\\"></div></div>";
        addMarker(m.realMe.lat, m.realMe.lng, realHtml, [58, 30], [29, 30], null);
      }

      if (m.fakeMe) {
        var fakeHtml = "<div style=\\\\\\"display:flex;flex-direction:column;align-items:center;\\\\\\">" +
          "<div style=\\\\\\"background:#BF360C;padding:2px 7px;border-radius:8px;font-size:10px;" +
          "font-weight:700;color:#fff;margin-bottom:3px;border:1.5px solid rgba(255,255,255,0.8);" +
          "box-shadow:0 1px 4px rgba(0,0,0,0.4)\\\\\\">FakeMe</div>" +
          "<div style=\\\\\\"width:10px;height:10px;border-radius:5px;background:#BF360C;" +
          "border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,0.4)\\\\\\"></div></div>";
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
        "<div style=\\\\\\"position:relative;width:44px;height:44px;\\\\\\">" +
        "<div class=\\\\\\"bl-pulse-ring\\\\\\" style=\\\\\\"position:absolute;top:0;left:0;\\\\\\"></div>" +
        "<div class=\\\\\\"bl-pulse-ring-2\\\\\\" style=\\\\\\"position:absolute;top:0;left:0;\\\\\\"></div>" +
        "<div class=\\\\\\"bl-pulse-ring-3\\\\\\" style=\\\\\\"position:absolute;top:0;left:0;\\\\\\"></div>" +
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

export const LEAFLET_MAP_BRIDGE_JS = PART1 + BRIDGE_PART2;
