import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  Platform,
  ActivityIndicator,
} from "react-native";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { useNavigation } from "expo-router";
import otaUpdates from "@/ota-updates.json";

interface SystemEvent {
  timestamp: string;
  message: string;
  type: string;
}

interface SystemHealth {
  backendStartedAt: number;
  backendUptimeSec: number;
  metroOnline: boolean;
  metroStartedAt: number;
  metroUptimeSec: number;
  events: SystemEvent[];
}

function formatDuration(totalSec: number): string {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  return `${m}m ${s}s`;
}

function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    const date = d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" });
    const time = d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    return `${date} ${time}`;
  } catch {
    return iso;
  }
}

function eventIcon(type: string): { name: keyof typeof Ionicons.glyphMap; color: string } {
  switch (type) {
    case "BACKEND_RESTART":
      return { name: "refresh-circle", color: "#FF4444" };
    case "COLD_START":
      return { name: "power", color: "#44AA44" };
    case "METRO_UP":
      return { name: "wifi", color: "#44AA44" };
    case "METRO_DOWN":
      return { name: "wifi-outline", color: "#FF4444" };
    case "OTA_PUBLISHED":
      return { name: "cloud-download-outline", color: Colors.accent };
    default:
      return { name: "ellipse-outline", color: "#888888" };
  }
}

function eventLabel(type: string): string {
  switch (type) {
    case "BACKEND_RESTART": return "Riavvio Backend";
    case "COLD_START": return "Avvio Freddo";
    case "METRO_UP": return "Metro Online";
    case "METRO_DOWN": return "Metro Offline";
    case "OTA_PUBLISHED": return "Aggiornamento OTA";
    default: return "Evento generico";
  }
}

