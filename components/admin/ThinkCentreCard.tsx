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
  tokenMissing?: boolean;
}

interface ThinkCentreHealth {
  overall: "green" | "yellow" | "red" | "idle";
  onlineCount: number;
  configuredCount: number;
  services: ServiceHealth[];
  tokenFingerprints?: {
    graphhopper: string | null;
    valhalla: string | null;
    ollama: string | null;
    whisper: string | null;
    nominatim: string | null;
  };
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
  if (s.tokenMissing) return "Offline · token assente in Replit";
  return s.error ? `Offline · ${s.error}` : "Offline";
}

export function ThinkCentreCard() {
  const [collapsed, setCollapsed] = useState(true);

  const { data, isLoading, error } = useQuery<ThinkCentreHealth>({
    queryKey: ["/api/admin/thinkcentre-health"],
    queryFn: async ({ signal }) => {
      const res = await fetch(new URL("/api/admin/thinkcentre-health", getApiUrl()).toString(), {
        headers: { ...(await authFetchHeaders()) },
        credentials: "include",
        signal: AbortSignal.any([signal, AbortSignal.timeout(12_000)]),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    refetchInterval: 30_000,
    staleTime: 20_000,
    refetchOnMount: true,
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
          {data?.services.map((s) => {
            const fp = data.tokenFingerprints?.[s.key] ?? null;
            const showFingerprint = s.configured && fp != null;
            const tokenOk = showFingerprint && s.ok;
            return (
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
                  {showFingerprint && (
                    <View style={styles.fingerprintRow}>
                      <Text style={styles.fingerprint} numberOfLines={1}>
                        token Replit: {fp}…
                      </Text>
                      {tokenOk && (
                        <Ionicons
                          name="checkmark-circle"
                          size={11}
                          color="#22c55e"
                          style={styles.tokenOkIcon}
                        />
                      )}
                    </View>
                  )}
                  {s.configured && !fp && (
                    <Text style={styles.fingerprint}>token Replit: non configurato</Text>
                  )}
                </View>
                <View style={[styles.healthDot, { backgroundColor: serviceColor(s) }]} />
              </View>
            );
          })}
          {data && data.configuredCount > 0 && (
            <View style={styles.note}>
              <Ionicons name="information-circle-outline" size={14} color={Colors.textSecondary} />
              <View style={styles.noteBody}>
                <Text style={styles.noteText}>
                  Il fingerprint del token Replit è sempre visibile per confronto preventivo — utile
                  per verificare che una modifica ai secret sia stata applicata prima che scatti un
                  401.
                  {data.onlineCount === 0
                    ? "\nTutti i servizi risultano offline: verifica che il ThinkCentre sia acceso e il tunnel configurato."
                    : ""}
                  {"\n"}Per confronto lato server esegui{" "}
                  <Text style={styles.mono}>check-token-fingerprints.sh</Text> sul ThinkCentre.
                </Text>
                <View style={styles.legend}>
                  <Ionicons name="checkmark-circle" size={11} color="#22c55e" />
                  <Text style={styles.legendText}>token OK — servizio online + fingerprint presente</Text>
                </View>
              </View>
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
    alignItems: "flex-start",
    gap: 10,
  },
  rowIcon: {
    width: 22,
    textAlign: "center",
    marginTop: 2,
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
  fingerprint: {
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    color: "#6b7280",
    marginTop: 2,
    letterSpacing: 0.4,
  },
  fingerprintRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 2,
  },
  tokenOkIcon: {
    marginTop: 0,
  },
  mono: {
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    color: "#9ca3af",
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
  noteBody: {
    flex: 1,
    gap: 4,
  },
  noteText: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: Colors.textSecondary,
    lineHeight: 16,
  },
  legend: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 2,
  },
  legendText: {
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    color: Colors.textSecondary,
  },
});
