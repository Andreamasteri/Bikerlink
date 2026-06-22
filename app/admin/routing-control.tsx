/**
 * Task #2824 — Controllo Sistema Routing.
 *
 * Pannello operativo: kill-switch (soft toggle DB), test routing on-demand
 * (Mira→Belluno con engine selezionabile) e metriche live degli engine.
 */
import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { apiRequest } from "@/lib/query-client";
import type { RoutingStatus, RoutingTestResult } from "./routing-control/types";

const ENGINES: { id: string; label: string }[] = [
  { id: "graphhopper", label: "GraphHopper" },
  { id: "valhalla", label: "Valhalla" },
  { id: "mapbox-directions", label: "Mapbox" },
  { id: "tomtom", label: "TomTom" },
];

export default function RoutingControlScreen() {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [testEngine, setTestEngine] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<RoutingTestResult | null>(null);

  const { data, isLoading } = useQuery<RoutingStatus>({
    queryKey: ["/api/admin/routing/status"],
    refetchInterval: 15000,
    staleTime: 5000,
  });

  const killSwitchMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const res = await apiRequest("PUT", "/api/admin/routing/kill-switch", { enabled });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/routing/status"] });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Impossibile aggiornare il kill-switch";
      Alert.alert("Errore", msg);
    },
  });

  const testMutation = useMutation({
    mutationFn: async (engine: string | null): Promise<RoutingTestResult> => {
      const res = await apiRequest("POST", "/api/admin/routing/test", engine ? { engine } : {});
      return res.json();
    },
    onSuccess: (res: RoutingTestResult) => {
      setTestResult(res);
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Test fallito";
      setTestResult({ ok: false, engine: testEngine ?? "—", latencyMs: 0, error: msg });
    },
  });

  const enabled = data?.killSwitch.enabled ?? false;
  const m = data?.metrics;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
    >
      {/* Kill-switch */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Kill-Switch Routing</Text>
        <View style={styles.toggleCard}>
          <View style={styles.toggleLeft}>
            <MaterialCommunityIcons
              name={enabled ? "power-plug" : "power-plug-off"}
              size={24}
              color={enabled ? Colors.success : Colors.error}
            />
            <View style={styles.toggleTextWrap}>
              <Text style={styles.toggleLabel}>
                {enabled ? "Routing attivo" : "Routing disabilitato"}
              </Text>
              <Text style={styles.toggleSubtext}>
                {enabled
                  ? "Tutte le chiamate di routing sono permesse"
                  : "Tutte le chiamate di routing sono bloccate"}
              </Text>
            </View>
          </View>
          <Switch
            value={enabled}
            onValueChange={(val) => killSwitchMutation.mutate(val)}
            trackColor={{ false: Colors.border, true: Colors.success + "88" }}
            thumbColor={enabled ? Colors.success : Colors.textSecondary}
            disabled={killSwitchMutation.isPending || isLoading}
          />
        </View>
      </View>

      {/* Test routing */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Test Routing (Mira → Belluno)</Text>
        <View style={styles.engineRow}>
          <TouchableOpacity
            style={[styles.engineChip, testEngine === null && styles.engineChipActive]}
            onPress={() => setTestEngine(null)}
            activeOpacity={0.7}
          >
            <Text style={[styles.engineChipText, testEngine === null && styles.engineChipTextActive]}>
              Attivo
            </Text>
          </TouchableOpacity>
          {ENGINES.map((e) => (
            <TouchableOpacity
              key={e.id}
              style={[styles.engineChip, testEngine === e.id && styles.engineChipActive]}
              onPress={() => setTestEngine(e.id)}
              activeOpacity={0.7}
            >
              <Text style={[styles.engineChipText, testEngine === e.id && styles.engineChipTextActive]}>
                {e.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <TouchableOpacity
          style={[styles.testBtn, testMutation.isPending && styles.testBtnDisabled]}
          onPress={() => testMutation.mutate(testEngine)}
          activeOpacity={0.8}
          disabled={testMutation.isPending}
        >
          {testMutation.isPending ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <MaterialCommunityIcons name="map-marker-path" size={18} color="#fff" />
              <Text style={styles.testBtnText}>Esegui test</Text>
            </>
          )}
        </TouchableOpacity>

        {testResult && (
          <View style={[styles.resultCard, { borderLeftColor: testResult.ok ? Colors.success : Colors.error }]}>
            <View style={styles.resultHeaderRow}>
              <MaterialCommunityIcons
                name={testResult.ok ? "check-circle" : "alert-circle"}
                size={18}
                color={testResult.ok ? Colors.success : Colors.error}
              />
              <Text style={styles.resultTitle}>
                {testResult.ok ? "Route calcolata" : "Test fallito"} · {testResult.engine}
              </Text>
            </View>
            {testResult.ok ? (
              <Text style={styles.resultDetail}>
                {testResult.distanceKm ?? "—"} km · {testResult.durationMinutes ?? "—"} min · {testResult.latencyMs} ms
                {testResult.configuredEngine && testResult.configuredEngine !== testResult.engine
                  ? ` (fallback da ${testResult.configuredEngine})`
                  : ""}
              </Text>
            ) : (
              <Text style={[styles.resultDetail, { color: Colors.error }]}>{testResult.error}</Text>
            )}
          </View>
        )}
      </View>

      {/* Metriche live */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Metriche Live (5 min)</Text>
        <View style={styles.cardRow}>
          <View style={styles.statCard}>
            <Text style={[styles.statValue, { color: Colors.success }]}>{m?.successes ?? "—"}</Text>
            <Text style={styles.statLabel}>Successi</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={[styles.statValue, { color: Colors.warning }]}>{m?.fallbacks ?? "—"}</Text>
            <Text style={styles.statLabel}>Fallback</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={[styles.statValue, { color: Colors.error }]}>{m?.failures ?? "—"}</Text>
            <Text style={styles.statLabel}>Errori</Text>
          </View>
        </View>
        {m && Object.keys(m.byEngine).length > 0 && (
          <View style={styles.byEngineCard}>
            {Object.entries(m.byEngine).map(([engine, c]) => (
              <View key={engine} style={styles.byEngineRow}>
                <Text style={styles.byEngineName}>{engine}</Text>
                <Text style={styles.byEngineStat}>
                  <Text style={{ color: Colors.success }}>{c.success}</Text> /{" "}
                  <Text style={{ color: Colors.warning }}>{c.fallback}</Text> /{" "}
                  <Text style={{ color: Colors.error }}>{c.failure}</Text>
                </Text>
              </View>
            ))}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  section: { marginHorizontal: 12, marginTop: 16 },
  sectionTitle: {
    fontFamily: "Inter_700Bold", fontSize: 13, color: Colors.textSecondary,
    textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10,
  },
  toggleCard: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    padding: 14, backgroundColor: Colors.surface, borderRadius: 12,
    borderWidth: 1, borderColor: Colors.border,
  },
  toggleLeft: { flexDirection: "row", alignItems: "center", gap: 12, flex: 1 },
  toggleTextWrap: { flex: 1 },
  toggleLabel: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: Colors.text },
  toggleSubtext: { fontFamily: "Inter_400Regular", fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
  engineRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 },
  engineChip: {
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20,
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
  },
  engineChipActive: { backgroundColor: Colors.accent + "22", borderColor: Colors.accent },
  engineChipText: { fontFamily: "Inter_500Medium", fontSize: 12, color: Colors.textSecondary },
  engineChipTextActive: { color: Colors.accent },
  testBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: Colors.accent, borderRadius: 12, paddingVertical: 13,
  },
  testBtnDisabled: { opacity: 0.6 },
  testBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: "#fff" },
  resultCard: {
    marginTop: 12, padding: 12, backgroundColor: Colors.surface, borderRadius: 10,
    borderLeftWidth: 4, borderWidth: 1, borderColor: Colors.border,
  },
  resultHeaderRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  resultTitle: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: Colors.text, textTransform: "capitalize" },
  resultDetail: { fontFamily: "Inter_400Regular", fontSize: 13, color: Colors.text, marginTop: 6 },
  cardRow: { flexDirection: "row", gap: 8 },
  statCard: {
    flex: 1, backgroundColor: Colors.surface, borderRadius: 12, padding: 14,
    alignItems: "center", borderWidth: 1, borderColor: Colors.border,
  },
  statValue: { fontFamily: "Inter_700Bold", fontSize: 20, color: Colors.text },
  statLabel: { fontFamily: "Inter_400Regular", fontSize: 11, color: Colors.textSecondary, marginTop: 4 },
  byEngineCard: {
    marginTop: 8, backgroundColor: Colors.surface, borderRadius: 12,
    borderWidth: 1, borderColor: Colors.border, overflow: "hidden",
  },
  byEngineRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  byEngineName: { fontFamily: "Inter_500Medium", fontSize: 13, color: Colors.text, textTransform: "capitalize" },
  byEngineStat: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: Colors.textSecondary },
  envBannerInfo: {
    flexDirection: "row", alignItems: "flex-start", gap: 6,
    marginTop: 8, paddingHorizontal: 10, paddingVertical: 8,
    backgroundColor: Colors.accent + "18", borderRadius: 8,
    borderWidth: 1, borderColor: Colors.accent + "44",
  },
  envBannerInfoText: { fontFamily: "Inter_400Regular", fontSize: 11, color: Colors.accent, flex: 1, lineHeight: 16 },
  envBannerWarn: {
    flexDirection: "row", alignItems: "flex-start", gap: 6,
    marginTop: 8, paddingHorizontal: 10, paddingVertical: 8,
    backgroundColor: Colors.error + "18", borderRadius: 8,
    borderWidth: 1, borderColor: Colors.error + "44",
  },
  envBannerWarnText: { fontFamily: "Inter_400Regular", fontSize: 11, color: Colors.error, flex: 1, lineHeight: 16 },
});
