import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { getApiUrl, authFetchHeaders } from "@/lib/query-client";

interface TelemetryAdminStats {
  users_with_telemetry: number;
  total_rides: number;
  total_samples: number;
  total_km: number;
  avg_km_per_user: number;
  target_km: number;
}

async function adminFetch(path: string): Promise<Response> {
  const res = await fetch(new URL(path, getApiUrl()).toString(), {
    headers: { ...(await authFetchHeaders()) },
    credentials: "include",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res;
}

function StatCard({
  label,
  value,
  icon,
  color,
}: {
  label: string;
  value: string | number;
  icon: string;
  color?: string;
}) {
  const c = color ?? Colors.accent;
  return (
    <View style={[styles.statCard, { borderLeftColor: c }]}>
      <MaterialCommunityIcons name={icon as any} size={20} color={c} />
      <View style={styles.statCardText}>
        <Text style={styles.statValue}>{value}</Text>
        <Text style={styles.statLabel}>{label}</Text>
      </View>
    </View>
  );
}

export default function AdminTelemetryScreen() {
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const [targetInput, setTargetInput] = useState<string>("");
  const [saving, setSaving] = useState(false);

  const { data: stats, isLoading, error, refetch } = useQuery<TelemetryAdminStats>({
    queryKey: ["/api/admin/telemetry-stats"],
    queryFn: () => adminFetch("/api/admin/telemetry-stats").then((r) => r.json()),
    staleTime: 30_000,
    onSuccess: (d) => {
      if (!targetInput) setTargetInput(String(d.target_km));
    },
  });

  const handleSaveTarget = async () => {
    const val = parseInt(targetInput, 10);
    if (!Number.isFinite(val) || val < 10 || val > 100000) {
      Alert.alert("Errore", "Inserisci un valore tra 10 e 100.000 km.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(
        new URL("/api/admin/telemetry-target-km", getApiUrl()).toString(),
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            ...(await authFetchHeaders()),
          },
          credentials: "include",
          body: JSON.stringify({ target_km: val }),
        }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await refetch();
      qc.invalidateQueries({ queryKey: ["/api/admin/telemetry-stats"] });
      Alert.alert("Salvato", `Nuovo obiettivo: ${val} km`);
    } catch {
      Alert.alert("Errore", "Impossibile aggiornare l'obiettivo.");
    } finally {
      setSaving(false);
    }
  };

  const progressPct = stats
    ? Math.min(100, Math.round((stats.total_km / stats.target_km) * 100))
    : 0;

  return (
    <ScrollView
      style={[styles.container, { paddingTop: insets.top }]}
      contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
    >
      <View style={styles.header}>
        <MaterialCommunityIcons name="chart-line" size={22} color={Colors.accent} />
        <Text style={styles.headerTitle}>Dati Telemetria</Text>
      </View>
      <Text style={styles.headerSub}>
        Campioni GPS + sensori raccolti al termine di ogni giro
      </Text>

      {isLoading && (
        <ActivityIndicator style={{ marginTop: 32 }} color={Colors.accent} />
      )}
      {error && (
        <Text style={styles.errorText}>Errore nel caricamento stats</Text>
      )}

      {stats && (
        <>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Riepilogo globale</Text>
            <View style={styles.statsGrid}>
              <StatCard
                label="Utenti con dati"
                value={stats.users_with_telemetry}
                icon="account-group"
                color="#3b82f6"
              />
              <StatCard
                label="Giri registrati"
                value={stats.total_rides}
                icon="map-marker-path"
                color="#8b5cf6"
              />
              <StatCard
                label="Campioni totali"
                value={stats.total_samples.toLocaleString("it-IT")}
                icon="crosshairs-gps"
                color="#f59e0b"
              />
              <StatCard
                label="Km totali raccolti"
                value={`${stats.total_km.toLocaleString("it-IT", { maximumFractionDigits: 0 })} km`}
                icon="road-variant"
                color="#22c55e"
              />
              <StatCard
                label="Media km / utente"
                value={`${stats.avg_km_per_user.toFixed(1)} km`}
                icon="account-arrow-right"
                color="#06b6d4"
              />
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Progresso collettivo</Text>
            <Text style={styles.progressNote}>
              {progressPct}% dell'obiettivo di {stats.target_km} km raggiunto a livello globale
            </Text>
            <View style={styles.progressBg}>
              <View
                style={[
                  styles.progressFill,
                  {
                    width: `${Math.min(progressPct, 100)}%` as `${number}%`,
                    backgroundColor: progressPct >= 100 ? "#22c55e" : Colors.accent,
                  },
                ]}
              />
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Configurazione soglia</Text>
            <Text style={styles.settingDesc}>
              Km necessari per sbloccare i percorsi personalizzati (attualmente:{" "}
              <Text style={{ color: Colors.accent, fontFamily: "Inter_700Bold" }}>
                {stats.target_km} km
              </Text>
              ).
            </Text>
            <View style={styles.inputRow}>
              <TextInput
                style={styles.input}
                value={targetInput}
                onChangeText={setTargetInput}
                keyboardType="numeric"
                placeholder="es. 400"
                placeholderTextColor={Colors.textSecondary}
                returnKeyType="done"
                onSubmitEditing={handleSaveTarget}
              />
              <Text style={styles.inputSuffix}>km</Text>
              <TouchableOpacity
                style={[styles.saveBtn, saving && { opacity: 0.6 }]}
                onPress={handleSaveTarget}
                disabled={saving}
                activeOpacity={0.8}
              >
                {saving ? (
                  <ActivityIndicator size="small" color="#000" />
                ) : (
                  <Ionicons name="checkmark" size={18} color="#000" />
                )}
                <Text style={styles.saveBtnText}>Salva</Text>
              </TouchableOpacity>
            </View>
          </View>
        </>
      )}

      <TouchableOpacity
        style={styles.refreshBtn}
        onPress={() => refetch()}
        activeOpacity={0.8}
      >
        <Ionicons name="refresh" size={16} color={Colors.accent} />
        <Text style={[styles.refreshText, { color: Colors.accent }]}>Aggiorna</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    paddingHorizontal: 16,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 12,
    marginBottom: 4,
  },
  headerTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 22,
    color: Colors.text,
  },
  headerSub: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.textSecondary,
    marginBottom: 20,
    lineHeight: 18,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
    color: Colors.text,
    marginBottom: 12,
  },
  statsGrid: {
    gap: 10,
  },
  statCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: Colors.surface,
    borderRadius: 10,
    padding: 14,
    borderLeftWidth: 4,
  },
  statCardText: {
    flex: 1,
  },
  statValue: {
    fontFamily: "Inter_700Bold",
    fontSize: 18,
    color: Colors.text,
  },
  statLabel: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  progressNote: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.textSecondary,
    marginBottom: 8,
  },
  progressBg: {
    height: 10,
    backgroundColor: Colors.border,
    borderRadius: 5,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 5,
  },
  settingDesc: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.textSecondary,
    marginBottom: 12,
    lineHeight: 18,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  input: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 12,
    fontFamily: "Inter_400Regular",
    fontSize: 15,
    color: Colors.text,
  },
  inputSuffix: {
    fontFamily: "Inter_500Medium",
    fontSize: 14,
    color: Colors.textSecondary,
  },
  saveBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: Colors.accent,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  saveBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: "#000",
  },
  refreshBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 8,
  },
  refreshText: {
    fontFamily: "Inter_500Medium",
    fontSize: 14,
  },
  errorText: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: "#ef4444",
    textAlign: "center",
    marginTop: 32,
  },
});
