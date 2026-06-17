import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Alert, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useMutation } from "@tanstack/react-query";
import { getApiUrl, queryClient } from "@/lib/query-client";
import Colors from "@/constants/colors";

interface GpsNoiseFilterData {
  minDistanceM: number;
  maxStaleMs: number;
}

export function GpsNoiseFilterSection() {
  const { data, isLoading } = useQuery<GpsNoiseFilterData>({
    queryKey: ["/api/admin/settings/gps-noise-filter"],
  });

  const [minDistInput, setMinDistInput] = useState("");
  const [maxStaleInput, setMaxStaleInput] = useState("");

  useEffect(() => {
    if (data?.minDistanceM != null && minDistInput === "") {
      setMinDistInput(String(data.minDistanceM));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.minDistanceM]);

  useEffect(() => {
    if (data?.maxStaleMs != null && maxStaleInput === "") {
      setMaxStaleInput(String(data.maxStaleMs));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.maxStaleMs]);

  const mutation = useMutation({
    mutationFn: async (body: Partial<GpsNoiseFilterData>) => {
      const baseUrl = getApiUrl();
      const url = new URL("/api/admin/settings/gps-noise-filter", baseUrl);
      const res = await fetch(url.toString(), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings/gps-noise-filter"] });
      queryClient.invalidateQueries({ queryKey: ["/api/settings/gps-noise-filter"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings"] });
      Alert.alert("Salvato", "Filtro GPS aggiornato");
    },
    onError: (e: Error) => Alert.alert("Errore", e.message),
  });

  const handleSaveMinDist = () => {
    const val = parseInt(minDistInput, 10);
    if (isNaN(val) || val < 1 || val > 10000) {
      Alert.alert("Valore non valido", "Inserisci un numero intero tra 1 e 10000 m");
      setMinDistInput(String(data?.minDistanceM ?? 15));
      return;
    }
    mutation.mutate({ minDistanceM: val });
  };

  const handleSaveMaxStale = () => {
    const val = parseInt(maxStaleInput, 10);
    if (isNaN(val) || val < 1000 || val > 600000) {
      Alert.alert("Valore non valido", "Inserisci un numero tra 1000 e 600000 ms");
      setMaxStaleInput(String(data?.maxStaleMs ?? 30000));
      return;
    }
    mutation.mutate({ maxStaleMs: val });
  };

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Ionicons name="filter-outline" size={18} color={Colors.accent} />
        <Text style={styles.title}>Filtro antirumore GPS</Text>
        {isLoading && <ActivityIndicator size="small" color={Colors.accent} style={{ marginLeft: 8 }} />}
      </View>
      <Text style={styles.description}>
        Controlla la sensibilità del marcatore posizione sulla mappa. Valori più alti = meno aggiornamenti = marker più stabile.
      </Text>

      <View style={styles.row}>
        <View style={styles.field}>
          <Text style={styles.label}>Distanza minima (m)</Text>
          <Text style={styles.hint}>Default: 15 m</Text>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              value={minDistInput}
              onChangeText={setMinDistInput}
              keyboardType="numeric"
              returnKeyType="done"
              onEndEditing={handleSaveMinDist}
              onSubmitEditing={handleSaveMinDist}
              placeholder="15"
              placeholderTextColor={Colors.textSecondary}
            />
            <TouchableOpacity
              style={styles.saveBtn}
              onPress={handleSaveMinDist}
              disabled={mutation.isPending}
            >
              <Ionicons name="checkmark" size={16} color={Colors.background} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Max stale (ms)</Text>
          <Text style={styles.hint}>Default: 30000 ms</Text>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              value={maxStaleInput}
              onChangeText={setMaxStaleInput}
              keyboardType="numeric"
              returnKeyType="done"
              onEndEditing={handleSaveMaxStale}
              onSubmitEditing={handleSaveMaxStale}
              placeholder="30000"
              placeholderTextColor={Colors.textSecondary}
            />
            <TouchableOpacity
              style={styles.saveBtn}
              onPress={handleSaveMaxStale}
              disabled={mutation.isPending}
            >
              <Ionicons name="checkmark" size={16} color={Colors.background} />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 6,
  },
  title: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
    color: Colors.text,
  },
  description: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.textSecondary,
    marginBottom: 12,
    lineHeight: 18,
  },
  row: {
    flexDirection: "row",
    gap: 12,
  },
  field: {
    flex: 1,
  },
  label: {
    fontFamily: "Inter_600SemiBold",
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
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  input: {
    flex: 1,
    backgroundColor: Colors.background,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  saveBtn: {
    backgroundColor: Colors.accent,
    borderRadius: 8,
    padding: 8,
    alignItems: "center",
    justifyContent: "center",
  },
});
