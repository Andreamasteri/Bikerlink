import React, { useState } from "react";
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ActivityIndicator, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/query-client";
import { getApiUrl } from "@/lib/query-client";

interface AisConfig {
  bbox: string;
  maxVessels: string;
  status: "connected" | "connecting" | "disconnected";
  vesselCount: number;
}

const STATUS_COLOR: Record<AisConfig["status"], string> = {
  connected: "#22c55e",
  connecting: "#f59e0b",
  disconnected: "#ef4444",
};

const STATUS_LABEL: Record<AisConfig["status"], string> = {
  connected: "Connesso",
  connecting: "In connessione…",
  disconnected: "Disconnesso",
};

function parseBboxParts(raw: string): { minLat: string; minLon: string; maxLat: string; maxLon: string } {
  const parts = raw.split(",").map((s) => s.trim());
  if (parts.length === 4) {
    return { minLat: parts[0], minLon: parts[1], maxLat: parts[2], maxLon: parts[3] };
  }
  return { minLat: "", minLon: "", maxLat: "", maxLon: "" };
}

function joinBbox(parts: { minLat: string; minLon: string; maxLat: string; maxLon: string }): string {
  const { minLat, minLon, maxLat, maxLon } = parts;
  if (!minLat && !minLon && !maxLat && !maxLon) return "";
  return `${minLat},${minLon},${maxLat},${maxLon}`;
}

