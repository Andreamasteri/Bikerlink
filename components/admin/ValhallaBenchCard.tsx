/**
 * Task #3158 — Bench Valhalla.
 *
 * Scheda admin che mostra lo stato di Valhalla, esegue il bench multi-percorso
 * (7 percorsi moto italiani su Valhalla vs distanze di riferimento hardcoded)
 * e consente di attivare Valhalla per tutti se almeno 5/7 percorsi passano.
 */
import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Alert,
} from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { apiRequest } from "@/lib/query-client";
import type { ValhallaBenchResult, ValhallaBenchRow } from "@/components/admin/routing-control/types";

interface ValhallaStatus {
  configured: boolean;
  ok: boolean;
  version: string | null;
  osm_date: string | null;
  url_hint: string | null;
}

function statusBadge(status?: ValhallaStatus): { label: string; color: string } {
  if (!status || !status.configured) return { label: "NON CONFIGURATO", color: Colors.textSecondary };
  if (status.ok) return { label: "OK", color: Colors.success };
  return { label: "DOWN", color: Colors.error };
}

function fmt(n: number | null, suffix = ""): string {
  if (n == null) return "—";
  return `${n}${suffix}`;
}

function deltaColor(pct: number | null, threshold: number): string {
  if (pct == null) return Colors.textSecondary;
  return pct < threshold ? Colors.success : Colors.error;
}

function BenchRow({ row, threshold }: { row: ValhallaBenchRow; threshold: number }) {
  return (
    <View style={styles.tableRow}>
      <View style={[styles.cell, styles.cellName]}>
        <MaterialCommunityIcons
          name={row.pass ? "check-circle" : "close-circle"}
          size={14}
          color={row.pass ? Colors.success : Colors.error}
        />
        <Text style={styles.cellNameText} numberOfLines={2}>{row.name}</Text>
      </View>
      <Text style={[styles.cell, styles.cellNum]}>{fmt(row.gh.distanceKm)}</Text>
      <Text style={[styles.cell, styles.cellNum]}>{fmt(row.valhalla.distanceKm)}</Text>
      <Text style={[styles.cell, styles.cellNum, { color: deltaColor(row.deltaDistancePct, threshold) }]}>
        {fmt(row.deltaDistancePct, "%")}
      </Text>
      <Text style={[styles.cell, styles.cellNum]}>{fmt(row.gh.durationMin)}</Text>
      <Text style={[styles.cell, styles.cellNum]}>{fmt(row.valhalla.durationMin)}</Text>
      <Text style={[styles.cell, styles.cellNum]}>{fmt(row.deltaTimePct, "%")}</Text>
      <Text style={[styles.cell, styles.cellNum]}>{fmt(row.valhalla.latencyMs, "ms")}</Text>
    </View>
  );
}

