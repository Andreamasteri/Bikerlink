import React, { useState, useCallback, useRef, useEffect } from "react";
import {
  View,
  StyleSheet,
  Platform,
  TouchableOpacity,
  Text,
  ActivityIndicator,
} from "react-native";
import MapView, { Marker, Circle, PROVIDER_GOOGLE, Region } from "react-native-maps";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as Location from "expo-location";
import Colors from "@/constants/colors";
import { t } from "@/lib/i18n";

interface MapUser {
  id: string;
  nickname: string;
  userType: "biker" | "zavorrina" | "coppia";
  sex?: string | null;
  latitude: number;
  longitude: number;
}

interface MapWorkshop {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  isSynecoPartner: boolean;
}

interface MapEasterEgg {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
}

interface InteractiveMapProps {
  users?: MapUser[];
  workshops?: MapWorkshop[];
  easterEggs?: MapEasterEgg[];
  isAvailable: boolean;
  searchRadiusKm?: number;
  filterBiker: boolean;
  filterZavorrina: boolean;
  filterCoppia: boolean;
  onToggleFilterBiker: () => void;
  onToggleFilterZavorrina: () => void;
  onToggleFilterCoppia: () => void;
  onUserPress?: (user: MapUser) => void;
  onEasterEggPress?: (egg: MapEasterEgg) => void;
}

const ITALY_REGION: Region = {
  latitude: 41.9028,
  longitude: 12.4964,
  latitudeDelta: 8,
  longitudeDelta: 8,
};

function getUserMarkerColor(userType: string, sex?: string | null): string {
  if (userType?.startsWith("biker")) return Colors.maleIcon;
  if (userType?.startsWith("zavorrina")) return Colors.femaleIcon;
  if (userType === "coppia") return Colors.accent;
  return Colors.accent;
}

function getUserMarkerIcon(userType: string): keyof typeof MaterialCommunityIcons.glyphMap {
  if (userType?.startsWith("biker")) return "motorbike";
  if (userType?.startsWith("zavorrina")) return "seat-passenger";
  if (userType === "coppia") return "account-group";
  return "account";
}

