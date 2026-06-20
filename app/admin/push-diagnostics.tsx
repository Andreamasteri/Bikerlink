import React from "react";
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

interface CauseRow {
  cause: string;
  count: number;
  lastAt: string | null;
}

interface PushTokenStatsResponse {
  summary: {
    totalReal: number;
    withToken: number;
    withoutToken: number;
  };
  causes: CauseRow[];
}

interface CauseMeta {
  label: string;
  description: string;
  icon: React.ComponentProps<typeof MaterialCommunityIcons>["name"];
  color: string;
}

function causeMeta(cause: string): CauseMeta {
  const map: Record<string, CauseMeta> = {
    PERMESSI_NEGATI: {
      label: "Permessi negati",
      description: "L'utente ha rifiutato i permessi notifiche",
      icon: "bell-off",
      color: "#ef4444",
    },
    PROJECT_ID_MANCANTE: {
      label: "Project ID mancante",
      description: "Configurazione FCM/APNs assente nel build",
      icon: "cog-off",
      color: "#f59e0b",
    },
    TOKEN_NON_OTTENUTO: {
      label: "Token non ottenuto",
      description: "Il servizio push non ha restituito un token",
      icon: "key-remove",
      color: "#f97316",
    },
    TOKEN_VUOTO: {
      label: "Token vuoto",
      description: "Token restituito vuoto dal servizio push",
      icon: "key-alert",
      color: "#eab308",
    },
    ERRORE_REGISTRAZIONE: {
      label: "Errore registrazione",
      description: "Eccezione durante la registrazione del token",
      icon: "alert-circle",
      color: "#dc2626",
    },
    NESSUNA_CAUSA: {
      label: "Causa sconosciuta",
      description: "Nessun token e nessun errore registrato (offline / mai aperta l'app)",
      icon: "help-circle",
      color: "#6b7280",
    },
  };
  return (
    map[cause] ?? {
      label: cause,
      description: "Causa non classificata",
      icon: "help-circle",
      color: "#6b7280",
    }
  );
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function PushDiagnosticsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const { data, isLoading, isError, refetch, isRefetching } = useQuery<PushTokenStatsResponse>({
    queryKey: ["/api/admin/users/stats/push-tokens"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/admin/users/stats/push-tokens");
      return res.json() as Promise<PushTokenStatsResponse>;
    },
    staleTime: 60_000,
  });

  const summary = data?.summary;
  const causes = data?.causes ?? [];
  const totalReal = summary?.totalReal ?? 0;
  const withToken = summary?.withToken ?? 0;
  const withoutToken = summary?.withoutToken ?? 0;
  const coveragePct = totalReal > 0 ? Math.round((withToken / totalReal) * 100) : 0;

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
        <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.accent} />
      }
    >
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
              <MaterialCommunityIcons name="bell-ring" size={18} color={colors.accent} />
              <Text style={[s.cardTitle, { color: colors.text }]}>Copertura notifiche push</Text>
            </View>
            <View style={s.statsRow}>
              <View style={s.stat}>
                <Text style={[s.statValue, { color: colors.text }]}>{totalReal.toLocaleString("it-IT")}</Text>
                <Text style={[s.statLabel, { color: colors.textSecondary }]}>Utenti reali</Text>
              </View>
              <View style={[s.divider, { backgroundColor: colors.border }]} />
              <View style={s.stat}>
                <Text style={[s.statValue, { color: "#22c55e" }]}>{withToken.toLocaleString("it-IT")}</Text>
                <Text style={[s.statLabel, { color: colors.textSecondary }]}>Con token ({coveragePct}%)</Text>
              </View>
              <View style={[s.divider, { backgroundColor: colors.border }]} />
              <View style={s.stat}>
                <Text style={[s.statValue, { color: "#f59e0b" }]}>{withoutToken.toLocaleString("it-IT")}</Text>
                <Text style={[s.statLabel, { color: colors.textSecondary }]}>Senza token</Text>
              </View>
            </View>
          </View>

          <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={s.cardHeader}>
              <MaterialCommunityIcons name="bell-off-outline" size={18} color={colors.accent} />
              <Text style={[s.cardTitle, { color: colors.text }]}>Cause mancato token</Text>
            </View>
            {causes.length === 0 ? (
              <Text style={[s.emptyText, { color: colors.textSecondary }]}>
                Tutti gli utenti reali hanno un token push 🎉
              </Text>
            ) : (
              causes.map((c, idx) => {
                const meta = causeMeta(c.cause);
                const pct = withoutToken > 0 ? Math.round((c.count / withoutToken) * 100) : 0;
                return (
                  <View
                    key={c.cause}
                    style={[s.causeRow, idx > 0 && { borderTopWidth: 1, borderTopColor: colors.border }]}
                  >
                    <View style={[s.causeIcon, { backgroundColor: meta.color + "22" }]}>
                      <MaterialCommunityIcons name={meta.icon} size={20} color={meta.color} />
                    </View>
                    <View style={s.causeInfo}>
                      <Text style={[s.causeLabel, { color: colors.text }]}>{meta.label}</Text>
                      <Text style={[s.causeDesc, { color: colors.textSecondary }]} numberOfLines={2}>
                        {meta.description}
                      </Text>
                      <View style={s.causeBarContainer}>
                        <View
                          style={[
                            s.causeBar,
                            { width: `${pct}%` as `${number}%`, backgroundColor: meta.color + "55" },
                          ]}
                        />
                      </View>
                      <Text style={[s.causeMeta, { color: colors.textSecondary }]}>
                        Ultimo: {formatDate(c.lastAt)}
                      </Text>
                    </View>
                    <View style={s.causeRight}>
                      <Text style={[s.causeCount, { color: colors.text }]}>
                        {c.count.toLocaleString("it-IT")}
                      </Text>
                      <Text style={[s.causePct, { color: meta.color }]}>{pct}%</Text>
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
  centered: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 60,
    gap: 12,
  },
  errorText: { fontFamily: "Inter_400Regular", fontSize: 14 },
  retryBtn: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  retryBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 14 },
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
  cardTitle: { fontFamily: "Inter_700Bold", fontSize: 15 },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  stat: { flex: 1, alignItems: "center", gap: 4 },
  statValue: { fontFamily: "Inter_700Bold", fontSize: 22 },
  statLabel: { fontFamily: "Inter_400Regular", fontSize: 12, textAlign: "center" },
  divider: { width: 1, height: 36, marginHorizontal: 8 },
  emptyText: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    textAlign: "center",
    paddingVertical: 12,
  },
  causeRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingVertical: 12,
  },
  causeIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  causeInfo: { flex: 1, gap: 4 },
  causeLabel: { fontFamily: "Inter_600SemiBold", fontSize: 14 },
  causeDesc: { fontFamily: "Inter_400Regular", fontSize: 12 },
  causeBarContainer: {
    height: 6,
    borderRadius: 3,
    backgroundColor: "transparent",
    overflow: "hidden",
    marginTop: 2,
  },
  causeBar: { height: 6, borderRadius: 3 },
  causeMeta: { fontFamily: "Inter_400Regular", fontSize: 11 },
  causeRight: { alignItems: "flex-end", gap: 2, minWidth: 48 },
  causeCount: { fontFamily: "Inter_700Bold", fontSize: 18 },
  causePct: { fontFamily: "Inter_600SemiBold", fontSize: 12 },
});
