import React from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Platform, ScrollView } from "react-native";
import { MaterialIcons, MaterialCommunityIcons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

const TABLE_LANGS = [
  { code: "en", label: "EN" },
  { code: "de", label: "DE" },
  { code: "es", label: "ES" },
  { code: "fr", label: "FR" },
  { code: "el", label: "EL" },
  { code: "tr", label: "TR" },
];

interface LanguageFiltersProps {
  searchText: string;
  onSearchChange: (text: string) => void;
  filteredCount: number;
  totalCount: number;
  totalMissing: number;
  activeLangs: Set<string>;
  onToggleLang: (code: string) => void;
  categories: string[];
  activeCategory: string | null;
  onSetCategory: (cat: string | null) => void;
  showMissingOnly: boolean;
  onToggleMissingOnly: () => void;
}

export const LanguageFilters: React.FC<LanguageFiltersProps> = ({
  searchText,
  onSearchChange,
  filteredCount,
  totalCount,
  totalMissing,
  activeLangs,
  onToggleLang,
  categories,
  activeCategory,
  onSetCategory,
  showMissingOnly,
  onToggleMissingOnly,
}) => {
  return (
    <View style={styles.container}>
      <View style={styles.langChipsRow}>
        <View style={[styles.langChip, styles.langChipFixed]}>
          <Text style={styles.langChipTextFixed}>IT</Text>
        </View>
        {TABLE_LANGS.map((l) => {
          const active = activeLangs.has(l.code);
          return (
            <TouchableOpacity
              key={l.code}
              style={[styles.langChip, active && styles.langChipActive]}
              onPress={() => onToggleLang(l.code)}
              activeOpacity={0.7}
            >
              <Text style={[styles.langChipText, active && styles.langChipTextActive]}>{l.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.searchRow}>
        <MaterialCommunityIcons name="magnify" size={18} color={Colors.textSecondary} style={styles.searchIcon} />
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
          <TouchableOpacity onPress={() => onSearchChange("") } style={styles.searchClear}>
            <MaterialIcons name="clear" size={18} color={Colors.textSecondary} />
          </TouchableOpacity>
        ) : null}
      </View>

      {categories.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryScroll}>
          <TouchableOpacity
            style={[styles.categoryChip, activeCategory === null && styles.categoryChipActive]}
            onPress={() => onSetCategory(null)}
            activeOpacity={0.7}
          >
            <Text style={[styles.categoryChipText, activeCategory === null && styles.categoryChipTextActive]}>Tutte</Text>
          </TouchableOpacity>
          {categories.map((cat) => (
            <TouchableOpacity
              key={cat}
              style={[styles.categoryChip, activeCategory === cat && styles.categoryChipActive]}
              onPress={() => onSetCategory(activeCategory === cat ? null : cat)}
              activeOpacity={0.7}
            >
              <Text style={[styles.categoryChipText, activeCategory === cat && styles.categoryChipTextActive]}>{cat}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      ) : null}

      <View style={styles.bottomRow}>
        <TouchableOpacity
          style={[styles.missingChip, showMissingOnly && styles.missingChipActive]}
          onPress={onToggleMissingOnly}
          activeOpacity={0.7}
        >
          <View style={styles.missingDot} />
          <Text style={[styles.missingChipText, showMissingOnly && styles.missingChipTextActive]}>
            Mancanti{totalMissing > 0 ? ` (${totalMissing})` : ""}
          </Text>
        </TouchableOpacity>
        <Text style={styles.countText}>
          {filteredCount}{filteredCount !== totalCount ? `/${totalCount}` : ""} chiavi
        </Text>
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
  container: {
    backgroundColor: Colors.surface,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border ?? "#333",
    gap: 8,
  },
  langChipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  langChip: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
  },
  langChipActive: {
    borderColor: Colors.accent,
    backgroundColor: Colors.accent + "15",
  },
  langChipFixed: {
    borderColor: Colors.textSecondary,
    backgroundColor: Colors.surface,
    opacity: 0.7,
  },
  langChipText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: Colors.textSecondary,
  },
  langChipTextActive: {
    color: Colors.accent,
  },
  langChipTextFixed: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: Colors.textSecondary,
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.background,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    gap: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  searchIcon: {
    marginRight: 2,
  },
  searchInput: {
    flex: 1,
    color: Colors.text,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    padding: 0,
  },
  searchClear: {
    padding: 2,
  },
  categoryScroll: {
    flexDirection: "row",
    gap: 6,
    paddingRight: 4,
  },
  categoryChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
  },
  categoryChipActive: {
    borderColor: Colors.accent,
    backgroundColor: Colors.accent + "15",
  },
  categoryChipText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    color: Colors.textSecondary,
  },
  categoryChipTextActive: {
    color: Colors.accent,
  },
  bottomRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  missingChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: "#FF9800",
    backgroundColor: "transparent",
  },
  missingChipActive: {
    backgroundColor: "#FF980020",
  },
  missingDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "#FF9800",
  },
  missingChipText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    color: "#FF9800",
  },
  missingChipTextActive: {
    color: "#FF9800",
  },
  countText: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  legend: {
    flexDirection: "row",
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
