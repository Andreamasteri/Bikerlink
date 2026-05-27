/**
 * Task #2536 — Quarantena DB Integrity. Lista righe candidate alla cancellazione
 * (TTL 30 giorni), con azioni Restore / Purge anticipato.
 */
import React from "react";
import { ScrollView, View, Text, StyleSheet, ActivityIndicator, RefreshControl, TouchableOpacity, Alert } from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { apiRequest } from "@/lib/query-client";
import Colors from "@/constants/colors";

interface QRow {
  id: string; violationId: string | null; sourceTable: string; sourcePk: string;
  payload: Record<string, unknown>; reason: string | null;
  ttlExpiresAt: string; restoredAt: string | null; createdAt: string;
}

export default function DbIntegrityQuarantineScreen() {
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const { data, isLoading, isFetching, refetch } = useQuery<{ rows: QRow[] }>({
    queryKey: ["/api/admin/db-integrity/quarantine"],
    queryFn: async () => (await apiRequest("GET", "/api/admin/db-integrity/quarantine")).json(),
  });
  const restoreMut = useMutation({
    mutationFn: async (id: string) => (await apiRequest("POST", `/api/admin/db-integrity/quarantine/${id}/restore`)).json(),
    onSuccess: () => { Alert.alert("OK", "Ripristinato"); qc.invalidateQueries({ queryKey: ["/api/admin/db-integrity/quarantine"] }); },
    onError: (e: Error) => Alert.alert("Errore", e.message),
  });
  const purgeMut = useMutation({
    mutationFn: async (id: string) => (await apiRequest("POST", `/api/admin/db-integrity/quarantine/${id}/purge`)).json(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/admin/db-integrity/quarantine"] }),
  });

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ padding: 14, paddingBottom: insets.bottom + 24 }}
      refreshControl={<RefreshControl refreshing={isFetching} onRefresh={() => refetch()} tintColor={Colors.accent} />}
    >
      {isLoading && !data ? (
        <ActivityIndicator color={Colors.accent} style={{ marginTop: 40 }} />
      ) : !data?.rows?.length ? (
        <Text style={styles.empty}>Nessuna riga in quarantena.</Text>
      ) : data.rows.map((r) => (
        <View key={r.id} style={styles.card}>
          <Text style={styles.title}>{r.sourceTable} · {r.sourcePk}</Text>
          <Text style={styles.meta}>Reason: {r.reason ?? "—"}</Text>
          <Text style={styles.meta}>Scade: {new Date(r.ttlExpiresAt).toLocaleString("it-IT")}</Text>
          {r.restoredAt ? <Text style={[styles.meta, { color: Colors.success }]}>Ripristinato il {new Date(r.restoredAt).toLocaleString("it-IT")}</Text> : null}
          <Text style={styles.code} numberOfLines={8}>{JSON.stringify(r.payload, null, 2)}</Text>
          {!r.restoredAt ? (
            <View style={styles.actions}>
              <TouchableOpacity style={styles.primary} onPress={() => restoreMut.mutate(r.id)} disabled={restoreMut.isPending}>
                <Text style={styles.primaryText}>Restore</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.secondary} onPress={() => purgeMut.mutate(r.id)} disabled={purgeMut.isPending}>
                <Text style={styles.secondaryText}>Purge ora</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  empty: { color: Colors.textSecondary, textAlign: "center", marginTop: 40 },
  card: { borderWidth: 1, borderColor: Colors.textSecondary, borderRadius: 10, padding: 12, marginBottom: 10, backgroundColor: Colors.surface },
  title: { color: Colors.text, fontFamily: "Inter_600SemiBold", fontSize: 14 },
  meta: { color: Colors.textSecondary, fontSize: 12, marginTop: 4 },
  code: { fontSize: 11, color: Colors.text, backgroundColor: Colors.background, padding: 8, borderRadius: 6, marginTop: 6 },
  actions: { flexDirection: "row", gap: 8, marginTop: 10 },
  primary: { backgroundColor: Colors.accent, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  primaryText: { color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 13 },
  secondary: { borderWidth: 1, borderColor: Colors.accent, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  secondaryText: { color: Colors.accent, fontFamily: "Inter_600SemiBold", fontSize: 13 },
});
