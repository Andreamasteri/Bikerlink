import React from "react";
import { View, Text, StyleSheet, TextInput, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { CrashType } from "./CrashLogTypes";

export const TYPE_FILTERS: { label: string; value: "" | CrashType }[] = [
  { label: "Tutti", value: "" },
  { label: "Sistema", value: "crash_system" },
  { label: "JS Error", value: "crash_js" },
];

interface CrashLogFiltersProps {
  filterType: "" | CrashType;
  setFilterType: (val: "" | CrashType) => void;
  filterUser: string;
  setFilterUser: (val: string) => void;
  filterVersion: string;
  setFilterVersion: (val: string) => void;
  filterDateFrom: string;
  setFilterDateFrom: (val: string) => void;
  filterDateTo: string;
  setFilterDateTo: (val: string) => void;
  filterDevice: string;
  setFilterDevice: (val: string) => void;
  showFilters: boolean;
  setShowFilters: (val: boolean | ((v: boolean) => boolean)) => void;
  resetFilters: () => void;
  setPage: (val: number) => void;
}

export function CrashLogFilters({
  filterType,
  setFilterType,
  filterUser,
  setFilterUser,
  filterVersion,
  setFilterVersion,
  filterDateFrom,
  setFilterDateFrom,
  filterDateTo,
  setFilterDateTo,
  filterDevice,
  setFilterDevice,
  showFilters,
  setShowFilters,
  resetFilters,
  setPage,
}: CrashLogFiltersProps) {
  const colors = useColors();
  const hasActiveFilters = !!(filterUser.trim() || filterVersion.trim() || filterDateFrom.trim() || filterDateTo.trim() || filterDevice.trim());

  return (
    <View>
      <View style={[styles.typeBar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        {TYPE_FILTERS.map((f) => (
          <TouchableOpacity
            key={f.value}
            style={[
              styles.typeBtn,
              filterType === f.value && { backgroundColor: colors.accent + "22" },
            ]}
            onPress={() => { setFilterType(f.value); setPage(1); }}
          >
            <Text style={[styles.typeBtnText, { color: filterType === f.value ? colors.accent : colors.textSecondary }]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity
          style={[
            styles.typeBtn,
            showFilters && { backgroundColor: colors.accent + "22" },
            { marginLeft: "auto" },
          ]}
          onPress={() => setShowFilters((v) => !v)}
        >
          <Ionicons
            name={hasActiveFilters ? "filter" : "filter-outline"}
            size={16}
            color={hasActiveFilters ? colors.accent : colors.textSecondary}
          />
        </TouchableOpacity>
      </View>

      {showFilters && (
        <View style={[styles.filtersPanel, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.filterRow}>
            <Text style={[styles.filterLabel, { color: colors.textSecondary }]}>Dispositivo</Text>
            <TextInput
              style={[styles.filterInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
              value={filterDevice}
              onChangeText={(v) => { setFilterDevice(v); setPage(1); }}
              placeholder="es. Xiaomi, Samsung, Redmi…"
              placeholderTextColor={colors.textSecondary}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
          <View style={styles.filterRow}>
            <Text style={[styles.filterLabel, { color: colors.textSecondary }]}>User ID</Text>
            <TextInput
              style={[styles.filterInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
              value={filterUser}
              onChangeText={(v) => { setFilterUser(v); setPage(1); }}
              placeholder="es. abc123..."
              placeholderTextColor={colors.textSecondary}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
          <View style={styles.filterRow}>
            <Text style={[styles.filterLabel, { color: colors.textSecondary }]}>Versione</Text>
            <TextInput
              style={[styles.filterInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
              value={filterVersion}
              onChangeText={(v) => { setFilterVersion(v); setPage(1); }}
              placeholder="es. 1.2.3"
              placeholderTextColor={colors.textSecondary}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
          <View style={styles.filterRow}>
            <Text style={[styles.filterLabel, { color: colors.textSecondary }]}>Da</Text>
            <TextInput
              style={[styles.filterInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
              value={filterDateFrom}
              onChangeText={(v) => { setFilterDateFrom(v); setPage(1); }}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={colors.textSecondary}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
          <View style={styles.filterRow}>
            <Text style={[styles.filterLabel, { color: colors.textSecondary }]}>A</Text>
            <TextInput
              style={[styles.filterInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
              value={filterDateTo}
              onChangeText={(v) => { setFilterDateTo(v); setPage(1); }}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={colors.textSecondary}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
          {hasActiveFilters && (
            <TouchableOpacity onPress={resetFilters} style={styles.resetBtn}>
              <Text style={{ color: colors.accent, fontFamily: "Inter_600SemiBold", fontSize: 13 }}>
                Azzera filtri
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  typeBar: {
    flexDirection: "row",
    gap: 4,
    padding: 10,
    borderBottomWidth: 1,
    alignItems: "center",
  },
  typeBtn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20 },
  typeBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 13 },
  filtersPanel: {
    borderBottomWidth: 1,
    padding: 12,
    gap: 10,
  },
  filterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  filterLabel: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    width: 70,
  },
  filterInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    fontFamily: "Inter_400Regular",
    fontSize: 13,
  },
  resetBtn: {
    alignSelf: "flex-end",
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
});
