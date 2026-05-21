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
import { useT } from "@/lib/language-context";

type Props = {
  insetsTop: number;
  searchText: string;
  onSearch: (text: string) => void;
  onClearSearch: () => void;
  searchResults: any[];
  searchLoading: boolean;
  showSearchResults: boolean;
  onSearchResultPress: (u: any) => void;
  onClose: () => void;
  currentUserFullId: string | null | undefined;
  getUserIcon: (u: any) => any;
  getUserColor: (u: any) => string;
  getUserTypeLabel: (u: any) => string;
};

export default function FullscreenMapSearchBar({
  insetsTop,
  searchText,
  onSearch,
  onClearSearch,
  searchResults,
  searchLoading,
  showSearchResults,
  onSearchResultPress,
  onClose,
  currentUserFullId,
  getUserIcon,
  getUserColor,
  getUserTypeLabel,
}: Props) {
  const t = useT();

  return (
    <View style={[styles.container, { top: insetsTop + 40 }]}>
      <View style={styles.searchRow}>
        <Ionicons name="search" size={18} color={Colors.textSecondary} style={{ marginRight: 8 }} />
        <TextInput
          style={styles.searchInput}
          placeholder={t("home.searchPlaceholder")}
          placeholderTextColor={Colors.textSecondary}
          value={searchText}
          onChangeText={onSearch}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {searchText.length > 0 && (
          <TouchableOpacity onPress={onClearSearch}>
            <Ionicons name="close-circle" size={20} color={Colors.textSecondary} />
          </TouchableOpacity>
        )}
      </View>

      {showSearchResults && (
        <View style={styles.searchResults}>
          {searchLoading ? (
            <ActivityIndicator size="small" color={Colors.accent} style={{ padding: 12 }} />
          ) : searchResults.length === 0 ? (
            <Text style={styles.noResults}>{t("common.noResults")}</Text>
          ) : (
            <ScrollView style={{ maxHeight: 200 }} keyboardShouldPersistTaps="handled">
              {searchResults.map((u: any) => (
                <TouchableOpacity
                  key={u.id}
                  style={styles.resultItem}
                  onPress={() => {
                    onClose();
                    onSearchResultPress(u);
                  }}
                >
                  <Ionicons
                    name={getUserIcon(u)}
                    size={22}
                    color={getUserColor(u)}
                    style={{ marginRight: 10 }}
                  />
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                      <Text style={styles.resultName}>{u.nickname}</Text>
                      {u.id !== currentUserFullId && (
                        <FavoriteStar targetUserId={u.id} size={14} />
                      )}
                    </View>
                    <Text style={styles.resultDetail}>
                      {getUserTypeLabel(u)}
                      {u.country
                        ? ` · ${getCountryFlag(u.country)} ${getCountryName(u.country)}`
                        : ""}
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
  container: {
    position: "absolute",
    left: 56,
    right: 56,
    zIndex: 20,
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(30,30,30,0.92)",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: Colors.text,
    padding: 0,
  },
  searchResults: {
    backgroundColor: Colors.surface,
    borderRadius: 10,
    marginTop: 4,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: "hidden",
  },
  noResults: {
    padding: 12,
    textAlign: "center",
    color: Colors.textSecondary,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  resultItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.border,
  },
  resultName: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: Colors.text },
  resultDetail: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    marginTop: 1,
  },
});
