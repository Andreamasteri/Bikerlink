import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Platform,
} from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { apiRequest } from "@/lib/query-client";

interface PlatformRow {
  platform: string;
  count: number;
}

interface ModelRow {
  model: string;
  platform: string;
  count: number;
}

interface DeviceStatsResponse {
  total: number;
  platforms: PlatformRow[];
  models: ModelRow[];
}

const DATE_FILTERS = [
  { label: "7 giorni", days: 7 },
  { label: "30 giorni", days: 30 },
  { label: "90 giorni", days: 90 },
  { label: "Tutti", days: 0 },
];

function platformLabel(p: string): string {
  const map: Record<string, string> = {
    ios: "iOS",
    android: "Android",
    web: "Web",
    unknown: "Sconosciuto",
  };
  return map[p.toLowerCase()] ?? p;
}

function platformIcon(p: string): React.ComponentProps<typeof MaterialCommunityIcons>["name"] {
  const lower = p.toLowerCase();
  if (lower === "ios") return "apple";
  if (lower === "android") return "android";
  if (lower === "web") return "web";
  return "devices";
}

function platformColor(p: string): string {
  const lower = p.toLowerCase();
  if (lower === "ios") return "#6366f1";
  if (lower === "android") return "#22c55e";
  if (lower === "web") return "#0ea5e9";
  return "#6b7280";
}

