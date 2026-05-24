import React from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  StyleSheet,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import FavoriteStar from "@/components/FavoriteStar";
import { getCountryFlag, getCountryName } from "@/lib/countries-regions";
import { getUserColor, getUserTypeLabel, getUserIcon } from "@/lib/mapUserUtils";
import { useT } from "@/lib/language-context";

type Props = {
  searchText: string;
  onChangeText: (text: string) => void;
  onClear: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- search results from API
  searchResults: any[];
  searchLoading: boolean;
  showSearchResults: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- result user shape from API
  onResultPress: (u: any) => void;
  currentUserId?: string;
};

export default function MapSearchBar({
  searchText,
  onChangeText,
  onClear,
  searchResults,
  searchLoading,
  showSearchResults,
  onResultPress,
  currentUserId,
}: Props) {
  const t = useT();

  return (
    <View style={styles.searchContainer}>
      <View style={styles.searchInputRow}>
        <Ionicons name="search" size={18} color={Colors.textSecondary} style={{ marginRight: 8 }} />
        <TextInput
          style={styles.searchInput}
          placeholder={t("home.searchPlaceholder")}
          placeholderTextColor={Colors.textSecondary}
          value={searchText}
          onChangeText={onChangeText}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {searchText.length > 0 && (
          <TouchableOpacity onPress={onClear}>
            <Ionicons name="close-circle" size={20} color={Colors.textSecondary} />
          </TouchableOpacity>
        )}
      </View>
      {showSearchResults && (
        <View style={styles.searchResultsContainer}>
          {searchLoading ? (
            <ActivityIndicator size="small" color={Colors.accent} style={{ padding: 12 }} />
          ) : searchResults.length === 0 ? (
            <Text style={styles.searchNoResults}>{t("common.noResults")}</Text>
          ) : (
            <ScrollView style={{ maxHeight: 200 }} keyboardShouldPersistTaps="handled">
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any -- search result item from API */}
              {searchResults.map((u: any) => (
                <TouchableOpacity key={u.id} style={styles.searchResultItem} onPress={() => onResultPress(u)}>
                  <Ionicons name={getUserIcon(u)} size={22} color={getUserColor(u)} style={{ marginRight: 10 }} />
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                      <Text style={styles.searchResultName}>{u.nickname}</Text>
                      {u.id !== currentUserId && <FavoriteStar targetUserId={u.id} size={14} />}
                    </View>
                    <Text style={styles.searchResultDetail}>
                      {getUserTypeLabel(u, t)}
                      {u.country ? ` · ${getCountryFlag(u.country)} ${getCountryName(u.country)}` : ""}
                      {u.region ? ` · ${u.region}` : ""}
                      {!u.latitude ? ` · ${t("home.locationUnavailable")}` : ""}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  searchContainer: { marginHorizontal: 16, marginBottom: 8, zIndex: 10 },
  searchInputRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surface,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  searchInput: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular", color: Colors.text, padding: 0 },
  searchResultsContainer: {
    backgroundColor: Colors.surface,
    borderRadius: 10,
    marginTop: 4,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: "hidden",
  },
  searchNoResults: { padding: 12, textAlign: "center", color: Colors.textSecondary, fontSize: 13, fontFamily: "Inter_400Regular" },
  searchResultItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.border,
  },
  searchResultName: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: Colors.text },
  searchResultDetail: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.textSecondary, marginTop: 1 },
});
