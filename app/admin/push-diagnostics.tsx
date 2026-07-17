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
import {
  CauseUsersPanel,
  PlatformBadge,
  causeMeta,
  formatDate,
  type PushTokenStatsResponse,
  type AdminPushTokenStatsResponse,
} from "./push-diagnostics-panel";

export default function PushDiagnosticsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [selectedCause, setSelectedCause] = useState<string | null>(null);

  const { data, isLoading, isError, refetch, isRefetching } = useQuery<PushTokenStatsResponse>({
    queryKey: ["/api/admin/users/stats/push-tokens"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/admin/users/stats/push-tokens");
      return res.json() as Promise<PushTokenStatsResponse>;
    },
    staleTime: 60_000,
  });

  const { data: adminData } = useQuery<AdminPushTokenStatsResponse>({
    queryKey: ["/api/admin/users/stats/push-tokens/admins"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/admin/users/stats/push-tokens/admins");
      return res.json() as Promise<AdminPushTokenStatsResponse>;
    },
    staleTime: 60_000,
  });

  const summary = data?.summary;
  const causes = data?.causes ?? [];
  const totalReal = summary?.totalReal ?? 0;
  const withToken = summary?.withToken ?? 0;
  const withoutToken = summary?.withoutToken ?? 0;
  const coveragePct = totalReal > 0 ? Math.round((withToken / totalReal) * 100) : 0;

  const adminSummary = adminData?.summary;
  const adminTotalAdmins = adminSummary?.totalAdmins ?? 0;
  const adminWithToken = adminSummary?.withToken ?? 0;
  const adminWithoutToken = adminSummary?.withoutToken ?? 0;
  const adminAlertColor = adminWithoutToken > 0 ? "#ef4444" : "#22c55e";

  const webTopPadding = Platform.OS === "web" ? 67 : 0;
  const webBottomPadding = Platform.OS === "web" ? 34 : 0;

  if (selectedCause !== null) {
    return (
      <CauseUsersPanel
        cause={selectedCause}
        onClose={() => setSelectedCause(null)}
      />
    );
  }

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
          {/* Card admin token — critica per il watchdog: se 0 admin hanno token,
              tutti gli alert del sistema vanno nel vuoto. Mostrata per prima. */}
          {adminData && (
            <View style={[s.card, { backgroundColor: colors.surface, borderColor: adminAlertColor + "55" }]}>
              <View style={s.cardHeader}>
                <MaterialCommunityIcons
                  name={adminWithoutToken > 0 ? "shield-alert-outline" : "shield-check-outline"}
                  size={18}
                  color={adminAlertColor}
                />
                <Text style={[s.cardTitle, { color: colors.text }]}>Token admin (alert watchdog)</Text>
              </View>
              <View style={s.statsRow}>
                <View style={s.stat}>
                  <Text style={[s.statValue, { color: colors.text }]}>{adminTotalAdmins}</Text>
                  <Text style={[s.statLabel, { color: colors.textSecondary }]}>Admin totali</Text>
                </View>
                <View style={[s.divider, { backgroundColor: colors.border }]} />
                <View style={s.stat}>
                  <Text style={[s.statValue, { color: "#22c55e" }]}>{adminWithToken}</Text>
                  <Text style={[s.statLabel, { color: colors.textSecondary }]}>Con token</Text>
                </View>
                <View style={[s.divider, { backgroundColor: colors.border }]} />
                <View style={s.stat}>
                  <Text style={[s.statValue, { color: adminAlertColor }]}>{adminWithoutToken}</Text>
                  <Text style={[s.statLabel, { color: colors.textSecondary }]}>Senza token</Text>
                </View>
              </View>
              {adminWithoutToken > 0 && (
                <Text style={[s.adminWarning, { color: adminAlertColor }]}>
                  ⚠️ {adminWithoutToken} admin non riceverà gli alert watchdog. Aprire l&apos;app su ogni device admin per registrare il token.
                </Text>
              )}
              {adminData.admins.length > 0 && (
                <View style={s.adminList}>
                  {adminData.admins.map((a) => (
                    <View
                      key={a.id}
                      style={[s.adminRow, { borderTopColor: colors.border }]}
                    >
                      <MaterialCommunityIcons
                        name={a.hasToken ? "bell-check" : "bell-off-outline"}
                        size={16}
                        color={a.hasToken ? "#22c55e" : "#ef4444"}
                      />
                      <Text style={[s.adminNickname, { color: colors.text }]}>{a.nickname}</Text>
                      <Text style={[s.adminRole, { color: colors.textSecondary }]}>{a.role}</Text>
                      <Text style={[s.adminTokenCount, { color: a.hasToken ? "#22c55e" : "#ef4444" }]}>
                        {a.hasToken ? `${a.tokenCount} device` : "nessun token"}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          )}

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
                const bp = c.byPlatform ?? { ios: 0, android: 0, web: 0, unknown: 0 };
                const hasPlatformData = bp.ios + bp.android + bp.web + bp.unknown > 0;
                return (
                  <TouchableOpacity
                    key={c.cause}
                    activeOpacity={0.7}
                    onPress={() => setSelectedCause(c.cause)}
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
                      {hasPlatformData && (
                        <View style={s.platformRow}>
                          <PlatformBadge label="iOS" count={bp.ios} color="#007aff" icon="apple" />
                          <PlatformBadge label="Android" count={bp.android} color="#22c55e" icon="android" />
                          <PlatformBadge label="Web" count={bp.web} color="#a855f7" icon="web" />
                          <PlatformBadge label="?" count={bp.unknown} color="#6b7280" icon="help-circle-outline" />
                        </View>
                      )}
                      <Text style={[s.causeMeta, { color: colors.textSecondary }]}>
                        Ultimo: {formatDate(c.lastAt)}
                      </Text>
                    </View>
                    <View style={s.causeRight}>
                      <Text style={[s.causeCount, { color: colors.text }]}>
                        {c.count.toLocaleString("it-IT")}
                      </Text>
                      <Text style={[s.causePct, { color: meta.color }]}>{pct}%</Text>
                      <MaterialCommunityIcons name="chevron-right" size={16} color={colors.textSecondary} />
                    </View>
                  </TouchableOpacity>
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
  platformRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
    marginTop: 2,
  },
  causeMeta: { fontFamily: "Inter_400Regular", fontSize: 11 },
  causeRight: { alignItems: "flex-end", gap: 2, minWidth: 48 },
  causeCount: { fontFamily: "Inter_700Bold", fontSize: 18 },
  causePct: { fontFamily: "Inter_600SemiBold", fontSize: 12 },
  adminWarning: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    marginTop: 12,
    lineHeight: 18,
  },
  adminList: { marginTop: 12, gap: 0 },
  adminRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
    paddingVertical: 8,
    borderTopWidth: 1,
  },
  adminNickname: { fontFamily: "Inter_600SemiBold", fontSize: 13, flex: 1 },
  adminRole: { fontFamily: "Inter_400Regular", fontSize: 11 },
  adminTokenCount: { fontFamily: "Inter_600SemiBold", fontSize: 12 },
});