export default function DeviceStatsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [selectedDays, setSelectedDays] = useState(30);

  const { data, isLoading, isError, refetch, isRefetching } = useQuery<DeviceStatsResponse>({
    queryKey: ["/api/admin/users/stats/devices", selectedDays],
    queryFn: async () => {
      const qs = selectedDays > 0 ? `?days=${selectedDays}` : "";
      const res = await apiRequest("GET", `/api/admin/users/stats/devices${qs}`);
      return res.json() as Promise<DeviceStatsResponse>;
    },
    staleTime: 60_000,
  });

  const total = data?.total ?? 0;
  const platforms = data?.platforms ?? [];
  const models = data?.models ?? [];

  const withDevice = models.reduce((s, m) => s + m.count, 0);
  const withoutDevice = total - withDevice;

  const webTopPadding = Platform.OS === "web" ? 67 : 0;
  const webBottomPadding = Platform.OS === "web" ? 34 : 0;

  return (
    <ScrollView
      style={[s.container, { backgroundColor: colors.background }]}
      contentContainerStyle={[
        s.content,
        {
          paddingBottom: insets.bottom + webBottomPadding + 20,
          paddingTop: webTopPadding + 12,
        },
      ]}
      refreshControl={
        <RefreshControl
          refreshing={isRefetching}
          onRefresh={refetch}
          tintColor={colors.accent}
        />
      }
    >
      <View style={s.filterRow}>
        {DATE_FILTERS.map((f) => (
          <TouchableOpacity
            key={f.days}
            style={[
              s.filterBtn,
              { borderColor: colors.border, backgroundColor: colors.surface },
              selectedDays === f.days && { borderColor: colors.accent, backgroundColor: colors.accent + "22" },
            ]}
            onPress={() => setSelectedDays(f.days)}
            activeOpacity={0.7}
          >
            <Text
              style={[
                s.filterBtnText,
                { color: colors.textSecondary },
                selectedDays === f.days && { color: colors.accent, fontFamily: "Inter_600SemiBold" },
              ]}
            >
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {isLoading && (
        <View style={s.centered}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      )}

      {isError && !isLoading && (
        <View style={s.centered}>
          <MaterialCommunityIcons name="alert-circle-outline" size={36} color="#ef4444" />
          <Text style={[s.errorText, { color: colors.textSecondary }]}>Errore nel caricamento</Text>
          <TouchableOpacity style={[s.retryBtn, { borderColor: colors.accent }]} onPress={() => refetch()}>
            <Text style={[s.retryBtnText, { color: colors.accent }]}>Riprova</Text>
          </TouchableOpacity>
        </View>
      )}

      {!isLoading && !isError && data && (
        <>
          <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={s.cardHeader}>
              <MaterialCommunityIcons name="cellphone-check" size={18} color={colors.accent} />
              <Text style={[s.cardTitle, { color: colors.text }]}>Panoramica</Text>
            </View>
            <View style={s.statsRow}>
              <View style={s.stat}>
                <Text style={[s.statValue, { color: colors.text }]}>{total.toLocaleString("it-IT")}</Text>
                <Text style={[s.statLabel, { color: colors.textSecondary }]}>Utenti totali</Text>
              </View>
              <View style={[s.divider, { backgroundColor: colors.border }]} />
              <View style={s.stat}>
                <Text style={[s.statValue, { color: "#22c55e" }]}>{withDevice.toLocaleString("it-IT")}</Text>
                <Text style={[s.statLabel, { color: colors.textSecondary }]}>Con dispositivo</Text>
              </View>
              <View style={[s.divider, { backgroundColor: colors.border }]} />
              <View style={s.stat}>
                <Text style={[s.statValue, { color: "#f59e0b" }]}>{withoutDevice.toLocaleString("it-IT")}</Text>
                <Text style={[s.statLabel, { color: colors.textSecondary }]}>Senza dati</Text>
              </View>
            </View>
          </View>

          <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={s.cardHeader}>
              <MaterialCommunityIcons name="devices" size={18} color={colors.accent} />
              <Text style={[s.cardTitle, { color: colors.text }]}>Per piattaforma</Text>
            </View>
            {platforms.length === 0 ? (
              <Text style={[s.emptyText, { color: colors.textSecondary }]}>Nessun dato</Text>
            ) : (
              platforms.map((p) => {
                const pct = total > 0 ? Math.round((p.count / total) * 100) : 0;
                const color = platformColor(p.platform);
                return (
                  <View key={p.platform} style={s.platformRow}>
                    <View style={s.platformLeft}>
                      <MaterialCommunityIcons name={platformIcon(p.platform)} size={20} color={color} />
                      <Text style={[s.platformName, { color: colors.text }]}>{platformLabel(p.platform)}</Text>
                    </View>
                    <View style={s.platformBarContainer}>
                      <View
                        style={[
                          s.platformBar,
                          { width: `${pct}%` as `${number}%`, backgroundColor: color + "55" },
                        ]}
                      />
                    </View>
                    <View style={s.platformRight}>
                      <Text style={[s.platformCount, { color: colors.text }]}>{p.count.toLocaleString("it-IT")}</Text>
                      <Text style={[s.platformPct, { color: color }]}>{pct}%</Text>
                    </View>
                  </View>
                );
              })
            )}
          </View>

          <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={s.cardHeader}>
              <MaterialCommunityIcons name="cellphone" size={18} color={colors.accent} />
              <Text style={[s.cardTitle, { color: colors.text }]}>Top modelli</Text>
              <Text style={[s.cardSubtitle, { color: colors.textSecondary }]}> (max 30)</Text>
            </View>
            {models.length === 0 ? (
              <Text style={[s.emptyText, { color: colors.textSecondary }]}>Nessun dato</Text>
            ) : (
              models.map((m, idx) => {
                const pct = withDevice > 0 ? Math.round((m.count / withDevice) * 100) : 0;
                const color = platformColor(m.platform);
                return (
                  <View key={`${m.model}-${m.platform}`} style={[s.modelRow, idx > 0 && { borderTopWidth: 1, borderTopColor: colors.border }]}>
                    <Text style={[s.modelRank, { color: colors.textSecondary }]}>
                      {String(idx + 1).padStart(2, " ")}
                    </Text>
                    <View style={s.modelInfo}>
                      <View style={s.modelNameRow}>
                        <MaterialCommunityIcons name={platformIcon(m.platform)} size={13} color={color} />
                        <Text style={[s.modelName, { color: colors.text }]} numberOfLines={1}>
                          {m.model}
                        </Text>
                      </View>
                      <View style={s.modelBarContainer}>
                        <View
                          style={[
                            s.modelBar,
                            { width: `${pct}%` as `${number}%`, backgroundColor: color + "55" },
                          ]}
                        />
                      </View>
                    </View>
                    <View style={s.modelRight}>
                      <Text style={[s.modelCount, { color: colors.text }]}>{m.count}</Text>
                      <Text style={[s.modelPct, { color: color }]}>{pct}%</Text>
                    </View>
                  </View>
                );
              })
            )}
          </View>
        </>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16 },
  filterRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 16,
    flexWrap: "wrap",
  },
  filterBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
  },
  filterBtnText: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
  },
  centered: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 60,
    gap: 12,
  },
  errorText: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
  },
  retryBtn: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  retryBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
  },
  card: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 16,
  },
  cardTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 15,
  },
  cardSubtitle: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  stat: {
    flex: 1,
    alignItems: "center",
  },
  statValue: {
    fontFamily: "Inter_700Bold",
    fontSize: 20,
  },
  statLabel: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    marginTop: 2,
  },
  divider: {
    width: 1,
    height: 40,
  },
  emptyText: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    textAlign: "center",
    paddingVertical: 16,
  },
  platformRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 12,
  },
  platformLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    width: 110,
  },
  platformName: {
    fontFamily: "Inter_500Medium",
    fontSize: 14,
  },
  platformBarContainer: {
    flex: 1,
    height: 8,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 4,
    overflow: "hidden",
  },
  platformBar: {
    height: 8,
    borderRadius: 4,
    minWidth: 4,
  },
  platformRight: {
    alignItems: "flex-end",
    width: 60,
  },
  platformCount: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
  },
  platformPct: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
  },
  modelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 9,
  },
  modelRank: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    width: 24,
    textAlign: "right",
  },
  modelInfo: {
    flex: 1,
    gap: 4,
  },
  modelNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  modelName: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    flex: 1,
  },
  modelBarContainer: {
    height: 5,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 3,
    overflow: "hidden",
  },
  modelBar: {
    height: 5,
    borderRadius: 3,
    minWidth: 3,
  },
  modelRight: {
    alignItems: "flex-end",
    width: 50,
  },
  modelCount: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
  },
  modelPct: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
  },
});
