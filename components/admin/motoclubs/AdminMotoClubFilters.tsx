import React from "react";
import { View, Text, StyleSheet, TextInput, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { useT } from "@/lib/language-context";

interface AdminMotoClubFiltersProps {
  search: string;
  onSearchChange: (text: string) => void;
  tab: "requests" | "clubs" | "user_creation" | "sedi";
  onTabChange: (tab: "requests" | "clubs" | "user_creation" | "sedi") => void;
  pendingCount: number;
  userPendingCount: number;
  clubsCount: number;
  pendingLocationsCount: number;
  showAllRequests: boolean;
  onToggleShowAll: () => void;
}

export function AdminMotoClubFilters({
  search,
  onSearchChange,
  tab,
  onTabChange,
  pendingCount,
  userPendingCount,
  clubsCount,
  pendingLocationsCount,
  showAllRequests,
  onToggleShowAll,
}: AdminMotoClubFiltersProps) {
  const t = useT();

  return (
    <View>
      {/* Search */}
      <View style={styles.searchWrap}>
        <Ionicons name="search" size={16} color={Colors.textSecondary} style={{ marginRight: 8 }} />
        <TextInput
          style={styles.searchInput}
          placeholder={t("admin.searchClub")}
          placeholderTextColor={Colors.textSecondary}
          value={search}
          onChangeText={onSearchChange}
          clearButtonMode="while-editing"
        />
      </View>

      {/* Tabs */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tabBtn, tab === "requests" && styles.tabBtnActive]}
          onPress={() => onTabChange("requests")}
        >
          <Text style={[styles.tabBtnText, tab === "requests" && styles.tabBtnTextActive]}>
            Richieste{pendingCount > 0 ? ` (${pendingCount})` : ""}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, tab === "user_creation" && styles.tabBtnActive]}
          onPress={() => onTabChange("user_creation")}
        >
          <Text style={[styles.tabBtnText, tab === "user_creation" && styles.tabBtnTextActive]}>
            Da Utenti{userPendingCount > 0 ? ` (${userPendingCount})` : ""}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, tab === "clubs" && styles.tabBtnActive]}
          onPress={() => onTabChange("clubs")}
        >
          <Text style={[styles.tabBtnText, tab === "clubs" && styles.tabBtnTextActive]}>
            Club ({clubsCount})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, tab === "sedi" && styles.tabBtnActive]}
          onPress={() => onTabChange("sedi")}
        >
          <Text style={[styles.tabBtnText, tab === "sedi" && styles.tabBtnTextActive]}>
            Sedi{pendingLocationsCount > 0 ? ` (${pendingLocationsCount})` : ""}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Show all / only pending toggle (requests tabs only) */}
      {(tab === "requests" || tab === "user_creation") && (
        <TouchableOpacity style={styles.toggleRow} onPress={onToggleShowAll}>
          <Text style={styles.toggleText}>
            {showAllRequests ? "Mostra solo in attesa" : "Mostra tutte le richieste"}
          </Text>
          <Ionicons name={showAllRequests ? "eye-off-outline" : "eye-outline"} size={16} color={Colors.accent} />
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surface,
    borderRadius: 12,
    marginHorizontal: 14,
    marginTop: 12,
    marginBottom: 4,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  searchInput: {
    flex: 1,
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: Colors.text,
  },
  tabBar: {
    flexDirection: "row",
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 4,
    gap: 8,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 10,
    alignItems: "center",
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  tabBtnActive: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  tabBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: Colors.textSecondary },
  tabBtnTextActive: { color: "#fff" },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  toggleText: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    color: Colors.accent,
  },
});
