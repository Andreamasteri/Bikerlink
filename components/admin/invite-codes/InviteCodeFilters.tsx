import React from "react";
import { View, Text, StyleSheet, TextInput, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

interface InviteCodeFiltersProps {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  showActiveOnly: boolean;
  setShowActiveOnly: (active: boolean) => void;
  t: (key: string) => string;
}

export function InviteCodeFilters({
  searchQuery,
  setSearchQuery,
  showActiveOnly,
  setShowActiveOnly,
  t,
}: InviteCodeFiltersProps) {
  return (
    <View style={styles.container}>
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color={Colors.textSecondary} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Cerca codice o label..."
          placeholderTextColor={Colors.textSecondary}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery("")}>
            <Ionicons name="close-circle" size={20} color={Colors.textSecondary} />
          </TouchableOpacity>
        )}
      </View>
      <TouchableOpacity
        style={[styles.filterChip, showActiveOnly && styles.filterChipActive]}
        onPress={() => setShowActiveOnly(!showActiveOnly)}
      >
        <Ionicons
          name={showActiveOnly ? "checkmark-circle" : "ellipse-outline"}
          size={18}
          color={showActiveOnly ? Colors.background : Colors.textSecondary}
        />
        <Text style={[styles.filterChipText, showActiveOnly && styles.filterChipTextActive]}>
          Solo attivi
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingBottom: 8,
    gap: 12,
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surface,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 44,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: Colors.text,
  },
  filterChip: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: Colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 6,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  filterChipActive: {
    backgroundColor: Colors.accent,
    borderColor: Colors.accent,
  },
  filterChipText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: Colors.textSecondary,
  },
  filterChipTextActive: {
    color: Colors.background,
  },
});
