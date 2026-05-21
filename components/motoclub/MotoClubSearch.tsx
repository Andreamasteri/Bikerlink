import React from "react";
import { View, Text, StyleSheet, TextInput, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { useT } from "@/lib/language-context";

interface ScrollFilterChipProps {
  label: string;
  selected: boolean;
  onPress: () => void;
}

const ScrollFilterChip: React.FC<ScrollFilterChipProps> = ({
  label,
  selected,
  onPress,
}) => {
  return (
    <TouchableOpacity
      style={[styles.chip, selected && styles.chipActive]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <Text style={[styles.chipText, selected && styles.chipTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
};

const COUNTRY_LABELS: Record<string, string> = {
  IT: "🇮🇹 Italia",
  DE: "🇩🇪 Germania",
  FR: "🇫🇷 Francia",
  ES: "🇪🇸 Spagna",
  AT: "🇦🇹 Austria",
  CH: "🇨🇭 Svizzera",
  PT: "🇵🇹 Portogallo",
  NL: "🇳🇱 Paesi Bassi",
  BE: "🇧🇪 Belgio",
  PL: "🇵🇱 Polonia",
};

interface MotoClubSearchProps {
  search: string;
  setSearch: (text: string) => void;
  showFilters: boolean;
  setShowFilters: (show: boolean | ((prev: boolean) => boolean)) => void;
  filterType: string;
  setFilterType: (type: "" | "brand" | "model" | "custom") => void;
  filterCountry: string;
  setFilterCountry: (country: string) => void;
  tab: "all" | "mine" | "market";
  setTab: (tab: "all" | "mine" | "market") => void;
  marketplaceEnabled: boolean;
}

export const MotoClubSearch: React.FC<MotoClubSearchProps> = ({
  search,
  setSearch,
  showFilters,
  setShowFilters,
  filterType,
  setFilterType,
  filterCountry,
  setFilterCountry,
  tab,
  setTab,
  marketplaceEnabled,
}) => {
  const t = useT();

  return (
    <View style={styles.topBar}>
      <View style={styles.searchRow}>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={16} color={Colors.textSecondary} />
          <TextInput
            style={styles.searchInput}
            placeholder={t("motoclub.searchPlaceholder")}
            placeholderTextColor={Colors.textSecondary}
            value={search}
            onChangeText={setSearch}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch("")}>
              <Ionicons name="close-circle" size={16} color={Colors.textSecondary} />
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity
          style={[styles.filterIconBtn, showFilters && styles.filterIconBtnActive]}
          onPress={() => setShowFilters((v: boolean) => !v)}
        >
          <Ionicons
            name="options"
            size={20}
            color={showFilters ? Colors.accent : Colors.textSecondary}
          />
        </TouchableOpacity>
      </View>

      {showFilters && (
        <View style={styles.filterRow}>
          <ScrollFilterChip
            label={t("motoclub.allTypes")}
            selected={filterType === ""}
            onPress={() => setFilterType("")}
          />
          <ScrollFilterChip
            label="Brand"
            selected={filterType === "brand"}
            onPress={() => setFilterType("brand")}
          />
          <ScrollFilterChip
            label="Modello"
            selected={filterType === "model"}
            onPress={() => setFilterType("model")}
          />
          <ScrollFilterChip
            label={t("motoclub.filterCustom")}
            selected={filterType === "custom"}
            onPress={() => setFilterType("custom")}
          />
          <Text style={styles.filterSeparator}>|</Text>
          {Object.entries(COUNTRY_LABELS).map(([code, label]) => (
            <ScrollFilterChip
              key={code}
              label={label}
              selected={filterCountry === code}
              onPress={() => setFilterCountry(filterCountry === code ? "" : code)}
            />
          ))}
        </View>
      )}

      <View style={styles.segmented}>
        <TouchableOpacity
          style={[styles.seg, tab === "all" && styles.segActive]}
          onPress={() => setTab("all")}
        >
          <Text style={[styles.segText, tab === "all" && styles.segTextActive]}>
            Tutti
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.seg, tab === "mine" && styles.segActive]}
          onPress={() => setTab("mine")}
        >
          <Text style={[styles.segText, tab === "mine" && styles.segTextActive]}>
            I Miei
          </Text>
        </TouchableOpacity>
        {marketplaceEnabled && (
          <TouchableOpacity
            style={[styles.seg, tab === "market" && styles.segActive]}
            onPress={() => setTab("market")}
          >
            <Text style={[styles.segText, tab === "market" && styles.segTextActive]}>
              Mercatino
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  topBar: { backgroundColor: Colors.surface, paddingHorizontal: 12, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: Colors.border },
  searchRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8 },
  searchBox: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.background,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 6,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  searchInput: { flex: 1, color: Colors.text, fontSize: 14, fontFamily: "Inter_400Regular" },
  filterIconBtn: {
    padding: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
  },
  filterIconBtnActive: { borderColor: Colors.accent },
  filterRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    paddingVertical: 8,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  chipActive: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  chipText: { fontSize: 12, color: Colors.textSecondary, fontFamily: "Inter_500Medium" },
  chipTextActive: { color: Colors.text },
  filterSeparator: { color: Colors.border, alignSelf: "center", marginHorizontal: 4 },
  segmented: { flexDirection: "row", marginTop: 6, borderRadius: 10, overflow: "hidden", borderWidth: 1, borderColor: Colors.border },
  seg: { flex: 1, paddingVertical: 7, alignItems: "center", backgroundColor: Colors.background },
  segActive: { backgroundColor: Colors.accent },
  segText: { fontSize: 13, color: Colors.textSecondary, fontFamily: "Inter_600SemiBold" },
  segTextActive: { color: Colors.text },
});