export default function SystemScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const [backendUptimeSec, setBackendUptimeSec] = useState<number>(0);
  const [metroUptimeSec, setMetroUptimeSec] = useState<number>(0);

  const { data, isLoading, isError, refetch, isFetching } = useQuery<SystemHealth>({
    queryKey: ["/api/admin/system-health"],
    refetchInterval: 30000,
  });

  const mergedEvents = useMemo<SystemEvent[]>(() => {
    const backendEvents: SystemEvent[] = data?.events ?? [];
    const otaEvents: SystemEvent[] = (otaUpdates as any[]).map((entry) => ({
      timestamp: new Date(entry.publishedAt).toISOString(),
      message: entry.message ?? `OTA-${entry.updateNumber}`,
      type: "OTA_PUBLISHED",
    }));
    return [...backendEvents, ...otaEvents].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }, [data?.events]);

  useEffect(() => {
    if (data) {
      setBackendUptimeSec(data.backendUptimeSec);
      setMetroUptimeSec(data.metroUptimeSec);
    }
  }, [data]);

  useEffect(() => {
    const interval = setInterval(() => {
      setBackendUptimeSec((prev) => prev + 1);
      setMetroUptimeSec((prev) => (data?.metroOnline ? prev + 1 : prev));
    }, 1000);
    return () => clearInterval(interval);
  }, [data?.metroOnline]);

  const handleRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity onPress={handleRefresh} style={{ marginRight: 16 }}>
          {isFetching ? (
            <ActivityIndicator size="small" color={Colors.accent} />
          ) : (
            <Ionicons name="refresh" size={22} color={Colors.accent} />
          )}
        </TouchableOpacity>
      ),
    });
  }, [navigation, handleRefresh, isFetching]);

  const topPadding = Platform.OS === "web" ? 67 : 0;
  const bottomPadding = Platform.OS === "web" ? 34 : insets.bottom;

  if (isLoading) {
    return (
      <View style={[styles.center, { paddingTop: topPadding }]}>
        <ActivityIndicator size="large" color={Colors.accent} />
        <Text style={styles.loadingText}>Caricamento sistema…</Text>
      </View>
    );
  }

  if (isError || !data) {
    return (
      <View style={[styles.center, { paddingTop: topPadding }]}>
        <Ionicons name="warning-outline" size={40} color="#FF4444" />
        <Text style={styles.errorText}>Errore nel caricamento dei dati</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={handleRefresh}>
          <Text style={styles.retryBtnText}>Riprova</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <FlatList
      data={mergedEvents}
      keyExtractor={(item, index) => `${item.timestamp}-${index}`}
      contentContainerStyle={[
        styles.listContent,
        { paddingTop: topPadding + 16, paddingBottom: bottomPadding + 16 },
      ]}
      ListHeaderComponent={
        <>
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Ionicons name="server-outline" size={18} color={Colors.accent} />
              <Text style={styles.cardTitle}>Backend</Text>
              <View style={[styles.badge, { backgroundColor: "#44AA44" }]}>
                <Text style={styles.badgeText}>ONLINE</Text>
              </View>
            </View>
            <Text style={styles.uptimeTimer}>{formatDuration(backendUptimeSec)}</Text>
            <Text style={styles.startedAt}>
              Avviato: {formatTimestamp(new Date(data.backendStartedAt).toISOString())}
            </Text>
          </View>

          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Ionicons name="phone-portrait-outline" size={18} color={Colors.accent} />
              <Text style={styles.cardTitle}>Metro (Expo)</Text>
              <View
                style={[
                  styles.badge,
                  { backgroundColor: data.metroOnline ? "#44AA44" : "#FF4444" },
                ]}
              >
                <Text style={styles.badgeText}>
                  {data.metroOnline ? "ONLINE" : "OFFLINE"}
                </Text>
              </View>
            </View>
            {data.metroOnline ? (
              <>
                <Text style={styles.uptimeTimer}>{formatDuration(metroUptimeSec)}</Text>
                {data.metroStartedAt > 0 && (
                  <Text style={styles.startedAt}>
                    Avviato: {formatTimestamp(new Date(data.metroStartedAt).toISOString())}
                  </Text>
                )}
              </>
            ) : (
              <Text style={styles.offlineText}>Metro non raggiungibile</Text>
            )}
          </View>

          <Text style={styles.sectionTitle}>Ultimi eventi ({mergedEvents.length})</Text>
        </>
      }
      renderItem={({ item }) => {
        const icon = eventIcon(item.type);
        return (
          <View style={styles.eventRow}>
            <View style={styles.eventIconWrap}>
              <Ionicons name={icon.name} size={20} color={icon.color} />
            </View>
            <View style={styles.eventContent}>
              <Text style={styles.eventLabel}>{eventLabel(item.type)}</Text>
              <Text style={styles.eventMessage} numberOfLines={2}>
                {item.message}
              </Text>
              <Text style={styles.eventTime}>{formatTimestamp(item.timestamp)}</Text>
            </View>
          </View>
        );
      }}
      ItemSeparatorComponent={() => <View style={styles.separator} />}
      ListEmptyComponent={
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyText}>Nessun evento registrato</Text>
        </View>
      }
      showsVerticalScrollIndicator={false}
    />
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.background,
    gap: 12,
  },
  loadingText: {
    color: Colors.textMuted ?? "#888",
    fontFamily: "Inter_400Regular",
    fontSize: 14,
  },
  errorText: {
    color: "#FF4444",
    fontFamily: "Inter_500Medium",
    fontSize: 15,
    textAlign: "center",
  },
  retryBtn: {
    marginTop: 8,
    paddingHorizontal: 20,
    paddingVertical: 8,
    backgroundColor: Colors.accent,
    borderRadius: 8,
  },
  retryBtnText: {
    color: "#fff",
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
  },
  listContent: {
    paddingHorizontal: 16,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  cardTitle: {
    color: Colors.text,
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
    flex: 1,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  badgeText: {
    color: "#fff",
    fontFamily: "Inter_700Bold",
    fontSize: 10,
    letterSpacing: 0.5,
  },
  uptimeTimer: {
    color: Colors.accent,
    fontFamily: "Inter_700Bold",
    fontSize: 32,
    letterSpacing: 1,
  },
  startedAt: {
    color: Colors.textMuted ?? "#888",
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    marginTop: 4,
  },
  offlineText: {
    color: "#FF4444",
    fontFamily: "Inter_500Medium",
    fontSize: 14,
    marginTop: 4,
  },
  sectionTitle: {
    color: Colors.textMuted ?? "#888",
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 8,
    marginTop: 4,
  },
  eventRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 12,
    gap: 12,
  },
  eventIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.surface,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  eventContent: {
    flex: 1,
  },
  eventLabel: {
    color: Colors.text,
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
  },
  eventMessage: {
    color: Colors.textMuted ?? "#888",
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    marginTop: 2,
  },
  eventTime: {
    color: Colors.textMuted ?? "#888",
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    marginTop: 4,
  },
  separator: {
    height: 1,
    backgroundColor: Colors.border ?? "#333",
  },
  emptyWrap: {
    paddingVertical: 32,
    alignItems: "center",
  },
  emptyText: {
    color: Colors.textMuted ?? "#888",
    fontFamily: "Inter_400Regular",
    fontSize: 14,
  },
});
