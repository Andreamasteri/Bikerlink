import React, { useRef, useCallback, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { WebView } from "react-native-webview";
import { useQuery } from "@tanstack/react-query";
import { getApiUrl } from "@/lib/query-client";
import Colors from "@/constants/colors";
import { Ionicons } from "@expo/vector-icons";

interface RiderPosition {
  userId: string;
  nickname: string | null;
  lat: number;
  lng: number;
  isMoving: boolean;
  currentSpeedKph: number | null;
  speedProfile: "city" | "highway" | "mountain" | null;
}

interface RiderSpeed {
  userId: string;
  currentSpeedKph: number;
  speedProfile: "city" | "highway" | "mountain";
}

interface MotionStatus {
  enabled: boolean;
  totalFakeUsers: number;
  movingNow: number;
  restingNow: number;
  lastCycleAt: string | null;
  totalCycles: number;
  speedDistribution?: { city: number; highway: number; mountain: number };
  averageSpeedKph?: number;
  convoiRiders?: number;
}

interface StregattaMapProps {
  motionStatus: MotionStatus | null;
  onToggleMotion: (val: boolean) => void;
  isTogglingMotion: boolean;
  allEnabled: boolean;
}

const MAP_HTML = `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body, #map { width: 100%; height: 100%; background: #12121f; }
    .leaflet-container { background: #12121f; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    var map = L.map('map', {
      zoomControl: true,
      attributionControl: false
    }).setView([42.5, 12.5], 6);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      subdomains: 'abcd',
      maxZoom: 19
    }).addTo(map);

    /* markerMap: userId -> { circle, isMoving, speedProfile, nickname } */
    var markerMap = {};

    /* Speed-profile colour map */
    function profileColor(profile) {
      if (profile === 'city')     return { fill: '#4A90D9', stroke: '#82B4E8' };
      if (profile === 'highway')  return { fill: '#E53935', stroke: '#F08080' };
      if (profile === 'mountain') return { fill: '#43A047', stroke: '#80C883' };
      return { fill: '#5A5A7A', stroke: '#7070A0' };
    }

    function profileLabel(profile) {
      if (profile === 'city')     return '\\uD83C\\uDFD9 Città';
      if (profile === 'highway')  return '\\uD83D\\uDEE3 Autostrada';
      if (profile === 'mountain') return '\\u26F0 Montagna';
      return 'Fermo';
    }

    /* Full markers rebuild — called on initial load and when positions change */
    function updateMarkers(positions) {
      /* Remove old markers */
      Object.values(markerMap).forEach(function(entry) {
        map.removeLayer(entry.circle);
      });
      markerMap = {};

      if (!positions || positions.length === 0) return;

      positions.forEach(function(p) {
        if (p.lat == null || p.lng == null) return;
        var moving = p.isMoving;
        var col = moving ? profileColor(p.speedProfile) : { fill: '#5A5A7A', stroke: '#7070A0' };
        var circle = L.circleMarker([p.lat, p.lng], {
          radius: moving ? 6 : 4,
          fillColor: col.fill,
          color: col.stroke,
          weight: 1,
          opacity: 0.9,
          fillOpacity: moving ? 0.9 : 0.6
        }).addTo(map);

        if (moving && p.currentSpeedKph != null) {
          var nick = (p.nickname && p.nickname.trim()) ? p.nickname : null;
          var label = (nick ? nick + ' · ' : '') + profileLabel(p.speedProfile) + ' · ' + p.currentSpeedKph + ' km/h';
          circle.bindTooltip(label, { permanent: false, direction: 'top' });
          circle.on('click', function() { this.openTooltip(); });
        }

        markerMap[p.userId] = { circle: circle, isMoving: moving, speedProfile: p.speedProfile, nickname: p.nickname || null };
      });
    }

    /*
     * Lightweight speed-only update — called every 30 s.
     * Updates marker colour and tooltip in-place without touching positions.
     * speeds: Array<{ userId, currentSpeedKph, speedProfile }>
     */
    function updateSpeeds(speeds) {
      if (!speeds || speeds.length === 0) return;

      /* Build a lookup for quick access */
      var lookup = {};
      speeds.forEach(function(s) { lookup[s.userId] = s; });

      Object.keys(markerMap).forEach(function(uid) {
        var entry = markerMap[uid];
        var s = lookup[uid];

        if (s) {
          /* User is now moving — update colour and tooltip */
          var col = profileColor(s.speedProfile);
          entry.circle.setStyle({
            radius: 6,
            fillColor: col.fill,
            color: col.stroke,
            fillOpacity: 0.9
          });
          var nick = (entry.nickname && entry.nickname.trim()) ? entry.nickname : null;
          var label = (nick ? nick + ' · ' : '') + profileLabel(s.speedProfile) + ' · ' + s.currentSpeedKph + ' km/h';
          entry.circle.unbindTooltip();
          entry.circle.bindTooltip(label, { permanent: false, direction: 'top' });
          entry.circle.on('click', function() { this.openTooltip(); });
          entry.isMoving = true;
          entry.speedProfile = s.speedProfile;
        } else if (entry.isMoving) {
          /* User was moving but is now resting — dim the marker */
          entry.circle.setStyle({
            radius: 4,
            fillColor: '#5A5A7A',
            color: '#7070A0',
            fillOpacity: 0.6
          });
          entry.circle.unbindTooltip();
          entry.isMoving = false;
          entry.speedProfile = null;
        }
      });
    }

    window.updateMarkers = updateMarkers;
    window.updateSpeeds  = updateSpeeds;
    window.initMap = updateMarkers;
  </script>
</body>
</html>`;

export function StregattaMap({
  motionStatus,
  onToggleMotion,
  isTogglingMotion,
  allEnabled
}: StregattaMapProps) {
  const webViewRef = useRef<WebView>(null);
  const mapReadyRef = useRef(false);
  const pendingPositionsRef = useRef<RiderPosition[] | null>(null);

  const { data: positions, isLoading, refetch, dataUpdatedAt } = useQuery<RiderPosition[]>({
    queryKey: ["/api/admin/stregatti/motion/positions"],
    queryFn: async () => {
      const url = new URL("/api/admin/stregatti/motion/positions", getApiUrl());
      const res = await fetch(url.toString(), { credentials: "include" });
      if (!res.ok) throw new Error("Errore caricamento posizioni");
      return res.json();
    },
    refetchInterval: 30_000,
    staleTime: 25_000
  });

  const { data: speeds, dataUpdatedAt: speedsUpdatedAt } = useQuery<RiderSpeed[]>({
    queryKey: ["/api/admin/stregatti/motion/speeds"],
    queryFn: async () => {
      const url = new URL("/api/admin/stregatti/motion/speeds", getApiUrl());
      const res = await fetch(url.toString(), { credentials: "include" });
      if (!res.ok) throw new Error("Errore caricamento velocità");
      return res.json();
    },
    refetchInterval: 30_000,
    staleTime: 25_000,
    enabled: motionStatus?.enabled ?? false
  });

  const injectPositions = useCallback((pos: RiderPosition[]) => {
    if (!webViewRef.current) return;
    const js = `window.updateMarkers(${JSON.stringify(pos)}); true;`;
    webViewRef.current.injectJavaScript(js);
  }, []);

  const injectSpeeds = useCallback((sp: RiderSpeed[]) => {
    if (!webViewRef.current) return;
    const js = `window.updateSpeeds(${JSON.stringify(sp)}); true;`;
    webViewRef.current.injectJavaScript(js);
  }, []);

  useEffect(() => {
    if (!positions) return;
    if (mapReadyRef.current) {
      injectPositions(positions);
    } else {
      pendingPositionsRef.current = positions;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataUpdatedAt]);

  useEffect(() => {
    if (!speeds || !mapReadyRef.current) return;
    injectSpeeds(speeds);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speedsUpdatedAt]);

  const handleMapLoad = useCallback(() => {
    mapReadyRef.current = true;
    const toInject = pendingPositionsRef.current ?? positions ?? [];
    pendingPositionsRef.current = null;
    injectPositions(toInject);
  }, [positions, injectPositions]);

  const movingNow = motionStatus?.movingNow ?? 0;
  const restingNow = motionStatus?.restingNow ?? 0;
  // Cascade: activity is forced OFF and locked while global visibility is OFF.
  const motionEnabled = allEnabled && (motionStatus?.enabled ?? false);
  const controlLocked = !allEnabled;

  const formatLastCycle = (iso: string | null): string => {
    if (!iso) return "—";
    const d = new Date(iso);
    return d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  };

  return (
    <View style={styles.container}>
      <View style={styles.statsBar}>
        <View style={styles.statItem}>
          <View style={[styles.dot, { backgroundColor: "#4A90D9" }]} />
          <Text style={styles.statText}>{movingNow} in moto</Text>
        </View>
        <View style={styles.statItem}>
          <View style={[styles.dot, { backgroundColor: "#5A5A7A" }]} />
          <Text style={styles.statText}>{restingNow} fermi</Text>
        </View>
        {motionEnabled && (motionStatus?.convoiRiders ?? 0) > 0 && (
          <View style={styles.statItem}>
            <Ionicons name="people" size={13} color="#FF6B35" />
            <Text style={[styles.statText, { color: "#FF6B35" }]}>{motionStatus!.convoiRiders} comitiva</Text>
          </View>
        )}
        {motionEnabled && motionStatus?.averageSpeedKph != null && motionStatus.averageSpeedKph > 0 && (
          <View style={styles.statItem}>
            <Ionicons name="speedometer-outline" size={13} color={Colors.textSecondary} />
            <Text style={styles.statText}>{motionStatus.averageSpeedKph} km/h</Text>
          </View>
        )}
        <TouchableOpacity style={styles.refreshBtn} onPress={() => refetch()}>
          {isLoading ? (
            <ActivityIndicator size="small" color={Colors.accent} />
          ) : (
            <Ionicons name="refresh" size={16} color={Colors.accent} />
          )}
        </TouchableOpacity>
      </View>
      {motionEnabled && motionStatus?.speedDistribution && movingNow > 0 && (
        <View style={styles.profileBar}>
          <View style={[styles.profileChip, { backgroundColor: "#4A90D9" }]}>
            <Text style={styles.profileChipText}>🏙 {motionStatus.speedDistribution.city}</Text>
          </View>
          <View style={[styles.profileChip, { backgroundColor: "#E53935" }]}>
            <Text style={styles.profileChipText}>🛣 {motionStatus.speedDistribution.highway}</Text>
          </View>
          <View style={[styles.profileChip, { backgroundColor: "#43A047" }]}>
            <Text style={styles.profileChipText}>⛰ {motionStatus.speedDistribution.mountain}</Text>
          </View>
          <Text style={styles.profileBarHint}>· tap marker per velocità</Text>
        </View>
      )}

      <View style={styles.mapWrapper}>
        <WebView
          ref={webViewRef}
          source={{ html: MAP_HTML }}
          style={styles.webView}
          onLoad={handleMapLoad}
          javaScriptEnabled
          domStorageEnabled
          originWhitelist={["*"]}
          scrollEnabled={false}
          bounces={false}
        />
      </View>

      <View style={styles.controlBar}>
        <View style={styles.controlLeft}>
          <Ionicons
            name="navigate"
            size={16}
            color={motionEnabled ? "#FF6B35" : Colors.textSecondary}
          />
          <Text style={[styles.controlLabel, motionEnabled && { color: "#FF6B35" }]}>
            {controlLocked ? "Visibilità Globale OFF" : motionEnabled ? "Simulatore attivo" : "Simulatore in pausa"}
          </Text>
          {!controlLocked && motionStatus?.lastCycleAt && (
            <Text style={styles.cycleText}>
              · ciclo {formatLastCycle(motionStatus.lastCycleAt)}
            </Text>
          )}
        </View>
        <TouchableOpacity
          style={[styles.toggleBtn, motionEnabled ? styles.toggleBtnOn : styles.toggleBtnOff, controlLocked && styles.toggleBtnDisabled]}
          onPress={() => onToggleMotion(!motionEnabled)}
          disabled={isTogglingMotion || controlLocked}
        >
          {isTogglingMotion ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.toggleBtnText}>
              {motionEnabled ? "Pausa" : "Avvia"}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background
  },
  statsBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: 12
  },
  statItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4
  },
  statText: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    color: Colors.textSecondary
  },
  refreshBtn: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- "auto" margin not in RN types
    marginLeft: "auto" as any,
    padding: 4
  },
  profileBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 6,
    backgroundColor: Colors.background,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: 8
  },
  profileChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8
  },
  profileChipText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    color: "#fff"
  },
  profileBarHint: {
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    color: Colors.textSecondary,
    marginLeft: 4
  },
  mapWrapper: {
    flex: 1
  },
  webView: {
    flex: 1,
    backgroundColor: "#12121f"
  },
  controlBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderTopColor: Colors.border
  },
  controlLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flex: 1
  },
  controlLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    color: Colors.textSecondary
  },
  cycleText: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: Colors.textSecondary
  },
  toggleBtn: {
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 20,
    minWidth: 72,
    alignItems: "center"
  },
  toggleBtnOn: {
    backgroundColor: "#5A5A7A"
  },
  toggleBtnOff: {
    backgroundColor: "#FF6B35"
  },
  toggleBtnDisabled: {
    backgroundColor: "#3A3A4A",
    opacity: 0.5
  },
  toggleBtnText: {
    fontFamily: "Inter_700Bold",
    fontSize: 13,
    color: "#fff"
  }
});
