import React, { useState } from "react";
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from "react-native";
import { MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import Colors from "@/constants/colors";
import { getApiUrl, authFetchHeaders } from "@/lib/query-client";
import type { ValhallaDetailedHealth, NominatimDetailedHealth } from "./ThinkCentreValhallaNominatimBlocks";
import { ErrorHistory, ProbeLog } from "./ThinkCentreCardParts";

export { TelemetryCard } from "./AdminTelemetryCard";

interface GHStatus {
  mode: "self-hosted" | "cloud" | "disabled";
  profile: string;
  healthy: boolean;
  url: string;
}

interface ThinkCentreHealthMinimal {
  valhallaDetail?: ValhallaDetailedHealth;
  nominatimDetail?: NominatimDetailedHealth;
  tokenFingerprints?: {
    graphhopper: string | null;
    valhalla: string | null;
    ollama: string | null;
    whisper: string | null;
    nominatim: string | null;
  };
}

function CollapseChevron({ collapsed }: { collapsed: boolean }) {
  return (
    <Ionicons
      name={collapsed ? "chevron-down" : "chevron-up"}
      size={18}
      color={Colors.textSecondary}
    />
  );
}

const PROFILE_ICONS: Record<string, keyof typeof MaterialCommunityIcons.glyphMap> = {
  motorcycle: "motorbike",
  auto: "car",
  bicycle: "bicycle",
  pedestrian: "walk",
};

const PROFILE_LABELS: Record<string, string> = {
  motorcycle: "Moto",
  auto: "Auto",
  bicycle: "Bici",
  pedestrian: "Pedonale",
};

async function fetchThinkCentreHealth(signal?: AbortSignal): Promise<ThinkCentreHealthMinimal> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  const combined = signal
    ? (AbortSignal.any ? AbortSignal.any([signal, controller.signal]) : controller.signal)
    : controller.signal;
  try {
    const res = await fetch(new URL("/api/admin/thinkcentre-health", getApiUrl()).toString(), {
      headers: { ...(await authFetchHeaders()) },
      credentials: "include",
      signal: combined,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  } finally {
    clearTimeout(timer);
  }
}

export function GraphHopperCard() {
  const { data, isLoading, error } = useQuery<GHStatus>({
    queryKey: ["/api/admin/graphhopper-status"],
    queryFn: async ({ signal }) => {
      const res = await fetch(new URL("/api/admin/graphhopper-status", getApiUrl()).toString(), {
        headers: { ...(await authFetchHeaders()) },
        credentials: "include",
        signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    staleTime: 60_000,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });

  const modeLabel: Record<string, string> = {
    "self-hosted": "Self-Hosted",
    cloud: "Cloud API",
    disabled: "Disabilitato",
  };
  const modeColor: Record<string, string> = {
    "self-hosted": "#22c55e",
    cloud: "#f59e0b",
    disabled: "#ef4444",
  };
  const color = data ? modeColor[data.mode] ?? "#6b7280" : "#6b7280";

  const [collapsed, setCollapsed] = useState(true);

  return (
    <View style={styles.card}>
      <TouchableOpacity
        style={styles.cardHeader}
        onPress={() => setCollapsed((c) => !c)}
        activeOpacity={0.7}
        testID="graphhopper-card-header"
      >
        <MaterialCommunityIcons name="map-marker-path" size={18} color={color} />
        <Text style={styles.cardTitle}>GraphHopper</Text>
        <View style={styles.headerRight}>
          {isLoading && <ActivityIndicator size="small" color={color} />}
          {error && !isLoading && (
            <MaterialCommunityIcons name="alert-circle-outline" size={16} color="#ef4444" />
          )}
          {!isLoading && !error && data && (
            <View style={[styles.healthDot, { backgroundColor: data.healthy ? "#22c55e" : "#ef4444" }]} />
          )}
          <CollapseChevron collapsed={collapsed} />
        </View>
      </TouchableOpacity>
      {!collapsed && (
        <>
          <View style={styles.row}>
            <View style={styles.stat}>
              <Text style={[styles.statValue, { color }]}>{data ? modeLabel[data.mode] ?? data.mode : "—"}</Text>
              <Text style={styles.statLabel}>Modalità</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.stat}>
              <Text style={styles.statValue}>{data ? data.profile : "—"}</Text>
              <Text style={styles.statLabel}>Profilo</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.stat}>
              <Text style={[styles.statValue, { color: data ? (data.healthy ? "#22c55e" : "#ef4444") : Colors.textSecondary }]}>
                {data ? (data.healthy ? "OK" : "Errore") : "—"}
              </Text>
              <Text style={styles.statLabel}>Health</Text>
            </View>
          </View>
          {!isLoading && !error && data?.mode === "cloud" && (
            <View style={styles.warningBanner}>
              <MaterialCommunityIcons name="alert-outline" size={13} color="#f59e0b" />
              <Text style={styles.warningText}>Profilo motorcycle non disponibile su Cloud. Usando 'car'.</Text>
            </View>
          )}
        </>
      )}
    </View>
  );
}

export function ValhallaCard() {
  const [collapsed, setCollapsed] = useState(true);

  const { data, isLoading, error } = useQuery<ThinkCentreHealthMinimal>({
    queryKey: ["/api/admin/thinkcentre-health"],
    queryFn: ({ signal }) => fetchThinkCentreHealth(signal),
    refetchInterval: 30_000,
    staleTime: 20_000,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });

  const detail = error ? null : (data?.valhallaDetail ?? null);

  const statusColor = detail == null
    ? (error ? "#ef4444" : "#6b7280")
    : !detail.configured
      ? "#6b7280"
      : detail.ok
        ? "#22c55e"
        : "#ef4444";

  const dotColor = isLoading && !detail ? "#6b7280" : statusColor;

  return (
    <View style={styles.card}>
      <TouchableOpacity
        style={styles.cardHeader}
        onPress={() => setCollapsed((c) => !c)}
        activeOpacity={0.7}
        testID="valhalla-card-header"
      >
        <MaterialCommunityIcons name="routes" size={18} color={dotColor} />
        <Text style={styles.cardTitle}>Valhalla</Text>
        <View style={styles.headerRight}>
          {isLoading && !detail && <ActivityIndicator size="small" color={dotColor} />}
          {error && !isLoading && (
            <MaterialCommunityIcons name="alert-circle-outline" size={16} color="#ef4444" />
          )}
          {detail != null && (
            <View style={[styles.healthDot, { backgroundColor: dotColor }]} />
          )}
          <CollapseChevron collapsed={collapsed} />
        </View>
      </TouchableOpacity>

      {!collapsed && (
        <View style={styles.body}>
          {error && !isLoading && (
            <Text style={styles.errorText}>Impossibile leggere lo stato di Valhalla.</Text>
          )}
          {detail == null && !error && !isLoading && (
            <Text style={styles.metaText}>Nessun dato disponibile.</Text>
          )}
          {detail != null && (
            <>
              <View style={styles.row}>
                <View style={styles.stat}>
                  <Text style={[styles.statValue, { color: dotColor }]}>
                    {!detail.configured
                      ? "Non config."
                      : detail.ok
                        ? "Online"
                        : "Offline"}
                  </Text>
                  <Text style={styles.statLabel}>Stato</Text>
                </View>
                <View style={styles.divider} />
                <View style={styles.stat}>
                  <Text style={styles.statValue}>
                    {detail.configured && detail.ok
                      ? `${detail.activeProfiles.length}/4`
                      : "—"}
                  </Text>
                  <Text style={styles.statLabel}>Profili</Text>
                </View>
                <View style={styles.divider} />
                <View style={styles.stat}>
                  <Text style={styles.statValue}>
                    {detail.latencyMs != null ? `${detail.latencyMs} ms` : "—"}
                  </Text>
                  <Text style={styles.statLabel}>Latenza</Text>
                </View>
              </View>

              {detail.configured && detail.ok && detail.activeProfiles.length > 0 && (
                <View style={styles.chipsRow}>
                  {detail.activeProfiles.map((p) => (
                    <View key={p} style={styles.profileChip}>
                      <MaterialCommunityIcons
                        name={PROFILE_ICONS[p] ?? "routes"}
                        size={11}
                        color="#a78bfa"
                      />
                      <Text style={styles.profileChipText}>{PROFILE_LABELS[p] ?? p}</Text>
                    </View>
                  ))}
                </View>
              )}

              {detail.tileVersion != null && (
                <Text style={styles.metaText}>Tile: {detail.tileVersion}</Text>
              )}

              {detail.configured && !detail.ok && detail.error != null && (
                <View style={styles.warningBanner}>
                  <MaterialCommunityIcons name="alert-outline" size={13} color="#ef4444" />
                  <Text style={[styles.warningText, { color: "#ef4444" }]}>{detail.error}</Text>
                </View>
              )}

              {!detail.configured && (
                <View style={styles.warningBanner}>
                  <MaterialCommunityIcons name="information-outline" size={13} color="#f59e0b" />
                  <Text style={styles.warningText}>Nessun VALHALLA_URL configurato.</Text>
                </View>
              )}

              {!detail.ok && detail.history.length > 0 && (
                <ErrorHistory history={detail.history} />
              )}

              {detail.probeLog && detail.probeLog.length > 0 && (
                <ProbeLog entries={detail.probeLog} />
              )}
            </>
          )}
        </View>
      )}
    </View>
  );
}

export function NominatimCard() {
  const [collapsed, setCollapsed] = useState(true);

  const { data, isLoading, error } = useQuery<ThinkCentreHealthMinimal>({
    queryKey: ["/api/admin/thinkcentre-health"],
    queryFn: ({ signal }) => fetchThinkCentreHealth(signal),
    refetchInterval: 30_000,
    staleTime: 20_000,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });

  const detail = error ? null : (data?.nominatimDetail ?? null);

  const statusColor = detail == null
    ? (error ? "#ef4444" : "#6b7280")
    : !detail.configured
      ? "#6b7280"
      : detail.ok
        ? "#22c55e"
        : "#ef4444";

  const dotColor = isLoading && !detail ? "#6b7280" : statusColor;

  const dbStateColor = (s: string | undefined) => {
    if (s === "ok") return "#22c55e";
    if (s === "error") return "#ef4444";
    return "#6b7280";
  };

  return (
    <View style={styles.card}>
      <TouchableOpacity
        style={styles.cardHeader}
        onPress={() => setCollapsed((c) => !c)}
        activeOpacity={0.7}
        testID="nominatim-card-header"
      >
        <MaterialCommunityIcons name="map-search-outline" size={18} color={dotColor} />
        <Text style={styles.cardTitle}>Nominatim</Text>
        <View style={styles.headerRight}>
          {isLoading && !detail && <ActivityIndicator size="small" color={dotColor} />}
          {error && !isLoading && (
            <MaterialCommunityIcons name="alert-circle-outline" size={16} color="#ef4444" />
          )}
          {detail != null && (
            <View style={[styles.healthDot, { backgroundColor: dotColor }]} />
          )}
          <CollapseChevron collapsed={collapsed} />
        </View>
      </TouchableOpacity>

      {!collapsed && (
        <View style={styles.body}>
          {error && !isLoading && (
            <Text style={styles.errorText}>Impossibile leggere lo stato di Nominatim.</Text>
          )}
          {detail == null && !error && !isLoading && (
            <Text style={styles.metaText}>Nessun dato disponibile.</Text>
          )}
          {detail != null && (
            <>
              <View style={styles.row}>
                <View style={styles.stat}>
                  <Text style={[styles.statValue, { color: dotColor }]}>
                    {!detail.configured
                      ? "Pubblico"
                      : detail.ok
                        ? "Online"
                        : "Offline"}
                  </Text>
                  <Text style={styles.statLabel}>Stato</Text>
                </View>
                <View style={styles.divider} />
                <View style={styles.stat}>
                  <Text style={[styles.statValue, { color: dbStateColor(detail.dbState) }]}>
                    {detail.dbState ? detail.dbState.toUpperCase() : "—"}
                  </Text>
                  <Text style={styles.statLabel}>DB</Text>
                </View>
                <View style={styles.divider} />
                <View style={styles.stat}>
                  <Text style={styles.statValue}>
                    {detail.geocodeLatencyMs != null ? `${detail.geocodeLatencyMs} ms` : "—"}
                  </Text>
                  <Text style={styles.statLabel}>Geocode</Text>
                </View>
              </View>

              {detail.softwareVersion != null && (
                <View style={styles.chipsRow}>
                  <View style={styles.metaChip}>
                    <Ionicons name="code-outline" size={11} color="#60a5fa" />
                    <Text style={styles.metaChipText}>v{detail.softwareVersion}</Text>
                  </View>
                  {detail.latencyMs != null && (
                    <View style={styles.metaChip}>
                      <Ionicons name="timer-outline" size={11} color="#60a5fa" />
                      <Text style={styles.metaChipText}>{detail.latencyMs} ms ping</Text>
                    </View>
                  )}
                </View>
              )}

              {!detail.configured && (
                <View style={styles.warningBanner}>
                  <MaterialCommunityIcons name="information-outline" size={13} color="#f59e0b" />
                  <Text style={styles.warningText}>
                    Nessun NOMINATIM_URL — usa il server pubblico (rate-limited).
                  </Text>
                </View>
              )}

              {detail.configured && !detail.ok && detail.error != null && (
                <View style={styles.warningBanner}>
                  <MaterialCommunityIcons name="alert-outline" size={13} color="#ef4444" />
                  <Text style={[styles.warningText, { color: "#ef4444" }]}>{detail.error}</Text>
                </View>
              )}

              {!detail.ok && detail.history.length > 0 && (
                <ErrorHistory history={detail.history} />
              )}

              {detail.probeLog && detail.probeLog.length > 0 && (
                <ProbeLog entries={detail.probeLog} />
              )}
            </>
          )}
        </View>
      )}
    </View>
  );
}

import { styles } from "./AdminStatsCards.styles";
