import React from "react";
import { Modal, View, Pressable, Text, ActivityIndicator, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { useT } from "@/lib/language-context";
import InteractiveMap from "@/components/InteractiveMap";
import FullscreenMapSearchBar from "@/components/map/FullscreenMapSearchBar";
import MapStatsRow from "@/components/map/MapStatsRow";
import type { FullscreenMapModalProps as Props } from "@/components/map/fullscreen-map-types";

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
  showHazardReportButton = false,
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
            showHazardReportButton={showHazardReportButton}
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

        <MapStatsRow
          insetsBottom={insetsBottom}
          onlineCount={onlineCount}
          bikerCount={bikerCount}
          zavCount={zavCount}
        />

        <FullscreenMapSearchBar
          insetsTop={insetsTop}
          searchText={searchText}
          onSearch={onSearch}
          onClearSearch={onClearSearch}
          searchResults={searchResults}
          searchLoading={searchLoading}
          showSearchResults={showSearchResults}
          onSearchResultPress={onSearchResultPress}
          onClose={onClose}
          currentUserFullId={currentUserFullId}
          getUserIcon={getUserIcon}
          getUserColor={getUserColor}
          getUserTypeLabel={getUserTypeLabel}
        />
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
});
