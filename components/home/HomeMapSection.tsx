import React from "react";
import { View, ActivityIndicator, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import InteractiveMap, { type InteractiveMapHandle } from "@/components/InteractiveMap";

interface GeoItem {
  id?: string | number;
  latitude?: number | null;
  longitude?: number | null;
  [key: string]: unknown;
}
interface HomeMapSectionProps {
  mapFullscreen: boolean;
  mapRef: React.RefObject<InteractiveMapHandle>;
  usersWithSelf: GeoItem[];
  workshops: GeoItem[];
  activeSosRequests: GeoItem[];
  isAvailable: boolean;
  ghostMode: boolean;
  mySearchRadius: number | null;
  filterBiker: boolean;
  filterZavorrina: boolean;
  toggleFilterBiker: () => void;
  toggleFilterZavorrina: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- accepts MapUser from useHomeMapState
  handleUserPress: (user: any) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- accepts EasterEgg from useHomeMapState
  handleEasterEggPress: (egg: any) => void;
  onEventPress: (id: string) => void;
  setMapReady: (ready: boolean) => void;
  userId: number | undefined;
  realMeMarker: { latitude: number; longitude: number } | null;
  fakeMeMarker: { latitude: number; longitude: number } | null;
  setLastSmallMapCenter: (center: { latitude: number; longitude: number }) => void;
  smallMapInitialCenter: { latitude: number; longitude: number } | null;
  setMapFullscreen: (fullscreen: boolean) => void;
}

export const HomeMapSection: React.FC<HomeMapSectionProps> = ({
  mapFullscreen,
  mapRef,
  usersWithSelf,
  workshops,
  activeSosRequests,
  isAvailable,
  ghostMode,
  mySearchRadius,
  filterBiker,
  filterZavorrina,
  toggleFilterBiker,
  toggleFilterZavorrina,
  handleUserPress,
  handleEasterEggPress,
  onEventPress,
  setMapReady,
  userId,
  realMeMarker,
  fakeMeMarker,
  setLastSmallMapCenter,
  smallMapInitialCenter,
  setMapFullscreen,
}) => {
  return (
    <Pressable style={styles.mapContainer} onPress={() => setMapFullscreen(true)}>
      {!mapFullscreen ? (
        <InteractiveMap
          ref={mapRef}
          users={usersWithSelf.filter(
            (u) => u.latitude != null && u.longitude != null && !isNaN(u.latitude as number) && !isNaN(u.longitude as number)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- GeoItem matches MapUser at runtime
          ) as any}
          workshops={workshops.filter(
            (w) => w.latitude != null && w.longitude != null && !isNaN(w.latitude as number) && !isNaN(w.longitude as number)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- GeoItem matches MapWorkshop at runtime
          ) as any}
          easterEggs={[]}
          activeSosRequests={activeSosRequests.filter(
            (s) => s.latitude != null && s.longitude != null
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- GeoItem matches MapSosRequest at runtime
          ) as any}
          isAvailable={isAvailable}
          ghostMode={ghostMode}
          searchRadiusKm={mySearchRadius ?? 0}
          filterBiker={filterBiker}
          filterZavorrina={filterZavorrina}
          onToggleFilterBiker={toggleFilterBiker}
          onToggleFilterZavorrina={toggleFilterZavorrina}
          onUserPress={handleUserPress}
          onEasterEggPress={handleEasterEggPress}
          onEventPress={onEventPress}
          onReady={() => setMapReady(true)}
          currentUserId={userId != null ? String(userId) : null}
          realMeMarker={realMeMarker}
          fakeMeMarker={fakeMeMarker}
          showEventPins={false}
          onRegionChangeComplete={(center) => setLastSmallMapCenter(center)}
          initialCenterOverride={smallMapInitialCenter}
          gpsFollowupEnabled={true}
        />
      ) : (

        <View style={styles.mapPlaceholder}>
          <ActivityIndicator size="small" color={Colors.accent} />
        </View>
      )}
      <View style={styles.expandHint}>
        <Ionicons name="expand" size={16} color={Colors.text} />
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  mapContainer: {
    height: 220,
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 20,
    overflow: "hidden",
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
  },
  mapPlaceholder: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  expandHint: {
    position: "absolute",
    bottom: 12,
    right: 12,
    backgroundColor: "rgba(255, 255, 255, 0.8)",
    padding: 6,
    borderRadius: 8,
  },
});
