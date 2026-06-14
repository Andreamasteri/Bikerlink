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

export function AisSection() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<AisConfig>({
    queryKey: ["/api/admin/settings/ais-config"],
    refetchInterval: 10_000,
  });

  const [bboxInput, setBboxInput] = useState<string | null>(null);
  const [maxVesselsInput, setMaxVesselsInput] = useState<string | null>(null);

  const bbox = bboxInput !== null ? bboxInput : (data?.bbox ?? "");
  const maxVessels = maxVesselsInput !== null ? maxVesselsInput : (data?.maxVessels ?? "2000");

  const mutation = useMutation({
    mutationFn: async () => {
      const body: { bbox?: string; maxVessels?: number } = {};
      if (bboxInput !== null) body.bbox = bboxInput.trim();
      if (maxVesselsInput !== null) {
        const n = parseInt(maxVesselsInput, 10);
        if (!Number.isFinite(n) || n < 1) throw new Error("Max navi non valido");
        body.maxVessels = n;
      }
      await apiRequest("PUT", `${getApiUrl()}/api/admin/settings/ais-config`, body);
    },
    onSuccess: () => {
      setBboxInput(null);
      setMaxVesselsInput(null);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings/ais-config"] });
      Alert.alert("AIS", "Configurazione salvata e WebSocket riconnesso.");
    },
    onError: (err: Error) => {
      Alert.alert("Errore", err.message ?? "Impossibile salvare la configurazione AIS.");
    },
  });

  const isDirty = bboxInput !== null || maxVesselsInput !== null;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Ionicons name="boat-outline" size={20} color="#0ea5e9" />
          <Text style={styles.title}>AIS Stream</Text>
        </View>
        {data && (
          <View style={styles.statusBadge}>
            <View style={[styles.statusDot, { backgroundColor: STATUS_COLOR[data.status] }]} />
            <Text style={[styles.statusText, { color: STATUS_COLOR[data.status] }]}>
              {STATUS_LABEL[data.status]}
            </Text>
          </View>
        )}
      </View>

      <Text style={styles.desc}>
        Configura il bounding box AIS e il numero massimo di navi in cache. Il WebSocket si riconnette
        automaticamente al salvataggio, senza riavviare il server.
      </Text>

      {isLoading ? (
        <ActivityIndicator size="small" color={Colors.textSecondary} style={{ marginTop: 12 }} />
      ) : (
        <>
          <View style={styles.field}>
            <Text style={styles.label}>Bounding Box</Text>
            <Text style={styles.hint}>Formato: minLat,minLon,maxLat,maxLon (vuoto = globale)</Text>
            <TextInput
              style={styles.input}
              value={bbox}
              onChangeText={setBboxInput}
              placeholder="es. 35.0,6.0,47.0,18.5"
              placeholderTextColor={Colors.textSecondary}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="default"
            />
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
    marginBottom: 8,
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
    marginBottom: 4,
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
