import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, TextInput } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

interface OtaFiltersProps {
  phase: string;
  setPhase: (v: string) => void;
  source: string;
  setSource: (v: string) => void;
  platform: string;
  setPlatform: (v: string) => void;
  updateId: string;
  setUpdateId: (v: string) => void;
  onClear: () => void;
}

export const OtaFilters: React.FC<OtaFiltersProps> = ({
  phase,
  setPhase,
  source,
  setSource,
  platform,
  setPlatform,
  updateId,
  setUpdateId,
  onClear,
}) => {
  const hasFilters = !!(phase || source || platform || updateId);

  return (
    <View style={styles.container}>
      <View style={styles.filterRow}>
        <TextInput
          style={styles.filterInput}
          placeholder="Phase…"
          placeholderTextColor={Colors.textMuted ?? "#888"}
          value={phase}
          onChangeText={setPhase}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <TextInput
          style={styles.filterInput}
          placeholder="Source…"
          placeholderTextColor={Colors.textMuted ?? "#888"}
          value={source}
          onChangeText={setSource}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>
      <View style={styles.filterRow}>
        <TextInput
          style={styles.filterInput}
          placeholder="Platform…"
          placeholderTextColor={Colors.textMuted ?? "#888"}
          value={platform}
          onChangeText={setPlatform}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <TextInput
          style={styles.filterInput}
          placeholder="Update ID…"
          placeholderTextColor={Colors.textMuted ?? "#888"}
          value={updateId}
          onChangeText={setUpdateId}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>
      {hasFilters && (
        <TouchableOpacity
          onPress={onClear}
          style={styles.clearBtn}
        >
          <Ionicons name="close-circle-outline" size={14} color="#fff" />
          <Text style={styles.clearBtnText}>Rimuovi filtri</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  filterRow: {
    flexDirection: "row",
    gap: 6,
    marginTop: 8,
  },
  filterInput: {
    flex: 1,
    backgroundColor: Colors.background,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    color: Colors.text,
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    borderWidth: 1,
    borderColor: Colors.border ?? "#333",
  },
  clearBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#555",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginTop: 4,
    marginBottom: 8,
  },
  clearBtnText: {
    color: "#fff",
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
  },
});
