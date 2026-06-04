import React, { useState } from "react";
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from "react-native";
import { MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import Colors from "@/constants/colors";
import { getApiUrl, authFetchHeaders } from "@/lib/query-client";

type ServiceKey = "graphhopper" | "valhalla" | "ollama" | "whisper" | "nominatim";

interface ServiceHealth {
  key: ServiceKey;
  label: string;
  configured: boolean;
  ok: boolean;
  latencyMs: number | null;
  url: string | null;
  error?: string;
  tileVersion?: string;
}

interface ThinkCentreHealth {
  overall: "green" | "yellow" | "red" | "idle";
  onlineCount: number;
  configuredCount: number;
  services: ServiceHealth[];
  checkedAt: number;
}

const SERVICE_ICONS: Record<ServiceKey, keyof typeof MaterialCommunityIcons.glyphMap> = {
  graphhopper: "map-marker-path",
  valhalla: "routes",
  ollama: "robot-outline",
  whisper: "microphone-outline",
  nominatim: "map-search-outline",
};

const OVERALL_COLOR: Record<ThinkCentreHealth["overall"], string> = {
  green: "#22c55e",
  yellow: "#f59e0b",
  red: "#ef4444",
  idle: "#6b7280",
};

function CollapseChevron({ collapsed }: { collapsed: boolean }) {
  return (
    <Ionicons
      name={collapsed ? "chevron-down" : "chevron-up"}
      size={18}
      color={Colors.textSecondary}
    />
  );
}

function serviceColor(s: ServiceHealth): string {
  if (!s.configured) return "#6b7280";
  return s.ok ? "#22c55e" : "#ef4444";
}

function serviceStatusLabel(s: ServiceHealth): string {
  if (!s.configured) return "Non configurato";
  if (s.ok) {
    const base = s.latencyMs != null ? `Online · ${s.latencyMs} ms` : "Online";
    return s.tileVersion ? `${base} · tile ${s.tileVersion}` : base;
  }
  return s.error ? `Offline · ${s.error}` : "Offline";
}

export function ThinkCentreCard() {
  const [collapsed, setCollapsed] = useState(true);

  const { data, isLoading, error } = useQuery<ThinkCentreHealth>({
    queryKey: ["/api/admin/thinkcentre-health"],
    queryFn: async () => {
      const res = await fetch(new URL("/api/admin/thinkcentre-health", getApiUrl()).toString(), {
        headers: { ...(await authFetchHeaders()) },
        credentials: "include",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    refetchInterval: 30_000,
    staleTime: 20_000,
  });

  const headerColor = data ? OVERALL_COLOR[data.overall] : "#6b7280";

  return (
    <View style={styles.card}>
      <TouchableOpacity
        style={styles.cardHeader}
        onPress={() => setCollapsed((c) => !c)}
        activeOpacity={0.7}
        testID="thinkcentre-card-header"
      >
        <MaterialCommunityIcons name="home-assistant" size={18} color={headerColor} />
        <Text style={styles.cardTitle}>Server di casa (ThinkCentre)</Text>
        <View style={styles.headerRight}>
          {isLoading && <ActivityIndicator size="small" color={headerColor} />}
          {error && !isLoading && (
            <MaterialCommunityIcons name="alert-circle-outline" size={16} color="#ef4444" />
          )}
          {!isLoading && !error && data && (
            <Text style={styles.headerCount}>
              {data.onlineCount}/{data.configuredCount}
            </Text>
          )}
          {!isLoading && !error && data && (
            <View style={[styles.healthDot, { backgroundColor: headerColor }]} />
          )}
          <CollapseChevron collapsed={collapsed} />
        </View>
      </TouchableOpacity>

      {!collapsed && (
        <View style={styles.list}>
          {error && !isLoading && (
            <Text style={styles.errorText}>Impossibile leggere lo stato dei servizi.</Text>
          )}
          {data?.services.map((s) => (
            <View key={s.key} style={styles.row}>
              <MaterialCommunityIcons
                name={SERVICE_ICONS[s.key]}
                size={18}
                color={serviceColor(s)}
                style={styles.rowIcon}
              />
              <View style={styles.rowText}>
                <Text style={styles.rowLabel}>{s.label}</Text>
                <Text style={styles.rowStatus} numberOfLines={1}>
                  {serviceStatusLabel(s)}
                  {s.configured && s.url ? ` · ${s.url}` : ""}
                </Text>
              </View>
              <View style={[styles.healthDot, { backgroundColor: serviceColor(s) }]} />
            </View>
          ))}
          {data && data.configuredCount > 0 && data.onlineCount === 0 && (
            <View style={styles.note}>
              <Ionicons name="information-circle-outline" size={14} color={Colors.textSecondary} />
              <Text style={styles.noteText}>
                Il server di casa è raggiungibile solo se acceso e con tunnel attivo. Se tutti i
                servizi risultano offline, verifica che il ThinkCentre sia acceso e il tunnel
                configurato (anche da cloud il probe passa solo via tunnel).
              </Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  cardTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 15,
    color: Colors.text,
  },
  headerRight: {
    marginLeft: "auto",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerCount: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    color: Colors.textSecondary,
  },
  healthDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  list: {
    marginTop: 14,
    gap: 10,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  rowIcon: {
    width: 22,
    textAlign: "center",
  },
  rowText: {
    flex: 1,
  },
  rowLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: Colors.text,
  },
  rowStatus: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  errorText: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: "#ef4444",
  },
  note: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    backgroundColor: Colors.background,
    borderRadius: 8,
    padding: 10,
    marginTop: 4,
  },
  noteText: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: Colors.textSecondary,
    flex: 1,
    lineHeight: 16,
  },
});
