import React, { useState, useCallback } from "react";
import { View, Text, TouchableOpacity, Alert, ActivityIndicator, StyleSheet } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTheme } from "@/lib/theme-context";
import { apiRequest } from "@/lib/query-client";

interface EmcyRelease {
  id: string;
  easUpdateId: string;
  otaVersion: string | null;
  status: string;
  message: string | null;
  publishedAt: string;
}

interface EmcyStatus {
  active: boolean;
  releases: EmcyRelease[];
}

const EMCY_QUERY_KEY = ["/api/admin/ota/emergency/status"];

export default function OtaPanelExtra() {
  const { colors } = useTheme();
  const qc = useQueryClient();
  const [pruning, setPruning] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);

  const { data: emcy, isLoading: emcyLoading } = useQuery<EmcyStatus>({
    queryKey: EMCY_QUERY_KEY,
  });

  const handlePrune = useCallback(() => {
    Alert.alert(
      "Archivia vecchie OTA",
      "Archivia le release rifiutate e le release pending obsolete più vecchie della baseline approvata (o le meno recenti se non esiste ancora una release approvata).\n\nSolo release con telemetria zero vengono archiviate. Le release archiviate non appaiono nel pannello ma non vengono eliminate.",
      [
        { text: "Annulla", style: "cancel" },
        {
          text: "Archivia",
          style: "destructive",
          onPress: async () => {
            setPruning(true);
            try {
              const res = await apiRequest("POST", "/api/admin/ota/prune");
              const result = await res.json() as { ok: boolean; archivedRejected: number; archivedOldPending: number };
              await qc.invalidateQueries({ queryKey: ["/api/admin/ota/releases"] });
              Alert.alert(
                "Archiviazione completata",
                `Archiviate: ${result.archivedRejected} rifiutate + ${result.archivedOldPending} pending obsolete.`
              );
            } catch (err: unknown) {
              Alert.alert("Errore", err instanceof Error ? err.message : "Impossibile eseguire l'archiviazione");
            } finally {
              setPruning(false);
            }
          },
        },
      ]
    );
  }, [qc]);

  const doToggle = useCallback(async (next: boolean) => {
    setToggling(true);
    try {
      await apiRequest("POST", "/api/admin/ota/emergency/toggle", { active: next });
      await qc.invalidateQueries({ queryKey: EMCY_QUERY_KEY });
      Alert.alert(
        next ? "Redirect EMCY attivato" : "Redirect EMCY disattivato",
        next
          ? "Tutti i device riceveranno l'ultima release EMCY approvata al prossimo controllo OTA."
          : "Il manifest è tornato al canale production normale."
      );
    } catch (err: unknown) {
      Alert.alert("Errore", err instanceof Error ? err.message : "Impossibile aggiornare il redirect EMCY");
    } finally {
      setToggling(false);
    }
  }, [qc]);

  const handleToggle = useCallback(() => {
    const next = !(emcy?.active ?? false);
    Alert.alert(
      next ? "Attivare il redirect EMCY?" : "Disattivare il redirect EMCY?",
      next
        ? "⚠️ ATTENZIONE: tutti i device passeranno al canale di emergenza. Usa solo se la production è rotta."
        : "I device torneranno a ricevere le OTA normali dal canale production.",
      [
        { text: "Annulla", style: "cancel" },
        { text: next ? "Attiva EMCY" : "Disattiva", style: next ? "destructive" : "default", onPress: () => { void doToggle(next); } },
      ]
    );
  }, [emcy?.active, doToggle]);

  const handleReleaseAction = useCallback((rel: EmcyRelease, action: "approve" | "reject") => {
    Alert.alert(
      action === "approve" ? "Approvare la release EMCY?" : "Revocare la release EMCY?",
      `${rel.otaVersion ?? rel.easUpdateId.slice(0, 8)} — ${rel.message ?? "(nessun messaggio)"}`,
      [
        { text: "Annulla", style: "cancel" },
        {
          text: action === "approve" ? "Approva" : "Revoca",
          style: action === "approve" ? "default" : "destructive",
          onPress: async () => {
            setActingId(rel.id);
            try {
              await apiRequest("POST", `/api/admin/ota/${rel.id}/${action}`);
              await qc.invalidateQueries({ queryKey: EMCY_QUERY_KEY });
              await qc.invalidateQueries({ queryKey: ["/api/admin/ota/releases"] });
            } catch (err: unknown) {
              Alert.alert("Errore", err instanceof Error ? err.message : "Operazione non riuscita");
            } finally {
              setActingId(null);
            }
          },
        },
      ]
    );
  }, [qc]);

  const active = emcy?.active ?? false;
  const releases = emcy?.releases ?? [];

  return (
    <View style={styles.outer}>
      {/* ── Canale Emergenza (EMCY) ─────────────────────────────────── */}
      <View style={styles.container}>
        <Text style={[styles.label, { color: colors.textSecondary }]}>
          Canale Emergenza (EMCY)
        </Text>

        {active && (
          <View style={[styles.banner, { backgroundColor: "#7f1d1d", borderColor: "#ef4444" }]}>
            <Text style={styles.bannerText}>
              🚨 REDIRECT EMCY ATTIVO — tutti i device ricevono il canale emergency
            </Text>
          </View>
        )}

        <TouchableOpacity
          style={[
            styles.toggleBtn,
            { borderColor: active ? "#ef4444" : colors.border, backgroundColor: active ? "rgba(239,68,68,0.12)" : colors.surface },
          ]}
          onPress={handleToggle}
          disabled={toggling}
          testID="emcy-toggle"
        >
          {toggling
            ? <ActivityIndicator size="small" color={active ? "#ef4444" : colors.textSecondary} />
            : <Text style={[styles.toggleBtnText, { color: active ? "#ef4444" : colors.text }]}>
                {active ? "🛑 Disattiva redirect EMCY" : "🚨 Attiva redirect EMCY"}
              </Text>}
        </TouchableOpacity>

        <Text style={[styles.hint, { color: colors.textSecondary }]}>
          Le release EMCY si pubblicano da shell con{"\n"}
          bash scripts/publish-ota-emcy.sh (bundle da commit specifico).{"\n"}
          Qui le approvi e attivi il redirect.
        </Text>

        {emcyLoading ? (
          <ActivityIndicator size="small" color={colors.textSecondary} style={{ marginTop: 12 }} />
        ) : releases.length === 0 ? (
          <Text style={[styles.empty, { color: colors.textSecondary }]}>
            Nessuna release sul canale emergency.
          </Text>
        ) : (
          releases.map((rel) => (
            <View key={rel.id} style={[styles.relCard, { borderColor: colors.border, backgroundColor: colors.surface }]}>
              <View style={styles.relHeader}>
                <Text style={[styles.relVersion, { color: colors.text }]} numberOfLines={1}>
                  {rel.otaVersion ?? rel.easUpdateId.slice(0, 12)}
                </Text>
                <Text style={[styles.relStatus, { color: statusColor(rel.status) }]}>
                  {rel.status.toUpperCase()}
                </Text>
              </View>
              {rel.message ? (
                <Text style={[styles.relMsg, { color: colors.textSecondary }]} numberOfLines={2}>
                  {rel.message}
                </Text>
              ) : null}
              {rel.status === "pending" && (
                <View style={styles.relActions}>
                  <TouchableOpacity
                    style={[styles.relBtn, { borderColor: "#22c55e" }]}
                    onPress={() => handleReleaseAction(rel, "approve")}
                    disabled={actingId === rel.id}
                  >
                    {actingId === rel.id
                      ? <ActivityIndicator size="small" color="#22c55e" />
                      : <Text style={[styles.relBtnText, { color: "#22c55e" }]}>Approva</Text>}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.relBtn, { borderColor: "#ef4444" }]}
                    onPress={() => handleReleaseAction(rel, "reject")}
                    disabled={actingId === rel.id}
                  >
                    <Text style={[styles.relBtnText, { color: "#ef4444" }]}>Revoca</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          ))
        )}
      </View>

      {/* ── Manutenzione DB OTA ─────────────────────────────────────── */}
      <View style={styles.container}>
        <Text style={[styles.label, { color: colors.textSecondary }]}>
          Manutenzione DB OTA
        </Text>
        <TouchableOpacity
          style={[styles.pruneBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
          onPress={handlePrune}
          disabled={pruning}
        >
          {pruning
            ? <ActivityIndicator size="small" color={colors.textSecondary} />
            : <Text style={[styles.pruneBtnText, { color: colors.textSecondary }]}>🗄 Archivia vecchie OTA</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
}

function statusColor(status: string): string {
  switch (status) {
    case "approved": return "#22c55e";
    case "pending": return "#f59e0b";
    case "rejected": return "#ef4444";
    default: return "#9ca3af";
  }
}

const styles = StyleSheet.create({
  outer: {
    alignSelf: "stretch",
  },
  container: {
    marginTop: 24,
    paddingTop: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(128,128,128,0.2)",
    alignItems: "flex-start",
    alignSelf: "stretch",
  },
  label: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  banner: {
    alignSelf: "stretch",
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 10,
  },
  bannerText: {
    color: "#fecaca",
    fontSize: 12,
    fontWeight: "700",
  },
  toggleBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "stretch",
    justifyContent: "center",
  },
  toggleBtnText: {
    fontSize: 14,
    fontWeight: "600",
  },
  hint: {
    fontSize: 11,
    marginTop: 8,
    lineHeight: 16,
  },
  empty: {
    fontSize: 12,
    marginTop: 12,
    fontStyle: "italic",
  },
  relCard: {
    alignSelf: "stretch",
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginTop: 10,
  },
  relHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  relVersion: {
    fontSize: 13,
    fontWeight: "700",
    flex: 1,
    marginRight: 8,
  },
  relStatus: {
    fontSize: 11,
    fontWeight: "700",
  },
  relMsg: {
    fontSize: 12,
    marginTop: 6,
  },
  relActions: {
    flexDirection: "row",
    marginTop: 10,
    gap: 8,
  },
  relBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
  },
  relBtnText: {
    fontSize: 13,
    fontWeight: "600",
  },
  pruneBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
  },
  pruneBtnText: {
    fontSize: 13,
    fontWeight: "500",
  },
});
