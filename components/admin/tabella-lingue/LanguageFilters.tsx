import React from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Platform } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

interface LanguageFiltersProps {
  searchText: string;
  onSearchChange: (text: string) => void;
  filteredCount: number;
  totalCount: number;
  totalMissing: number;
}

export const LanguageFilters: React.FC<LanguageFiltersProps> = ({
  searchText,
  onSearchChange,
  filteredCount,
  totalCount,
  totalMissing,
}) => {
  return (
    <View style={styles.topBar}>
      <View style={styles.searchContainer}>
        <MaterialIcons name="search" size={20} color={Colors.textSecondary} />
        <TextInput
          style={styles.searchInput}
          placeholder="Cerca per chiave o testo italiano..."
          placeholderTextColor={Colors.textSecondary}
          value={searchText}
          onChangeText={onSearchChange}
          clearButtonMode="while-editing"
          autoCorrect={false}
          autoCapitalize="none"
        />
        {searchText.length > 0 && Platform.OS !== "ios" ? (
          <TouchableOpacity onPress={() => onSearchChange("")}>
            <MaterialIcons name="clear" size={18} color={Colors.textSecondary} />
          </TouchableOpacity>
        ) : null}
      </View>
      <View style={styles.statsRow}>
        <Text style={styles.statsText}>
          {filteredCount} chiavi
          {searchText ? ` su ${totalCount}` : ""}
        </Text>
        {totalMissing > 0 ? (
          <View style={styles.missingBadge}>
            <Text style={styles.missingBadgeText}>{totalMissing} incompleti</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: "#FF5252" }]} />
          <Text style={styles.legendText}>Vuoto</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: "#FFC107" }]} />
          <Text style={styles.legendText}>Identico all'italiano</Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  topBar: {
    backgroundColor: Colors.surface,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border ?? "#333",
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.background,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    color: Colors.text,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    padding: 0,
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 6,
    gap: 8,
  },
  statsText: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  missingBadge: {
    backgroundColor: "#FF5252",
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  missingBadgeText: {
    color: "#fff",
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },
  legend: {
    flexDirection: "row",
    marginTop: 6,
    gap: 12,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendText: {
    color: Colors.textSecondary,
    fontSize: 11,
    fontFamily: "Inter_400Regular",
  },
});
