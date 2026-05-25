import React from "react";
import { View, Pressable, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import FullscreenMapSearchBar from "@/components/map/FullscreenMapSearchBar";
import MapStatsRow from "@/components/map/MapStatsRow";
import type { FullscreenMapOverlayProps } from "@/components/map/fullscreen-map-types";

export default function FullscreenMapModal({
  visible,
  onClose,
  insetsTop,
  insetsBottom,
  onShowAreaModal,
  areaLabel,
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
  getUserIcon,
  getUserColor,
  getUserTypeLabel,
}: FullscreenMapOverlayProps) {
  return (
    <View
      style={StyleSheet.absoluteFill}
      pointerEvents={visible ? "box-none" : "none"}
    >
      {visible && (
        <>
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
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
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
