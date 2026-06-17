import React from "react";
import { View, Text, TouchableOpacity, TextInput, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";

export interface Filters {
  nickname: string;
  userId: string;
  platform: string;
  dateFrom: string;
  dateTo: string;
  appVersion: string;
  onlyFailed: boolean;
  onlyRemote: boolean;
}

export const EMPTY_FILTERS: Filters = {
  nickname: "",
  userId: "",
  platform: "",
  dateFrom: "",
  dateTo: "",
  appVersion: "",
  onlyFailed: false,
  onlyRemote: false,
};

const PLATFORMS = ["", "ios", "android", "web"] as const;
const PLATFORM_LABELS: Record<string, string> = {
  "": "Tutti", ios: "iOS", android: "Android", web: "Web",
};

interface Props {
  pendingFilters: Filters;
  setPendingFilters: React.Dispatch<React.SetStateAction<Filters>>;
  applyFilters: () => void;
  resetFilters: () => void;
}

export function DiagnosticFilterPanel({ pendingFilters, setPendingFilters, applyFilters, resetFilters }: Props) {
  return (
    <View style={styles.filterPanel}>
      <Text style={styles.filterPanelTitle}>FILTRI</Text>

      <Text style={styles.filterLabel}>Nickname utente</Text>
      <TextInput
        style={styles.filterInput}
        value={pendingFilters.nickname}
        onChangeText={(v) => setPendingFilters(p => ({ ...p, nickname: v }))}
        placeholder="Cerca per nickname…"
        placeholderTextColor="#4B5563"
        autoCapitalize="none"
        autoCorrect={false}
      />

      <Text style={styles.filterLabel}>User ID (esatto)</Text>
      <TextInput
        style={styles.filterInput}
        value={pendingFilters.userId}
        onChangeText={(v) => setPendingFilters(p => ({ ...p, userId: v.trim() }))}
        placeholder="es. a1b2c3d4-…"
        placeholderTextColor="#4B5563"
        autoCapitalize="none"
        autoCorrect={false}
      />

      <Text style={styles.filterLabel}>Piattaforma</Text>
      <View style={styles.platformRow}>
        {PLATFORMS.map((p) => (
          <TouchableOpacity
            key={p || "all"}
            style={[styles.platformBtn, pendingFilters.platform === p && styles.platformBtnActive]}
            onPress={() => setPendingFilters(prev => ({ ...prev, platform: p }))}
          >
            <Text style={[styles.platformBtnText, pendingFilters.platform === p && styles.platformBtnTextActive]}>
              {PLATFORM_LABELS[p]}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.dateRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.filterLabel}>Dal (YYYY-MM-DD)</Text>
          <TextInput
            style={styles.filterInput}
            value={pendingFilters.dateFrom}
            onChangeText={(v) => setPendingFilters(p => ({ ...p, dateFrom: v }))}
            placeholder="2025-01-01"
            placeholderTextColor="#4B5563"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="numbers-and-punctuation"
          />
        </View>
        <View style={{ width: 8 }} />
        <View style={{ flex: 1 }}>
          <Text style={styles.filterLabel}>Al (YYYY-MM-DD)</Text>
          <TextInput
            style={styles.filterInput}
            value={pendingFilters.dateTo}
            onChangeText={(v) => setPendingFilters(p => ({ ...p, dateTo: v }))}
            placeholder="2025-12-31"
            placeholderTextColor="#4B5563"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="numbers-and-punctuation"
          />
        </View>
      </View>

      <Text style={styles.filterLabel}>Versione app</Text>
      <TextInput
        style={styles.filterInput}
        value={pendingFilters.appVersion}
        onChangeText={(v) => setPendingFilters(p => ({ ...p, appVersion: v }))}
        placeholder="es. 1.2.3"
        placeholderTextColor="#4B5563"
        autoCapitalize="none"
        autoCorrect={false}
      />

      <View style={styles.toggleRow}>
        <TouchableOpacity
          style={[styles.toggleBtn, pendingFilters.onlyFailed && styles.toggleBtnActive]}
          onPress={() => setPendingFilters(p => ({ ...p, onlyFailed: !p.onlyFailed }))}
        >
          <Ionicons name={pendingFilters.onlyFailed ? "checkbox" : "square-outline"} size={16} color={pendingFilters.onlyFailed ? "#EF4444" : "#6B7280"} />
          <Text style={[styles.toggleBtnText, pendingFilters.onlyFailed && { color: "#EF4444" }]}>Solo con FAIL</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.toggleBtn, pendingFilters.onlyRemote && styles.toggleBtnActive]}
          onPress={() => setPendingFilters(p => ({ ...p, onlyRemote: !p.onlyRemote }))}
        >
          <Ionicons name={pendingFilters.onlyRemote ? "checkbox" : "square-outline"} size={16} color={pendingFilters.onlyRemote ? "#7C3AED" : "#6B7280"} />
          <Text style={[styles.toggleBtnText, pendingFilters.onlyRemote && { color: "#A78BFA" }]}>Solo REMOTI</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.filterActions}>
        <TouchableOpacity style={styles.resetBtn} onPress={resetFilters}>
          <Text style={styles.resetBtnText}>Azzera</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.applyBtn} onPress={applyFilters}>
          <Text style={styles.applyBtnText}>Applica filtri</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  filterPanel: { backgroundColor: "#111827", marginHorizontal: 12, marginBottom: 8, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: "#1F2937" },
  filterPanelTitle: { color: "#6B7280", fontSize: 10, fontWeight: "700", letterSpacing: 1, textTransform: "uppercase", marginBottom: 10 },
  filterLabel: { color: "#9CA3AF", fontSize: 11, fontWeight: "600", marginBottom: 4, marginTop: 8 },
  filterInput: { backgroundColor: "#1C1C1E", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, color: "#E5E7EB", fontSize: 14, borderWidth: 1, borderColor: "#374151" },
  platformRow: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
  platformBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6, backgroundColor: "#1C1C1E", borderWidth: 1, borderColor: "#374151" },
  platformBtnActive: { backgroundColor: "#1D4ED8", borderColor: "#3B82F6" },
  platformBtnText: { color: "#9CA3AF", fontSize: 13, fontWeight: "500" },
  platformBtnTextActive: { color: "#fff" },
  dateRow: { flexDirection: "row" },
  toggleRow: { flexDirection: "row", gap: 8, marginTop: 10 },
  toggleBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, backgroundColor: "#1C1C1E", borderWidth: 1, borderColor: "#374151" },
  toggleBtnActive: { borderColor: "#4B5563" },
  toggleBtnText: { color: "#6B7280", fontSize: 12, fontWeight: "500" },
  filterActions: { flexDirection: "row", gap: 8, marginTop: 12 },
  resetBtn: { flex: 1, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: "#374151", alignItems: "center" },
  resetBtnText: { color: "#9CA3AF", fontWeight: "600", fontSize: 14 },
  applyBtn: { flex: 2, paddingVertical: 10, borderRadius: 8, backgroundColor: "#3B82F6", alignItems: "center" },
  applyBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },
});
