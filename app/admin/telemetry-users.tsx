import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useQuery } from "@tanstack/react-query";
import { MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import Colors from "@/constants/colors";
import { getApiUrl, authFetchHeaders } from "@/lib/query-client";

interface TelemetryUser {
  userId: string | number;
  username: string;
  kmRide: number;
  kmTrack: number;
  sessionCount: number;
  lastSample: string | null;
  leanSampleCount: number;
  leanCoveragePct: number;
  maxLean: number | null;
  avgLean: number | null;
  maxLeanLeft: number | null;
  maxLeanRight: number | null;
  leftTurnSamples: number;
  rightTurnSamples: number;
  leanBias: number | null;
  drCorrection: {
    sampleCount: number;
    distanceScale: number;
    speedScale: number;
    speedBiasKmh: number;
    headingBiasDeg: number;
    meanPosErrorM: number;
    updatedAt: string | null;
  } | null;
}

interface TelemetryUsersResponse {
  users: TelemetryUser[];
  total: number;
  page: number;
  limit: number;
}

async function fetchTelemetryUsers(): Promise<TelemetryUsersResponse> {
  const limit = 100;
  const headers = await authFetchHeaders();
  const fetchPage = async (page: number): Promise<TelemetryUsersResponse> => {
    const url = new URL(`/api/admin/telemetry/users?page=${page}&limit=${limit}`, getApiUrl());
    const res = await fetch(url.toString(), { headers, credentials: "include" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  };

  const first = await fetchPage(0);
  const pageCount = Math.ceil(first.total / limit);
  if (pageCount <= 1) return first;

  const rest = await Promise.all(
    Array.from({ length: pageCount - 1 }, (_, index) => fetchPage(index + 1)),
  );

  return {
    ...first,
    users: [first, ...rest].flatMap((page) => page.users),
  };
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("it-IT", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function directionFor(item: TelemetryUser): { label: string; color: string } {
  if (item.leanBias == null || item.leanSampleCount === 0) {
    return { label: "nessun dato", color: Colors.textSecondary };
  }
  if (item.leanBias > 2) return { label: "più a destra", color: "#f59e0b" };
  if (item.leanBias < -2) return { label: "più a sinistra", color: "#60a5fa" };
  return { label: "bilanciato", color: "#22c55e" };
}

function MetricCard({
  icon,
  label,
  value,
  note,
  color = Colors.accent,
}: {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>["name"];
  label: string;
  value: string;
  note: string;
  color?: string;
}) {
  return (
    <View style={styles.metricCard}>
      <View style={[styles.metricIcon, { backgroundColor: color + "1c" }]}>
        <MaterialCommunityIcons name={icon} size={20} color={color} />
      </View>
      <View style={styles.metricBody}>
        <Text style={styles.metricLabel}>{label}</Text>
        <Text style={styles.metricValue}>{value}</Text>
        <Text style={styles.metricNote}>{note}</Text>
      </View>
    </View>
  );
}

function LeanCell({ item }: { item: TelemetryUser }) {
  const left = item.maxLeanLeft ?? 0;
  const right = item.maxLeanRight ?? 0;
  const peak = Math.max(left, right);
  const leftWidth = peak > 0 ? Math.min(100, (left / 45) * 100) : 0;
  const rightWidth = peak > 0 ? Math.min(100, (right / 45) * 100) : 0;
  const direction = directionFor(item);

  return (
    <View style={styles.leanCell}>
      <View style={styles.leanNumbers}>
        <Text style={styles.leanSmall}>S {left > 0 ? `${left.toFixed(1)}°` : "—"}</Text>
        <Text style={styles.leanSmall}>D {right > 0 ? `${right.toFixed(1)}°` : "—"}</Text>
      </View>
      <View style={styles.leanTrack}>
        <View style={[styles.leanBarLeft, { width: `${leftWidth}%` }]} />
        <View style={[styles.leanBarRight, { width: `${rightWidth}%` }]} />
      </View>
      <Text style={[styles.directionText, { color: direction.color }]}>{direction.label}</Text>
    </View>
  );
}

function UserRow({ item, onPress }: { item: TelemetryUser; onPress: () => void }) {
  const hasLean = item.leanSampleCount > 0;
  const dr = item.drCorrection;
  return (
    <TouchableOpacity style={styles.tableRow} onPress={onPress} activeOpacity={0.72}>
      <View style={[styles.cell, styles.userCell]}>
        <View style={styles.avatar}>
          <MaterialCommunityIcons name="account" size={18} color={Colors.accent} />
        </View>
        <View style={styles.userText}>
          <Text style={styles.username} numberOfLines={1}>{item.username}</Text>
          <Text style={styles.subtleText}>ID {item.userId}</Text>
        </View>
      </View>
      <View style={[styles.cell, styles.kmCell]}>
        <Text style={styles.primaryCell}>{item.kmRide.toFixed(1)} km</Text>
        {item.kmTrack > 0 && <Text style={styles.trackCell}>{item.kmTrack.toFixed(1)} km pista</Text>}
      </View>
      <View style={[styles.cell, styles.sessionCell]}>
        <Text style={styles.primaryCell}>{item.sessionCount}</Text>
        <Text style={styles.subtleText}>sessioni</Text>
      </View>
      <View style={[styles.cell, styles.leanValueCell]}>
        {hasLean ? (
          <>
            <Text style={styles.primaryCell}>{item.maxLean?.toFixed(1) ?? "—"}°</Text>
            <Text style={styles.subtleText}>media {item.avgLean?.toFixed(1) ?? "—"}°</Text>
          </>
        ) : (
          <Text style={styles.mutedCell}>nessun sensore</Text>
        )}
      </View>
      <View style={[styles.cell, styles.distributionCell]}>
        <LeanCell item={item} />
      </View>
      <View style={[styles.cell, styles.drCell]}>
        {dr ? (
          <>
            <Text style={styles.drActive}>attiva · {dr.sampleCount} camp.</Text>
            <Text style={styles.subtleText}>
              dist ×{dr.distanceScale.toFixed(3)} · vel ×{dr.speedScale.toFixed(3)}
            </Text>
            <Text style={styles.lastText}>errore pos. {dr.meanPosErrorM.toFixed(1)} m</Text>
          </>
        ) : (
          <>
            <Text style={styles.drPending}>in apprendimento</Text>
            <Text style={styles.subtleText}>nessun modello salvato</Text>
          </>
        )}
      </View>
      <View style={[styles.cell, styles.coverageCell]}>
        <Text style={hasLean ? styles.primaryCell : styles.mutedCell}>
          {item.leanCoveragePct}%
        </Text>
        <Text style={styles.subtleText}>campioni con piega</Text>
        <Text style={styles.lastText}>{formatDate(item.lastSample)}</Text>
      </View>
      <View style={[styles.cell, styles.arrowCell]}>
        <Ionicons name="chevron-forward" size={18} color={Colors.textSecondary} />
      </View>
    </TouchableOpacity>
  );
}

export default function TelemetryUsersScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [search, setSearch] = useState("");

  const { data, isLoading, error, refetch, isRefetching } = useQuery<TelemetryUsersResponse>({
    queryKey: ["/api/admin/telemetry/users/all"],
    queryFn: fetchTelemetryUsers,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  const users = data?.users ?? [];
  const filteredUsers = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("it-IT");
    if (!query) return users;
    return users.filter((user) =>
      user.username.toLocaleLowerCase("it-IT").includes(query)
      || String(user.userId).includes(query),
    );
  }, [search, users]);

  const summary = useMemo(() => {
    const totalKm = users.reduce((sum, user) => sum + user.kmRide, 0);
    const totalSessions = users.reduce((sum, user) => sum + user.sessionCount, 0);
    const usersWithLean = users.filter((user) => user.leanSampleCount > 0).length;
    const usersWithDr = users.filter((user) => (user.drCorrection?.sampleCount ?? 0) > 0).length;
    const latest = users
      .map((user) => user.lastSample)
      .filter((value): value is string => !!value)
      .sort()
      .at(-1) ?? null;
    return { totalKm, totalSessions, usersWithLean, usersWithDr, latest };
  }, [users]);

  return (
    <ScrollView
      style={[styles.container, { paddingTop: insets.top }]}
      contentContainerStyle={{ paddingBottom: insets.bottom + 36 }}
      refreshControl={
        <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={Colors.accent} />
      }
    >
      <View style={styles.pageHeader}>
        <View style={styles.titleBlock}>
          <View style={styles.titleLine}>
            <MaterialCommunityIcons name="radar" size={24} color={Colors.accent} />
            <Text style={styles.pageTitle}>Controllo telemetria utenti</Text>
          </View>
          <Text style={styles.pageSubtitle}>
            Vista admin sui dati realmente ricevuti da BikerLink: distanza, sensori di piega e qualità della raccolta.
          </Text>
        </View>
        <View style={styles.adminPill}>
          <Ionicons name="shield-checkmark-outline" size={15} color="#22c55e" />
          <Text style={styles.adminPillText}>SOLO ADMIN</Text>
        </View>
      </View>

      <View style={styles.dataNotice}>
        <MaterialCommunityIcons name="database-eye-outline" size={18} color={Colors.accent} />
        <Text style={styles.dataNoticeText}>
          Valori calcolati sui campioni reali nel database. Il DR viene corretto per utente dal motore deterministico; Quebracho ne coordina il controllo. Un campo vuoto significa che mancano dati.
        </Text>
      </View>

      {isLoading && <ActivityIndicator style={{ marginTop: 44 }} color={Colors.accent} />}
      {error && (
        <View style={styles.errorBox}>
          <Ionicons name="warning-outline" size={18} color="#ef4444" />
          <Text style={styles.errorText}>Errore nel caricamento della telemetria. Aggiorna la pagina.</Text>
        </View>
      )}

      {!isLoading && !error && (
        <>
          <View style={styles.metricsGrid}>
            <MetricCard icon="account-multiple" label="Utenti con telemetria" value={String(users.length)} note={`di ${data?.total ?? users.length} registrati nel flusso`} />
            <MetricCard icon="map-marker-distance" label="Km totali" value={`${summary.totalKm.toFixed(1)} km`} note="distanza GPS calcolata" color="#22c55e" />
            <MetricCard icon="layers-outline" label="Sessioni" value={String(summary.totalSessions)} note="giri acquisiti" color="#8b5cf6" />
            <MetricCard icon="format-rotate-90" label="Sensore piega" value={`${summary.usersWithLean}/${users.length}`} note="utenti con campioni lean" color="#f59e0b" />
            <MetricCard icon="compass-outline" label="DR corretto" value={`${summary.usersWithDr}/${users.length}`} note="modelli per-utente attivi" color="#38bdf8" />
          </View>

          <View style={styles.toolbar}>
            <View style={styles.searchBox}>
              <Ionicons name="search" size={17} color={Colors.textSecondary} />
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="Cerca utente o ID…"
                placeholderTextColor={Colors.textSecondary}
                style={styles.searchInput}
                autoCorrect={false}
                autoCapitalize="none"
              />
              {!!search && (
                <TouchableOpacity onPress={() => setSearch("")} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="close-circle" size={18} color={Colors.textSecondary} />
                </TouchableOpacity>
              )}
            </View>
            <Text style={styles.resultCount}>{filteredUsers.length} risultati</Text>
            <TouchableOpacity
              style={styles.drCenterButton}
              onPress={() => router.push("/admin/dr-correction" as never)}
              activeOpacity={0.8}
            >
              <MaterialCommunityIcons name="compass-outline" size={16} color={Colors.accent} />
              <Text style={styles.drCenterButtonText}>Centro correzione DR</Text>
            </TouchableOpacity>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator>
            <View style={styles.table}>
              <View style={[styles.tableRow, styles.tableHeader]}>
                <Text style={[styles.headerCell, styles.userCell]}>UTENTE</Text>
                <Text style={[styles.headerCell, styles.kmCell]}>DISTANZA</Text>
                <Text style={[styles.headerCell, styles.sessionCell]}>SESSIONI</Text>
                <Text style={[styles.headerCell, styles.leanValueCell]}>PIEGA</Text>
                <Text style={[styles.headerCell, styles.distributionCell]}>COME PIEGA</Text>
                <Text style={[styles.headerCell, styles.drCell]}>CORREZIONE DR</Text>
                <Text style={[styles.headerCell, styles.coverageCell]}>QUALITÀ DATI</Text>
                <View style={styles.arrowCell} />
              </View>
              {filteredUsers.map((item) => (
                <UserRow
                  key={String(item.userId)}
                  item={item}
                  onPress={() => router.push(`/admin/telemetry-user/${item.userId}` as never)}
                />
              ))}
              {!filteredUsers.length && (
                <View style={styles.emptyState}>
                  <MaterialCommunityIcons name="account-search-outline" size={36} color={Colors.textSecondary} />
                  <Text style={styles.emptyText}>Nessun utente corrisponde alla ricerca.</Text>
                </View>
              )}
            </View>
          </ScrollView>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background, paddingHorizontal: 18 },
  pageHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 16, paddingVertical: 18, maxWidth: 1400, width: "100%", alignSelf: "center" },
  titleBlock: { flex: 1 },
  titleLine: { flexDirection: "row", alignItems: "center", gap: 10 },
  pageTitle: { fontFamily: "Inter_700Bold", fontSize: 22, color: Colors.text },
  pageSubtitle: { fontFamily: "Inter_400Regular", fontSize: 13, lineHeight: 19, color: Colors.textSecondary, marginTop: 6, maxWidth: 860 },
  adminPill: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderColor: "#22c55e55", backgroundColor: "#22c55e12", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  adminPillText: { fontFamily: "Inter_700Bold", fontSize: 10, letterSpacing: 0.6, color: "#22c55e" },
  dataNotice: { flexDirection: "row", alignItems: "center", gap: 9, maxWidth: 1400, width: "100%", alignSelf: "center", borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 14 },
  dataNoticeText: { flex: 1, fontFamily: "Inter_400Regular", fontSize: 12, lineHeight: 17, color: Colors.textSecondary },
  errorBox: { flexDirection: "row", alignItems: "center", gap: 8, alignSelf: "center", marginTop: 32, padding: 14, backgroundColor: "#ef444412", borderRadius: 10 },
  errorText: { fontFamily: "Inter_500Medium", fontSize: 13, color: "#ef4444" },
  metricsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, maxWidth: 1400, width: "100%", alignSelf: "center", marginBottom: 18 },
  metricCard: { flexGrow: 1, flexBasis: 210, minWidth: 190, flexDirection: "row", alignItems: "center", gap: 11, backgroundColor: Colors.surface, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: Colors.border },
  metricIcon: { width: 38, height: 38, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  metricBody: { flex: 1, gap: 2 },
  metricLabel: { fontFamily: "Inter_500Medium", fontSize: 11, color: Colors.textSecondary },
  metricValue: { fontFamily: "Inter_700Bold", fontSize: 21, color: Colors.text },
  metricNote: { fontFamily: "Inter_400Regular", fontSize: 10, color: Colors.textSecondary },
  toolbar: { flexDirection: "row", alignItems: "center", gap: 12, maxWidth: 1400, width: "100%", alignSelf: "center", marginBottom: 8 },
  searchBox: { flexDirection: "row", alignItems: "center", gap: 8, flex: 1, maxWidth: 420, minHeight: 40, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface, borderRadius: 10, paddingHorizontal: 11 },
  searchInput: { flex: 1, color: Colors.text, fontFamily: "Inter_400Regular", fontSize: 13, paddingVertical: 8, outlineStyle: "none" } as any,
  resultCount: { fontFamily: "Inter_500Medium", fontSize: 12, color: Colors.textSecondary },
  drCenterButton: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderColor: Colors.accent + "55", backgroundColor: Colors.accent + "12", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 },
  drCenterButtonText: { fontFamily: "Inter_600SemiBold", fontSize: 11, color: Colors.accent },
  table: { minWidth: 1280, maxWidth: 1400, width: "100%", alignSelf: "center", borderWidth: 1, borderColor: Colors.border, borderRadius: 12, overflow: "hidden", backgroundColor: Colors.surface },
  tableHeader: { backgroundColor: Colors.background, minHeight: 38 },
  tableRow: { flexDirection: "row", alignItems: "center", minHeight: 74, borderBottomWidth: 1, borderBottomColor: Colors.border },
  headerCell: { fontFamily: "Inter_700Bold", fontSize: 10, letterSpacing: 0.5, color: Colors.textSecondary, paddingHorizontal: 12, paddingVertical: 10 },
  cell: { paddingHorizontal: 12, paddingVertical: 10 },
  userCell: { width: 220, flexDirection: "row", alignItems: "center", gap: 10 },
  kmCell: { width: 125 },
  sessionCell: { width: 95 },
  leanValueCell: { width: 120 },
  distributionCell: { width: 215 },
  drCell: { width: 200 },
  coverageCell: { width: 175 },
  drActive: { fontFamily: "Inter_600SemiBold", fontSize: 11, color: "#38bdf8" },
  drPending: { fontFamily: "Inter_600SemiBold", fontSize: 11, color: "#f59e0b" },
  arrowCell: { width: 42, alignItems: "center", justifyContent: "center" },
  avatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: Colors.accent + "18", alignItems: "center", justifyContent: "center" },
  userText: { flex: 1, minWidth: 0, gap: 2 },
  username: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: Colors.text },
  subtleText: { fontFamily: "Inter_400Regular", fontSize: 10, color: Colors.textSecondary },
  primaryCell: { fontFamily: "Inter_700Bold", fontSize: 14, color: Colors.text },
  mutedCell: { fontFamily: "Inter_500Medium", fontSize: 12, color: Colors.textSecondary },
  trackCell: { fontFamily: "Inter_500Medium", fontSize: 10, color: "#8b5cf6", marginTop: 2 },
  leanCell: { gap: 4 },
  leanNumbers: { flexDirection: "row", justifyContent: "space-between", gap: 10 },
  leanSmall: { fontFamily: "Inter_500Medium", fontSize: 10, color: Colors.textSecondary },
  leanTrack: { height: 7, flexDirection: "row", gap: 2, backgroundColor: Colors.background, borderRadius: 4, overflow: "hidden" },
  leanBarLeft: { height: 7, backgroundColor: "#60a5fa", borderRadius: 4 },
  leanBarRight: { height: 7, backgroundColor: "#f59e0b", borderRadius: 4 },
  directionText: { fontFamily: "Inter_600SemiBold", fontSize: 10 },
  lastText: { fontFamily: "Inter_400Regular", fontSize: 9, color: Colors.textSecondary, marginTop: 4 },
  emptyState: { alignItems: "center", justifyContent: "center", gap: 10, minHeight: 160, padding: 20 },
  emptyText: { fontFamily: "Inter_400Regular", fontSize: 13, color: Colors.textSecondary },
});
