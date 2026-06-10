import React from "react";
import { View, Text, StyleSheet, TextInput, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

interface UserFiltersProps {
  searchText: string;
  onSearchChange: (text: string) => void;
  hideFake: boolean;
  onToggleHideFake: () => void;
  filterNotMatchable: boolean;
  onToggleNotMatchable: () => void;
  t: (key: string) => string;
}

export const UserFilters: React.FC<UserFiltersProps> = ({
  searchText,
  onSearchChange,
  hideFake,
  onToggleHideFake,
  filterNotMatchable,
  onToggleNotMatchable,
  t,
}) => {
  return (
    <>
      <View style={styles.searchRow}>
        <TouchableOpacity 
          onPress={onToggleHideFake} 
          style={styles.fakeToggle}
        >
          <Text style={styles.fakeToggleText}>
            {hideFake ? "Mostra Fake" : "Nascondi Fake"}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={onToggleNotMatchable}
          style={[styles.fakeToggle, filterNotMatchable && styles.activeToggle]}
        >
          <Text style={[styles.fakeToggleText, filterNotMatchable && styles.activeToggleText]}>
            {filterNotMatchable ? "✗ Solo non matchabili" : "Tutti"}
          </Text>
        </TouchableOpacity>
      </View>
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color={Colors.textSecondary} />
        <TextInput
          style={styles.searchInput}
          placeholder={t("common.search")}
          placeholderTextColor={Colors.textSecondary}
          value={searchText}
          onChangeText={onSearchChange}
        />
        {searchText.length > 0 && (
          <TouchableOpacity onPress={() => onSearchChange("")}>
            <Ionicons name="close-circle" size={20} color={Colors.textSecondary} />
          </TouchableOpacity>
        )}
      </View>
    </>
  );
};

const styles = StyleSheet.create({
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
    gap: 8,
  },
  fakeToggle: {
    backgroundColor: Colors.surface,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  fakeToggleText: {
    fontFamily: "Inter_500Medium",
    fontSize: 11,
    color: Colors.textSecondary,
  },
  activeToggle: {
    backgroundColor: Colors.error + "22",
    borderColor: Colors.error,
  },
  activeToggleText: {
    color: Colors.error,
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surface,
    margin: 16,
    marginBottom: 8,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: Colors.text,
  },
});