export default function InteractiveMap({
  users = [],
  workshops = [],
  easterEggs = [],
  isAvailable,
  searchRadiusKm,
  filterBiker,
  filterZavorrina,
  filterCoppia,
  onToggleFilterBiker,
  onToggleFilterZavorrina,
  onToggleFilterCoppia,
  onUserPress,
  onEasterEggPress,
}: InteractiveMapProps) {
  const mapRef = useRef<MapView>(null);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locationLoading, setLocationLoading] = useState(true);
  const [region, setRegion] = useState<Region>(ITALY_REGION);

  useEffect(() => {
    (async () => {
      try {
        if (Platform.OS === "web") {
          if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
              (position) => {
                const loc = {
                  latitude: position.coords.latitude,
                  longitude: position.coords.longitude,
                };
                setUserLocation(loc);
                setRegion({
                  ...loc,
                  latitudeDelta: 0.1,
                  longitudeDelta: 0.1,
                });
                setLocationLoading(false);
              },
              () => setLocationLoading(false)
            );
          } else {
            setLocationLoading(false);
          }
        } else {
          const { status } = await Location.requestForegroundPermissionsAsync();
          if (status === "granted") {
            const loc = await Location.getCurrentPositionAsync({
              accuracy: Location.Accuracy.Balanced,
            });
            const coords = {
              latitude: loc.coords.latitude,
              longitude: loc.coords.longitude,
            };
            setUserLocation(coords);
            setRegion({
              ...coords,
              latitudeDelta: 0.1,
              longitudeDelta: 0.1,
            });
          }
          setLocationLoading(false);
        }
      } catch {
        setLocationLoading(false);
      }
    })();
  }, []);

  const filteredUsers = users.filter((u) => {
    if (u.userType === "biker" && !filterBiker) return false;
    if (u.userType === "zavorrina" && !filterZavorrina) return false;
    if (u.userType === "coppia" && !filterCoppia) return false;
    return true;
  });

  const centerOnUser = useCallback(() => {
    if (userLocation && mapRef.current) {
      mapRef.current.animateToRegion({
        ...userLocation,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      });
    }
  }, [userLocation]);

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={region}
        showsUserLocation={!!userLocation}
        showsMyLocationButton={false}
        provider={Platform.OS === "android" ? PROVIDER_GOOGLE : undefined}
        customMapStyle={darkMapStyle}
      >
        {filteredUsers.map((u) => (
          <Marker
            key={`user-${u.id}`}
            coordinate={{ latitude: u.latitude, longitude: u.longitude }}
            title={u.nickname}
            onPress={() => onUserPress?.(u)}
            anchor={{ x: 0.5, y: 0.5 }}
          >
            <View style={[markerStyles.dot, { backgroundColor: getUserMarkerColor(u.userType, u.sex) }]}>
              <MaterialCommunityIcons name={getUserMarkerIcon(u.userType)} size={14} color="#fff" />
            </View>
          </Marker>
        ))}

        {workshops.map((ws) => (
          <Marker
            key={`ws-${ws.id}`}
            coordinate={{ latitude: ws.latitude, longitude: ws.longitude }}
            title={ws.name}
            pinColor="#FF6B00"
          />
        ))}

        {easterEggs.map((egg) => (
          <Marker
            key={`egg-${egg.id}`}
            coordinate={{ latitude: egg.latitude, longitude: egg.longitude }}
            title={egg.name}
            pinColor="#FFD700"
            onPress={() => onEasterEggPress?.(egg)}
          />
        ))}

        {isAvailable && !!userLocation && searchRadiusKm != null && searchRadiusKm > 0 && (
          <Circle
            center={userLocation}
            radius={searchRadiusKm * 1000}
            fillColor="rgba(255, 179, 0, 0.12)"
            strokeColor="rgba(255, 179, 0, 0.5)"
            strokeWidth={2}
          />
        )}
      </MapView>

      {locationLoading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="small" color={Colors.accent} />
        </View>
      )}

      <View style={styles.filterBar}>
        <TouchableOpacity
          style={[styles.filterChip, filterBiker && { backgroundColor: Colors.maleIcon }]}
          onPress={onToggleFilterBiker}
          activeOpacity={0.7}
        >
          <MaterialCommunityIcons
            name="motorbike"
            size={16}
            color={filterBiker ? "#fff" : Colors.maleIcon}
          />
          <Text style={[styles.filterText, filterBiker && styles.filterTextActive]}>Biker</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.filterChip, filterZavorrina && { backgroundColor: Colors.femaleIcon }]}
          onPress={onToggleFilterZavorrina}
          activeOpacity={0.7}
        >
          <MaterialCommunityIcons
            name="seat-passenger"
            size={16}
            color={filterZavorrina ? "#fff" : Colors.femaleIcon}
          />
          <Text style={[styles.filterText, filterZavorrina && styles.filterTextActive]}>Zavorrina</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.filterChip, filterCoppia && { backgroundColor: Colors.accent }]}
          onPress={onToggleFilterCoppia}
          activeOpacity={0.7}
        >
          <MaterialCommunityIcons
            name="account-group"
            size={16}
            color={filterCoppia ? "#fff" : Colors.accent}
          />
          <Text style={[styles.filterText, filterCoppia && styles.filterTextActive]}>Coppia</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.controlsContainer}>
        <TouchableOpacity
          style={styles.locationButton}
          onPress={centerOnUser}
          activeOpacity={0.7}
        >
          <MaterialCommunityIcons name="crosshairs-gps" size={22} color={Colors.accent} />
        </TouchableOpacity>

        <View
          style={[
            styles.availabilityIndicator,
            { borderColor: isAvailable ? Colors.success : Colors.accentRed },
          ]}
        >
          <View style={[styles.statusDot, { backgroundColor: isAvailable ? Colors.success : Colors.accentRed }]} />
          <Text style={styles.availabilityText}>
            {isAvailable ? t("map.available") : t("map.unavailable")}
          </Text>
        </View>
      </View>
    </View>
  );
}

const darkMapStyle = [
  { elementType: "geometry", stylers: [{ color: "#2D2D2D" }] },
  { elementType: "labels.icon", stylers: [{ visibility: "on" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#aaaaaa" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#2D2D2D" }] },
  { featureType: "administrative", elementType: "geometry", stylers: [{ color: "#757575" }] },
  { featureType: "poi", elementType: "geometry", stylers: [{ color: "#333333" }] },
  { featureType: "road", elementType: "geometry.fill", stylers: [{ color: "#4a4a4a" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#2D2D2D" }] },
  { featureType: "road.highway", elementType: "geometry.fill", stylers: [{ color: "#5a5a5a" }] },
  { featureType: "transit", elementType: "geometry", stylers: [{ color: "#2f3948" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#1a3a5c" }] },
];

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    ...StyleSheet.absoluteFillObject,
  },
  loadingOverlay: {
    position: "absolute",
    top: 16,
    right: 16,
    backgroundColor: Colors.surface,
    borderRadius: 20,
    padding: 8,
  },
  filterBar: {
    position: "absolute",
    top: Platform.OS === "web" ? 80 : 16,
    left: 12,
    right: 12,
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
  },
  filterChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  filterText: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: "600" as const,
  },
  filterTextActive: {
    color: "#fff",
  },
  controlsContainer: {
    position: "absolute",
    bottom: Platform.OS === "web" ? 100 : 80,
    right: 12,
    gap: 10,
    alignItems: "flex-end",
  },
  locationButton: {
    backgroundColor: Colors.surface,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  availabilityIndicator: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  availabilityText: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: "600" as const,
  },
});

const markerStyles = StyleSheet.create({
  dot: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#fff",
  },
});