export function ValhallaBenchCard() {
  const queryClient = useQueryClient();
  const [bench, setBench] = useState<ValhallaBenchResult | null>(null);

  const { data: status, isLoading: statusLoading } = useQuery<ValhallaStatus>({
    queryKey: ["/api/admin/maps/valhalla-status"],
    refetchInterval: 30000,
    staleTime: 10000,
  });

  const benchMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/maps/valhalla-bench");
      return (await res.json()) as ValhallaBenchResult;
    },
    onSuccess: (data) => setBench(data),
    onError: (err: unknown) => {
      Alert.alert("Bench fallito", err instanceof Error ? err.message : "Errore sconosciuto");
    },
  });

  const activateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/maps/activate-valhalla");
      return (await res.json()) as { ok: boolean; previous_engine: string; previous_rollout: string };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/routing/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/maps/valhalla-status"] });
      Alert.alert(
        "Valhalla attivato",
        `Engine impostato su Valhalla per tutti.\nPrecedente: ${data.previous_engine} (rollout ${data.previous_rollout}).`,
      );
    },
    onError: (err: unknown) => {
      Alert.alert("Attivazione fallita", err instanceof Error ? err.message : "Errore sconosciuto");
    },
  });

  const badge = statusBadge(status);
  const threshold = bench?.passDeltaPct ?? 8;
  const canActivate = !!bench?.canActivate && !!status?.ok;

  const confirmActivate = () => {
    Alert.alert(
      "Attiva Valhalla per tutti?",
      `Imposterà l'engine di routing su Valhalla e il rollout su "all" per tutti gli utenti. ` +
        `Bench: ${bench?.score.passed}/${bench?.score.total} percorsi OK. Nessun rollback automatico.`,
      [
        { text: "Annulla", style: "cancel" },
        { text: "Attiva", style: "destructive", onPress: () => activateMutation.mutate() },
      ],
    );
  };

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.cardHeaderLeft}>
          <MaterialCommunityIcons name="map-marker-distance" size={22} color={Colors.accent} />
          <Text style={styles.cardTitle}>Bench Valhalla</Text>
        </View>
        <View style={[styles.badge, { backgroundColor: badge.color + "22", borderColor: badge.color }]}>
          {statusLoading ? (
            <ActivityIndicator size="small" color={badge.color} />
          ) : (
            <Text style={[styles.badgeText, { color: badge.color }]}>{badge.label}</Text>
          )}
        </View>
      </View>

      <View style={styles.cardBody}>
        {status?.configured && (
          <View style={styles.statusRows}>
            {status.url_hint ? (
              <View style={styles.statusRow}>
                <Text style={styles.statusLabel}>Host</Text>
                <Text style={styles.statusValue} numberOfLines={1}>{status.url_hint}</Text>
              </View>
            ) : null}
            {status.version ? (
              <View style={styles.statusRow}>
                <Text style={styles.statusLabel}>Versione</Text>
                <Text style={styles.statusValue}>{status.version}</Text>
              </View>
            ) : null}
            {status.osm_date ? (
              <View style={styles.statusRow}>
                <Text style={styles.statusLabel}>OSM</Text>
                <Text style={styles.statusValue}>{status.osm_date}</Text>
              </View>
            ) : null}
          </View>
        )}

        {!status?.configured && !statusLoading && (
          <Text style={styles.hintText}>
            VALHALLA_URL non impostato. Configura il secret per abilitare il bench e l'attivazione.
          </Text>
        )}

        <TouchableOpacity
          style={[styles.runButton, (benchMutation.isPending || !status?.configured) && styles.buttonDisabled]}
          onPress={() => benchMutation.mutate()}
          activeOpacity={0.7}
          disabled={benchMutation.isPending || !status?.configured}
        >
          {benchMutation.isPending ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <MaterialCommunityIcons name="play-circle" size={16} color="#fff" />
              <Text style={styles.runButtonText}>Esegui bench (7 percorsi)</Text>
            </>
          )}
        </TouchableOpacity>

        {bench && (
          <>
            <View style={styles.scoreRow}>
              <Text style={styles.scoreText}>
                {bench.score.passed}/{bench.score.total} percorsi OK
              </Text>
              <Text style={styles.scoreSub}>Δ distanza &lt; {threshold}%</Text>
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator style={styles.tableScroll}>
              <View>
                <View style={[styles.tableRow, styles.tableHeaderRow]}>
                  <Text style={[styles.cell, styles.cellName, styles.headerCell]}>Percorso</Text>
                  <Text style={[styles.cell, styles.cellNum, styles.headerCell]}>km rif.</Text>
                  <Text style={[styles.cell, styles.cellNum, styles.headerCell]}>km VH</Text>
                  <Text style={[styles.cell, styles.cellNum, styles.headerCell]}>Δ%</Text>
                  <Text style={[styles.cell, styles.cellNum, styles.headerCell]}>min rif.</Text>
                  <Text style={[styles.cell, styles.cellNum, styles.headerCell]}>min VH</Text>
                  <Text style={[styles.cell, styles.cellNum, styles.headerCell]}>Δ%</Text>
                  <Text style={[styles.cell, styles.cellNum, styles.headerCell]}>Lat.</Text>
                </View>
                {bench.results.map((row) => (
                  <BenchRow key={row.id} row={row} threshold={threshold} />
                ))}
              </View>
            </ScrollView>

            <TouchableOpacity
              style={[styles.activateButton, (!canActivate || activateMutation.isPending) && styles.buttonDisabled]}
              onPress={confirmActivate}
              activeOpacity={0.7}
              disabled={!canActivate || activateMutation.isPending}
            >
              {activateMutation.isPending ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <MaterialCommunityIcons name="rocket-launch" size={16} color="#fff" />
                  <Text style={styles.runButtonText}>Attiva per tutti</Text>
                </>
              )}
            </TouchableOpacity>
            {!canActivate && (
              <Text style={styles.hintText}>
                Attivazione disponibile solo con ≥ {bench.minPassForActivation}/{bench.score.total} percorsi OK e Valhalla raggiungibile.
              </Text>
            )}
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface, borderRadius: 14, borderWidth: 1,
    borderColor: Colors.border, overflow: "hidden",
  },
  cardHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 14,
  },
  cardHeaderLeft: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  cardTitle: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: Colors.text, flex: 1 },
  badge: { borderRadius: 6, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3, minWidth: 40, alignItems: "center" },
  badgeText: { fontFamily: "Inter_700Bold", fontSize: 11, letterSpacing: 0.5 },
  cardBody: { borderTopWidth: 1, borderTopColor: Colors.border, padding: 14, gap: 12 },
  statusRows: { gap: 6 },
  statusRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  statusLabel: { fontFamily: "Inter_400Regular", fontSize: 13, color: Colors.textSecondary },
  statusValue: { fontFamily: "Inter_500Medium", fontSize: 13, color: Colors.text, flexShrink: 1, textAlign: "right" },
  hintText: { fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.textSecondary },
  runButton: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    backgroundColor: Colors.accent, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12,
  },
  runButtonText: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: "#fff" },
  activateButton: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    backgroundColor: Colors.success, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12,
  },
  buttonDisabled: { opacity: 0.5 },
  scoreRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  scoreText: { fontFamily: "Inter_700Bold", fontSize: 15, color: Colors.text },
  scoreSub: { fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.textSecondary },
  tableScroll: { borderWidth: 1, borderColor: Colors.border, borderRadius: 8 },
  tableRow: { flexDirection: "row", alignItems: "center", borderBottomWidth: 1, borderBottomColor: Colors.border },
  tableHeaderRow: { backgroundColor: Colors.background },
  headerCell: { fontFamily: "Inter_700Bold", fontSize: 11, color: Colors.textSecondary },
  cell: { paddingVertical: 8, paddingHorizontal: 6, fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.text },
  cellName: { width: 150, flexDirection: "row", alignItems: "center", gap: 4 },
  cellNameText: { fontFamily: "Inter_500Medium", fontSize: 12, color: Colors.text, flex: 1 },
  cellNum: { width: 56, textAlign: "right" },
});
