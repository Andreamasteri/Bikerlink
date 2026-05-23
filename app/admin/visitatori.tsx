import React, { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, FlatList, Switch } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { getApiUrl } from "@/lib/query-client";

type Summary = {
  views: { today: number; last7d: number; last30d: number; total: number };
  uniqueVisitors: { today: number; last7d: number; last30d: number; total: number };
  registrations: { last30d: number; total: number };
  logins: { last30d: number; total: number };
  generatedAt: string;
};

type Visit = {
  id: string;
  visitorId: string;
  userId: string | null;
  userNickname: string | null;
  event: "view" | "register" | "login";
  path: string;
  referrer: string | null;
  userAgent: string | null;
  ipPrefix: string | null;
  lang: string | null;
  country: string | null;
  createdAt: string;
};

type VisitsResponse = { total: number; limit: number; offset: number; visits: Visit[] };

const PAGE_SIZE = 50;

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("it-IT", {
      day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function eventColor(ev: string): string {
  if (ev === "register") return "#22C55E";
  if (ev === "login") return "#3b82f6";
  return Colors.textSecondary;
}

export default function VisitatoriAdminScreen() {
  const insets = useSafeAreaInsets();
  const [page, setPage] = useState(0);
  const [eventFilter, setEventFilter] = useState<"" | "view" | "register" | "login">("");
  const [loggedOnly, setLoggedOnly] = useState(false);

  const summaryQ = useQuery<Summary>({
    queryKey: ["/api/admin/site-visits/summary"],
    queryFn: async () => {
      const res = await fetch(new URL("/api/admin/site-visits/summary", getApiUrl()).toString(), {
        credentials: "include",
      });
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.json();
    },
  });

  const visitsQ = useQuery<VisitsResponse>({
    queryKey: ["/api/admin/site-visits", page, eventFilter, loggedOnly],
    queryFn: async () => {
      const url = new URL("/api/admin/site-visits", getApiUrl());
      url.searchParams.set("limit", String(PAGE_SIZE));
      url.searchParams.set("offset", String(page * PAGE_SIZE));
      if (eventFilter) url.searchParams.set("event", eventFilter);
      if (loggedOnly) url.searchParams.set("loggedOnly", "1");
      const res = await fetch(url.toString(), { credentials: "include" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.json();
    },
  });

  const total = visitsQ.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function StatCard({ value, label, sub }: { value: string | number; label: string; sub?: string }) {
    return (
      <View style={styles.statCard}>
        <Text style={styles.statValue}>{String(value)}</Text>
        <Text style={styles.statLabel}>{label}</Text>
        {sub ? <Text style={styles.statSub}>{sub}</Text> : null}
      </View>
    );
  }

  function FilterChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
    return (
      <TouchableOpacity onPress={onPress} style={[styles.chip, active && styles.chipActive]}>
        <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
      </TouchableOpacity>
    );
  }

  function renderVisit({ item }: { item: Visit }) {
    return (
      <View style={styles.row}>
        <View style={styles.rowHead}>
          <View style={[styles.evtBadge, { backgroundColor: eventColor(item.event) + "33", borderColor: eventColor(item.event) }]}>
            <Text style={[styles.evtBadgeText, { color: eventColor(item.event) }]}>{item.event.toUpperCase()}</Text>
          </View>
          <Text style={styles.rowDate}>{fmtDate(item.createdAt)}</Text>
        </View>
        <Text style={styles.rowPath} numberOfLines={1}>{item.path}</Text>
        <View style={styles.rowMeta}>
          {item.userNickname ? (
            <Text style={styles.metaUser}>
              <Ionicons name="person" size={11} color={Colors.accent} /> {item.userNickname}
            </Text>
          ) : (
            <Text style={styles.metaAnon}>anonimo</Text>
          )}
          {item.country ? <Text style={styles.metaText}>🌐 {item.country}</Text> : null}
          {item.lang ? <Text style={styles.metaText}>{item.lang}</Text> : null}
          {item.ipPrefix ? <Text style={styles.metaText}>IP {item.ipPrefix}</Text> : null}
        </View>
        {item.referrer ? <Text style={styles.metaRef} numberOfLines={1}>← {item.referrer}</Text> : null}
        {item.userAgent ? <Text style={styles.metaUa} numberOfLines={1}>{item.userAgent}</Text> : null}
      </View>
    );
  }

  function ListHeader() {
    return (
      <View>
        <View style={styles.statsGrid}>
          {summaryQ.isLoading ? (
            <ActivityIndicator color={Colors.accent} style={{ margin: 24 }} />
          ) : summaryQ.data ? (
            <>
              <StatCard value={summaryQ.data.views.today} label="Visite oggi" sub={`${summaryQ.data.uniqueVisitors.today} unici`} />
              <StatCard value={summaryQ.data.views.last7d} label="Ultimi 7gg" sub={`${summaryQ.data.uniqueVisitors.last7d} unici`} />
              <StatCard value={summaryQ.data.views.last30d} label="Ultimi 30gg" sub={`${summaryQ.data.uniqueVisitors.last30d} unici`} />
              <StatCard value={summaryQ.data.views.total} label="Totale" sub={`${summaryQ.data.uniqueVisitors.total} unici`} />
              <StatCard value={summaryQ.data.registrations.last30d} label="Reg. 30gg" sub={`Tot: ${summaryQ.data.registrations.total}`} />
              <StatCard value={summaryQ.data.logins.last30d} label="Login 30gg" sub={`Tot: ${summaryQ.data.logins.total}`} />
            </>
          ) : (
            <Text style={styles.errorText}>Errore caricamento riepilogo</Text>
          )}
        </View>

        <Text style={styles.sectionTitle}>Filtri</Text>
        <View style={styles.filtersRow}>
          <FilterChip label="Tutti" active={eventFilter === ""} onPress={() => { setEventFilter(""); setPage(0); }} />
          <FilterChip label="Visite" active={eventFilter === "view"} onPress={() => { setEventFilter("view"); setPage(0); }} />
          <FilterChip label="Registrazioni" active={eventFilter === "register"} onPress={() => { setEventFilter("register"); setPage(0); }} />
          <FilterChip label="Login" active={eventFilter === "login"} onPress={() => { setEventFilter("login"); setPage(0); }} />
        </View>
        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>Solo utenti loggati</Text>
          <Switch
            value={loggedOnly}
            onValueChange={(v) => { setLoggedOnly(v); setPage(0); }}
            trackColor={{ false: Colors.surface, true: Colors.accent }}
            thumbColor="#fff"
          />
        </View>

        <View style={styles.listHeader}>
          <Text style={styles.sectionTitle}>Ultime visite ({total})</Text>
        </View>
      </View>
    );
  }

  function ListFooter() {
    if (visitsQ.isLoading) return <ActivityIndicator color={Colors.accent} style={{ margin: 24 }} />;
    return (
      <View style={[styles.pager, { paddingBottom: insets.bottom + 24 }]}>
        <TouchableOpacity
          onPress={() => setPage(Math.max(0, page - 1))}
          disabled={page === 0}
          style={[styles.pagerBtn, page === 0 && styles.pagerBtnDisabled]}
        >
          <MaterialCommunityIcons name="chevron-left" size={20} color={Colors.text} />
          <Text style={styles.pagerBtnText}>Prev</Text>
        </TouchableOpacity>
        <Text style={styles.pagerInfo}>Pagina {page + 1} / {totalPages}</Text>
        <TouchableOpacity
          onPress={() => setPage(Math.min(totalPages - 1, page + 1))}
          disabled={page + 1 >= totalPages}
          style={[styles.pagerBtn, (page + 1 >= totalPages) && styles.pagerBtnDisabled]}
        >
          <Text style={styles.pagerBtnText}>Next</Text>
          <MaterialCommunityIcons name="chevron-right" size={20} color={Colors.text} />
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <FlatList
      style={styles.container}
      data={visitsQ.data?.visits ?? []}
      keyExtractor={(item) => item.id}
      renderItem={renderVisit}
      ListHeaderComponent={ListHeader}
      ListFooterComponent={ListFooter}
      ListEmptyComponent={!visitsQ.isLoading ? (
        <Text style={styles.empty}>Nessuna visita trovata.</Text>
      ) : null}
      contentContainerStyle={{ padding: 16 }}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 16 },
  statCard: {
    flexBasis: "47%", flexGrow: 1, backgroundColor: Colors.surface,
    borderLeftWidth: 3, borderLeftColor: Colors.accent,
    borderWidth: 1, borderColor: Colors.border, borderRadius: 6, padding: 12,
  },
  statValue: { fontFamily: "Inter_700Bold", fontSize: 24, color: Colors.accent, lineHeight: 28 },
  statLabel: { fontFamily: "Inter_600SemiBold", fontSize: 10, color: Colors.textSecondary, textTransform: "uppercase", letterSpacing: 1, marginTop: 4 },
  statSub: { fontFamily: "Inter_400Regular", fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
  sectionTitle: { fontFamily: "Inter_700Bold", fontSize: 13, color: Colors.textSecondary, textTransform: "uppercase", letterSpacing: 1, marginVertical: 8 },
  filtersRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 8 },
  chip: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16,
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
  },
  chipActive: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  chipText: { fontFamily: "Inter_500Medium", fontSize: 12, color: Colors.text },
  chipTextActive: { color: "#fff" },
  switchRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginVertical: 8, paddingHorizontal: 4 },
  switchLabel: { fontFamily: "Inter_500Medium", fontSize: 13, color: Colors.text },
  listHeader: { marginTop: 16 },
  row: {
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
    borderRadius: 6, padding: 12, marginBottom: 8,
  },
  rowHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  evtBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 3, borderWidth: 1 },
  evtBadgeText: { fontFamily: "Inter_700Bold", fontSize: 9, letterSpacing: 1 },
  rowDate: { fontFamily: "Inter_400Regular", fontSize: 11, color: Colors.textSecondary },
  rowPath: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: Colors.text, marginBottom: 4 },
  rowMeta: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 4 },
  metaUser: { fontFamily: "Inter_600SemiBold", fontSize: 11, color: Colors.accent },
  metaAnon: { fontFamily: "Inter_400Regular", fontSize: 11, color: Colors.textSecondary, fontStyle: "italic" },
  metaText: { fontFamily: "Inter_400Regular", fontSize: 11, color: Colors.textSecondary },
  metaRef: { fontFamily: "Inter_400Regular", fontSize: 10, color: Colors.textSecondary, marginTop: 2 },
  metaUa: { fontFamily: "Inter_400Regular", fontSize: 10, color: Colors.textSecondary, marginTop: 2, opacity: 0.6 },
  empty: { textAlign: "center", color: Colors.textSecondary, padding: 32, fontStyle: "italic" },
  errorText: { color: Colors.textSecondary, padding: 16 },
  pager: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 16, gap: 8 },
  pagerBtn: { flexDirection: "row", alignItems: "center", backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 6 },
  pagerBtnDisabled: { opacity: 0.4 },
  pagerBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 12, color: Colors.text },
  pagerInfo: { fontFamily: "Inter_500Medium", fontSize: 12, color: Colors.textSecondary },
});
