import React from "react";
import {
  Modal,
  View,
  Pressable,
  Text,
  TextInput,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { useT } from "@/lib/language-context";
import { getCountryFlag, getCountryName } from "@/lib/countries-regions";
import FavoriteStar from "@/components/FavoriteStar";
import InteractiveMap, {
  type InteractiveMapHandle,
  type ClubMapPin,
} from "@/components/InteractiveMap";

type Props = {
  visible: boolean;
  onClose: () => void;
  mapRef: React.RefObject<InteractiveMapHandle | null>;
  users: any[];
  workshops: any[];
  easterEggs: any[];
  activeSosRequests: any[];
  isAvailable: boolean;
  ghostMode: boolean;
  searchRadiusKm: number;
  filterBiker: boolean;
  filterZavorrina: boolean;
  filterClubs: boolean;
  filterEvents: boolean;
  onToggleFilterBiker: () => void;
  onToggleFilterZavorrina: () => void;
  onToggleFilterClubs: () => void;
  onToggleFilterEvents: () => void;
  onUserPress: (u: any) => void;
  onEasterEggPress: (egg: any) => void;
  onEventPress: (id: string) => void;
  onClubPress: (club: any) => void;
  onProposeClubLocation: (club: any) => void;
  currentUserId: string | null | undefined;
  realMeMarker: { latitude: number; longitude: number } | null;
  fakeMeMarker: { latitude: number; longitude: number } | null;
  clubPins: ClubMapPin[];
  initialCenterOverride: { latitude: number; longitude: number } | null;
  filterBarTopOffset: number;
  onShowAreaModal: () => void;
  areaLabel: string;
  onRegionChangeComplete?: (center: { latitude: number; longitude: number }) => void;
  onMapReady?: () => void;
  searchText: string;
  onSearch: (text: string) => void;
  onClearSearch: () => void;
  searchResults: any[];
  searchLoading: boolean;
  showSearchResults: boolean;
  onSearchResultPress: (u: any) => void;
  currentUserFullId: string | null | undefined;
  onlineCount: number;
  bikerCount: number;
  zavCount: number;
  insetsTop: number;
  insetsBottom: number;
  isReady: boolean;
  getUserIcon: (u: any) => any;
  getUserColor: (u: any) => string;
  getUserTypeLabel: (u: any) => string;
};

export default function FullscreenMapModal({
  visible,
  onClose,
  mapRef,
  users,
  workshops,
  easterEggs,
  activeSosRequests,
  isAvailable,
  ghostMode,
  searchRadiusKm,
  filterBiker,
  filterZavorrina,
  filterClubs,
  filterEvents,
  onToggleFilterBiker,
  onToggleFilterZavorrina,
  onToggleFilterClubs,
  onToggleFilterEvents,
  onUserPress,
  onEasterEggPress,
  onEventPress,
  onClubPress,
  onProposeClubLocation,
  currentUserId,
  realMeMarker,
  fakeMeMarker,
  clubPins,
  initialCenterOverride,
  filterBarTopOffset,
  onShowAreaModal,
  areaLabel,
  onRegionChangeComplete,
  onMapReady,
  searchText,
  onSearch,
  onClearSearch,
  searchResults,
  searchLoading,
  showSearchResults,
  onSearchResultPress,
  currentUserFullId,
  onlineCount,
  bikerCount,
  zavCount,
  insetsTop,
  insetsBottom,
  isReady,
  getUserIcon,
  getUserColor,
  getUserTypeLabel,
}: Props) {
  const t = useT();

  return (
    <Modal visible={visible} animationType="fade" onRequestClose={onClose}>
      <View style={styles.container}>
        {isReady ? (
          <InteractiveMap
            ref={mapRef}
            users={users}
            workshops={workshops}
            easterEggs={easterEggs}
            activeSosRequests={activeSosRequests}
            isAvailable={isAvailable}
            ghostMode={ghostMode}
            searchRadiusKm={searchRadiusKm}
            filterBiker={filterBiker}
            filterZavorrina={filterZavorrina}
            filterBarTopOffset={filterBarTopOffset}
            onToggleFilterBiker={onToggleFilterBiker}
            onToggleFilterZavorrina={onToggleFilterZavorrina}
            onUserPress={onUserPress}
            onEasterEggPress={onEasterEggPress}
            onEventPress={onEventPress}
            currentUserId={currentUserId}
            realMeMarker={realMeMarker}
            fakeMeMarker={fakeMeMarker}
            clubPins={clubPins}
            filterClubs={filterClubs}
            onToggleFilterClubs={onToggleFilterClubs}
            filterEvents={filterEvents}
            onToggleFilterEvents={onToggleFilterEvents}
            onClubPress={onClubPress}
            onProposeClubLocation={onProposeClubLocation}
            initialCenterOverride={initialCenterOverride}
            onRegionChangeComplete={onRegionChangeComplete}
            onReady={onMapReady}
          />
        ) : (
          <View style={styles.placeholder}>
            <ActivityIndicator size="large" color={Colors.accent} />
          </View>
        )}

        <Pressable style={[styles.closeBtn, { top: insetsTop + 32 }]} onPress={onClose}>
          <Ionicons name="close" size={28} color="#fff" />
        </Pressable>

        <Pressable
          style={[styles.areaBtn, { bottom: insetsBottom + 11 }]}
          onPress={onShowAreaModal}
        >
          <Ionicons name="globe-outline" size={16} color={Colors.text} />
          <Text style={styles.areaBtnText} numberOfLines={1}>
            {areaLabel}
          </Text>
        </Pressable>

        <View style={[styles.bottomStats, { bottom: insetsBottom + 16 }]}>
          <View style={styles.statsChip}>
            <Ionicons name="radio-button-on" size={12} color={Colors.success} />
            <Text style={styles.statsChipText}>{onlineCount}</Text>
          </View>
          <View style={styles.statsChip}>
            <MaterialCommunityIcons name="motorbike" size={14} color={Colors.maleIcon} />
            <Text style={styles.statsChipText}>{bikerCount}</Text>
          </View>
          <View style={styles.statsChip}>
            <MaterialCommunityIcons name="seat-passenger" size={14} color={Colors.femaleIcon} />
            <Text style={styles.statsChipText}>{zavCount}</Text>
          </View>
        </View>

        <View style={[styles.searchContainer, { top: insetsTop + 40 }]}>
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
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  placeholder: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: "center",
    justifyContent: "center",
  },
  closeBtn: {
    position: "absolute",
    right: 8,
    backgroundColor: "rgba(0,0,0,0.6)",
    borderRadius: 20,
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  areaBtn: {
    position: "absolute",
    right: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Colors.surface + "E6",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    zIndex: 20,
  },
  areaBtnText: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: Colors.text },
  bottomStats: {
    position: "absolute",
    left: 16,
    flexDirection: "row",
    gap: 8,
    zIndex: 20,
  },
  statsChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Colors.surface + "E6",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
  },
  statsChipText: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: Colors.text },
  searchContainer: {
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
  resultDetail: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.textSecondary, marginTop: 1 },
});
