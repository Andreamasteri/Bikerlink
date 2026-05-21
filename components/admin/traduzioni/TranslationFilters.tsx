import React from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { useT } from "@/lib/language-context";

const TABLE_LANGS = [
  { code: "en", label: "EN" },
  { code: "de", label: "DE" },
  { code: "es", label: "ES" },
  { code: "fr", label: "FR" },
  { code: "el", label: "EL" },
  { code: "tr", label: "TR" },
];

interface TranslationFiltersProps {
  activeLangs: Set<string>;
  toggleLang: (code: string) => void;
  searchText: string;
  setSearchText: (text: string) => void;
  categories: string[];
  activeCategory: string | null;
  setActiveCategory: (cat: string | null) => void;
  showMissingOnly: boolean;
  setShowMissingOnly: (v: boolean | ((prev: boolean) => boolean)) => void;
  missingCount: number;
  filteredCount: number;
  totalCount: number;
}

export const TranslationFilters: React.FC<TranslationFiltersProps> = ({
  activeLangs,
  toggleLang,
  searchText,
  setSearchText,
  categories,
  activeCategory,
  setActiveCategory,
  showMissingOnly,
  setShowMissingOnly,
  missingCount,
  filteredCount,
  totalCount,
}) => {
  const t = useT();

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
              onPress={() => toggleLang(l.code)}
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
          value={searchText}
          onChangeText={setSearchText}
          placeholder={t("admin.searchKey")}
          placeholderTextColor={Colors.textSecondary}
          clearButtonMode="while-editing"
          autoCorrect={false}
          autoCapitalize="none"
        />
        {searchText.length > 0 && (
          <TouchableOpacity onPress={() => setSearchText("")} activeOpacity={0.7} style={styles.searchClear}>
            <MaterialCommunityIcons name="close-circle" size={16} color={Colors.textSecondary} />
          </TouchableOpacity>
        )}
      </View>

      {categories.length > 0 && (
        <View style={styles.categoryChipsRow}>
          <TouchableOpacity
            style={[styles.categoryChip, activeCategory === null && styles.categoryChipActive]}
            onPress={() => setActiveCategory(null)}
            activeOpacity={0.7}
          >
            <Text style={[styles.categoryChipText, activeCategory === null && styles.categoryChipTextActive]}>Tutte</Text>
          </TouchableOpacity>
          {categories.map((cat) => (
            <TouchableOpacity
              key={cat}
              style={[styles.categoryChip, activeCategory === cat && styles.categoryChipActive]}
              onPress={() => setActiveCategory(activeCategory === cat ? null : cat)}
              activeOpacity={0.7}
            >
              <Text style={[styles.categoryChipText, activeCategory === cat && styles.categoryChipTextActive]}>{cat}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <View style={styles.missingFilterRow}>
        <TouchableOpacity
          style={[styles.missingChip, showMissingOnly && styles.missingChipActive]}
          onPress={() => setShowMissingOnly((v: boolean) => !v)}
          activeOpacity={0.7}
        >
          <View style={styles.missingDotSmall} />
          <Text style={[styles.missingChipText, showMissingOnly && styles.missingChipTextActive]}>
            Mancanti{missingCount > 0 ? ` (${missingCount})` : ""}
          </Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.filterCount}>
        {filteredCount} / {totalCount} stringhe
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    gap: 8,
  },
  langChipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 4,
  },
  langChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
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
    backgroundColor: Colors.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 10,
    height: 40,
  },
  searchIcon: {
    marginRight: 6,
  },
  searchInput: {
    flex: 1,
    height: 40,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.text,
  },
  searchClear: {
    padding: 4,
  },
  categoryChipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
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
  missingFilterRow: {
    flexDirection: "row",
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
  missingChipText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    color: "#FF9800",
  },
  missingChipTextActive: {
    color: "#FF9800",
  },
  missingDotSmall: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "#FF9800",
  },
  filterCount: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
  },
});