export function AisSection() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<AisConfig>({
    queryKey: ["/api/admin/settings/ais-config"],
    refetchInterval: 30_000,
  });

  const remoteParts = parseBboxParts(data?.bbox ?? "");

  const [minLat, setMinLat] = useState<string | null>(null);
  const [minLon, setMinLon] = useState<string | null>(null);
  const [maxLat, setMaxLat] = useState<string | null>(null);
  const [maxLon, setMaxLon] = useState<string | null>(null);
  const [maxVesselsInput, setMaxVesselsInput] = useState<string | null>(null);

  const effectiveMinLat = minLat !== null ? minLat : remoteParts.minLat;
  const effectiveMinLon = minLon !== null ? minLon : remoteParts.minLon;
  const effectiveMaxLat = maxLat !== null ? maxLat : remoteParts.maxLat;
  const effectiveMaxLon = maxLon !== null ? maxLon : remoteParts.maxLon;
  const maxVessels = maxVesselsInput !== null ? maxVesselsInput : (data?.maxVessels ?? "2000");

  const bboxDirty = minLat !== null || minLon !== null || maxLat !== null || maxLon !== null;
  const isDirty = bboxDirty || maxVesselsInput !== null;

  const mutation = useMutation({
    mutationFn: async () => {
      const body: { bbox?: string; maxVessels?: number } = {};
      if (bboxDirty) {
        const parts = [effectiveMinLat, effectiveMinLon, effectiveMaxLat, effectiveMaxLon];
        const filled = parts.filter((p) => p.trim() !== "");
        if (filled.length !== 0 && filled.length !== 4) {
          throw new Error("Inserisci tutti e 4 i valori della bbox oppure lascia tutto vuoto.");
        }
        body.bbox = joinBbox({
          minLat: effectiveMinLat,
          minLon: effectiveMinLon,
          maxLat: effectiveMaxLat,
          maxLon: effectiveMaxLon,
        });
      }
      if (maxVesselsInput !== null) {
        const n = parseInt(maxVesselsInput, 10);
        if (!Number.isFinite(n) || n < 1) throw new Error("Max navi non valido");
        body.maxVessels = n;
      }
      await apiRequest("PUT", `${getApiUrl()}/api/admin/settings/ais-config`, body);
    },
    onSuccess: () => {
      setMinLat(null);
      setMinLon(null);
      setMaxLat(null);
      setMaxLon(null);
      setMaxVesselsInput(null);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings/ais-config"] });
      Alert.alert("AIS", "Configurazione salvata e WebSocket riconnesso.");
    },
    onError: (err: Error) => {
      Alert.alert("Errore", err.message ?? "Impossibile salvare la configurazione AIS.");
    },
  });

  const reconnectMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", `${getApiUrl()}/api/admin/settings/ais-reconnect`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings/ais-config"] });
    },
    onError: (err: Error) => {
      Alert.alert("Errore", err.message ?? "Impossibile riconnettere AIS.");
    },
  });

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Ionicons name="boat-outline" size={20} color="#0ea5e9" />
          <Text style={styles.title}>AIS Stream</Text>
        </View>
        <View style={styles.headerRight}>
          {data && (
            <View style={styles.statusBadge}>
              <View style={[styles.statusDot, { backgroundColor: STATUS_COLOR[data.status] }]} />
              <Text style={[styles.statusText, { color: STATUS_COLOR[data.status] }]}>
                {STATUS_LABEL[data.status]}
              </Text>
            </View>
          )}
        </View>
      </View>

      {data && (
        <View style={styles.statsRow}>
          <Ionicons name="navigate-outline" size={13} color={Colors.textSecondary} />
          <Text style={styles.statText}>
            {data.vesselCount} {data.vesselCount === 1 ? "nave" : "navi"} in cache
          </Text>
          <TouchableOpacity
            style={styles.reconnectBtn}
            onPress={() => reconnectMutation.mutate()}
            disabled={reconnectMutation.isPending}
          >
            {reconnectMutation.isPending ? (
              <ActivityIndicator size="small" color="#0ea5e9" style={{ marginRight: 4 }} />
            ) : (
              <Ionicons name="refresh-outline" size={13} color="#0ea5e9" />
            )}
            <Text style={styles.reconnectText}>Riconnetti</Text>
          </TouchableOpacity>
        </View>
      )}

      <Text style={styles.desc}>
        Configura il bounding box AIS e il numero massimo di navi in cache. Il WebSocket si riconnette
        automaticamente al salvataggio. Contatore aggiornato ogni 30s.
      </Text>

      {isLoading ? (
        <ActivityIndicator size="small" color={Colors.textSecondary} style={{ marginTop: 12 }} />
      ) : (
        <>
          <View style={styles.field}>
            <Text style={styles.label}>Bounding Box</Text>
            <Text style={styles.hint}>Lascia tutti i campi vuoti per usare il default (Mediterraneo).</Text>
            <View style={styles.bboxGrid}>
              <View style={styles.bboxCell}>
                <Text style={styles.bboxLabel}>minLat</Text>
                <TextInput
                  style={styles.input}
                  value={effectiveMinLat}
                  onChangeText={setMinLat}
                  placeholder="es. 35.0"
                  placeholderTextColor={Colors.textSecondary}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="default"
                />
              </View>
              <View style={styles.bboxCell}>
                <Text style={styles.bboxLabel}>minLon</Text>
                <TextInput
                  style={styles.input}
                  value={effectiveMinLon}
                  onChangeText={setMinLon}
                  placeholder="es. -10.0"
                  placeholderTextColor={Colors.textSecondary}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="default"
                />
              </View>
              <View style={styles.bboxCell}>
                <Text style={styles.bboxLabel}>maxLat</Text>
                <TextInput
                  style={styles.input}
                  value={effectiveMaxLat}
                  onChangeText={setMaxLat}
                  placeholder="es. 47.0"
                  placeholderTextColor={Colors.textSecondary}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="default"
                />
              </View>
              <View style={styles.bboxCell}>
                <Text style={styles.bboxLabel}>maxLon</Text>
                <TextInput
                  style={styles.input}
                  value={effectiveMaxLon}
                  onChangeText={setMaxLon}
                  placeholder="es. 42.0"
                  placeholderTextColor={Colors.textSecondary}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="default"
                />
              </View>
            </View>
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Max navi in cache</Text>
            <TextInput
              style={styles.input}
              value={maxVessels}
              onChangeText={setMaxVesselsInput}
              placeholder="2000"
              placeholderTextColor={Colors.textSecondary}
              keyboardType="number-pad"
            />
          </View>

          <TouchableOpacity
            style={[styles.saveBtn, !isDirty && styles.saveBtnDisabled]}
            onPress={() => mutation.mutate()}
            disabled={!isDirty || mutation.isPending}
          >
            {mutation.isPending ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.saveBtnText}>Salva e riconnetti</Text>
            )}
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  title: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
    color: Colors.text,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: "rgba(0,0,0,0.04)",
    borderRadius: 20,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  statusText: {
    fontFamily: "Inter_500Medium",
    fontSize: 11,
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginBottom: 10,
  },
  statText: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
    flex: 1,
  },
  reconnectBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#0ea5e9",
  },
  reconnectText: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    color: "#0ea5e9",
  },
  desc: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
    lineHeight: 17,
    marginBottom: 14,
  },
  field: {
    marginBottom: 12,
  },
  label: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    color: Colors.text,
    marginBottom: 2,
  },
  hint: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: Colors.textSecondary,
    marginBottom: 6,
  },
  bboxGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  bboxCell: {
    flex: 1,
    minWidth: "45%",
  },
  bboxLabel: {
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    color: Colors.textSecondary,
    marginBottom: 2,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  input: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.text,
    backgroundColor: "rgba(0,0,0,0.02)",
  },
  saveBtn: {
    backgroundColor: "#0ea5e9",
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: "center",
    marginTop: 4,
  },
  saveBtnDisabled: {
    opacity: 0.45,
  },
  saveBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: "#fff",
  },
});
