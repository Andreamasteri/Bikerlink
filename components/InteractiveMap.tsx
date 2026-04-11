import React, { useState, useCallback, useRef, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  View,
  StyleSheet,
  Platform,
  TouchableOpacity,
  Text,
  ActivityIndicator,
} from "react-native";
import MapView, { Marker, Circle, UrlTile, Region, PROVIDER_GOOGLE } from "react-native-maps";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as Location from "expo-location";
import Colors from "@/constants/colors";
import { t } from "@/lib/i18n";
import { getCountryFlag, getCountryName } from "@/lib/countries-regions";
import { useMapConfig } from "@/lib/map-context";
import { getTileConfig, type MapProvider } from "@/lib/map-tiles";
import { apiRequest, queryClient } from "@/lib/query-client";

interface MapUser {
  id: string;
  nickname: string;
  userType: "biker" | "zavorrina" | "coppia";
  sex?: string | null;
  country?: string | null;
  region?: string | null;
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

interface MapSosRequest {
  id: string;
  requesterNickname?: string;
  reason: string;
  latitude: number;
  longitude: number;
  radiusKm: number;
}

interface LatLng {
  latitude: number;
  longitude: number;
}

interface InteractiveMapProps {
  users?: MapUser[];
  workshops?: MapWorkshop[];
  easterEggs?: MapEasterEgg[];
  activeSosRequests?: MapSosRequest[];
  isAvailable: boolean;
  ghostMode?: boolean;
  searchRadiusKm?: number;
  filterBiker: boolean;
  filterZavorrina: boolean;
  filterCoppia: boolean;
  filterBarTopOffset?: number;
  onToggleFilterBiker: () => void;
  onToggleFilterZavorrina: () => void;
  onToggleFilterCoppia: () => void;
  onUserPress?: (user: MapUser) => void;
  onEasterEggPress?: (egg: MapEasterEgg) => void;
  onReady?: () => void;
  currentUserId?: string | null;
  realMeMarker?: LatLng | null;
  fakeMeMarker?: LatLng | null;
  onEventPress?: (eventId: string) => void;
  showEventPins?: boolean;
  clubPins?: ClubMapPin[];
  filterClubs?: boolean;
  onToggleFilterClubs?: () => void;
  filterEvents?: boolean;
  onToggleFilterEvents?: () => void;
  onClubPress?: (club: ClubMapPin) => void;
}

const ITALY_REGION: Region = {
  latitude: 41.9028,
  longitude: 12.4964,
  latitudeDelta: 8,
  longitudeDelta: 8,
};

const DEFAULT_MAP_STYLE = [
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

function getUserMarkerColor(userType: string, sex?: string | null): string {
  if (userType === "coppia") return Colors.accent;
  if (sex === "F") return Colors.femaleIcon;
  if (sex === "M") return Colors.maleIcon;
  if (userType?.startsWith("zavorrina")) return Colors.femaleIcon;
  if (userType?.startsWith("biker")) return Colors.maleIcon;
  return Colors.accent;
}

function getUserMarkerIcon(userType: string): keyof typeof MaterialCommunityIcons.glyphMap {
  if (userType?.startsWith("biker")) return "motorbike";
  if (userType?.startsWith("zavorrina")) return "seat-passenger";
  if (userType === "coppia") return "account-group";
  return "account";
}

interface EventMapPin {
  id: string;
  title: string;
  latitude: number;
  longitude: number;
  eventDate: string;
}

export interface ClubMapPin {
  id: string;
  name: string;
  clubType: string;
  logoUrl: string | null;
  region: string | null;
  country: string | null;
  latitude: number;
  longitude: number;
  isFictitious: boolean;
  memberCount: number;
}

export default function InteractiveMap({
  users = [],
  workshops = [],
  easterEggs = [],
  activeSosRequests = [],
  isAvailable,
  ghostMode = false,
  searchRadiusKm,
  filterBiker,
  filterZavorrina,
  filterCoppia,
  filterBarTopOffset,
  onToggleFilterBiker,
  onToggleFilterZavorrina,
  onToggleFilterCoppia,
  onUserPress,
  onEasterEggPress,
  onReady,
  currentUserId,
  realMeMarker,
  fakeMeMarker,
  onEventPress,
  showEventPins = true,
  clubPins = [],
  filterClubs = true,
  onToggleFilterClubs,
  filterEvents = true,
  onToggleFilterEvents,
  onClubPress,
}: InteractiveMapProps) {
  const { enabled: mapsEnabled, resolvedProvider, userChoiceEnabled } = useMapConfig();
  const mapRef = useRef<MapView>(null);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locationLoading, setLocationLoading] = useState(true);
  const region: Region = ITALY_REGION;
  const [mapIsReady, setMapIsReady] = useState(false);

  const today = new Date().toISOString().substring(0, 10);
  const { data: eventPinsRaw } = useQuery<EventMapPin[]>({
    queryKey: ["/api/events/map"],
    enabled: showEventPins,
    select: (d) => {
      if (!d) return [];
      return (d as EventMapPin[]).filter(
        (e) => e.latitude != null && e.longitude != null && (e.eventDate ?? "").substring(0, 10) >= today
      );
    },
  });
  const eventPins = eventPinsRaw ?? [];

  const saveMapStyleMutation = useMutation({
    mutationFn: async (style: MapProvider) => {
      await apiRequest("PUT", "/api/users/profile/dynamic", { preferredMapStyle: style });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users/me"] });
    },
  });

  const handleToggleDayNight = useCallback(() => {
    const next: MapProvider = resolvedProvider === "carto_light" ? "carto_dark" : "carto_light";
    saveMapStyleMutation.mutate(next);
  }, [resolvedProvider, saveMapStyleMutation]);

  const showDayNightButton = mapsEnabled && userChoiceEnabled &&
    (resolvedProvider === "carto_light" || resolvedProvider === "carto_dark");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (Platform.OS === "web") {
          if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
              (position) => {
                if (cancelled) return;
                const loc = {
                  latitude: position.coords.latitude,
                  longitude: position.coords.longitude,
                };
                setUserLocation(loc);
                setLocationLoading(false);
              },
              () => { if (!cancelled) setLocationLoading(false); }
            );
          } else {
            if (!cancelled) setLocationLoading(false);
          }
        } else {
          const { status } = await Location.requestForegroundPermissionsAsync();
          if (cancelled) return;
          if (status === "granted") {
            const loc = await Location.getCurrentPositionAsync({
              accuracy: Location.Accuracy.Balanced,
            });
            if (cancelled) return;
            const coords = {
              latitude: loc.coords.latitude,
              longitude: loc.coords.longitude,
            };
            setUserLocation(coords);
          }
          if (!cancelled) setLocationLoading(false);
        }
      } catch {
        if (!cancelled) setLocationLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const filteredUsers = users.filter((u) => {
    if (currentUserId != null && u.id === currentUserId) return true;
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

  useEffect(() => {
    if (userLocation && mapIsReady && mapRef.current) {
      mapRef.current.animateToRegion(
        { ...userLocation, latitudeDelta: 0.1, longitudeDelta: 0.1 },
        500
      );
    }
  }, [userLocation, mapIsReady]);

  const handleMapReady = useCallback(() => {
    onReady?.();
    setMapIsReady(true);
  }, [onReady]);

  const tileConfig = mapsEnabled ? getTileConfig(resolvedProvider) : null;

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={region}
        provider={Platform.OS === "android" ? PROVIDER_GOOGLE : undefined}
        customMapStyle={tileConfig ? undefined : DEFAULT_MAP_STYLE}
        showsUserLocation={!!userLocation}
        showsMyLocationButton={false}
        onMapReady={handleMapReady}
      >
        {tileConfig ? (
          <UrlTile
            key={resolvedProvider}
            urlTemplate={tileConfig.urlTemplate}
            maximumZ={tileConfig.maximumZ}
            flipY={false}
            shouldReplaceMapContent={tileConfig.shouldReplaceMapContent}
          />
        ) : null}

        {filteredUsers.map((u) => {
          const isCurrentUser = currentUserId != null && u.id === currentUserId;
          const markerColor = getUserMarkerColor(u.userType, u.sex);
          if (isCurrentUser) {
            return (
              <Marker
                key={`user-${u.id}`}
                coordinate={{ latitude: u.latitude, longitude: u.longitude }}
                title={u.nickname}
                description={u.country ? `${getCountryFlag(u.country)} ${getCountryName(u.country)}${u.region ? ` · ${u.region}` : ""}` : u.region || undefined}
                onPress={() => onUserPress?.(u)}
              >
                <View style={currentUserMarkerStyles.wrapper}>
                  <View style={[currentUserMarkerStyles.labelBadge, { backgroundColor: markerColor }]}>
                    <Text style={currentUserMarkerStyles.labelText}>Tu</Text>
                  </View>
                  <View style={[currentUserMarkerStyles.pin, { backgroundColor: markerColor }]}>
                    <MaterialCommunityIcons
                      name={getUserMarkerIcon(u.userType)}
                      size={18}
                      color="#fff"
                    />
                  </View>
                </View>
              </Marker>
            );
          }
          return (
            <Marker
              key={`user-${u.id}`}
              coordinate={{ latitude: u.latitude, longitude: u.longitude }}
              title={u.nickname}
              description={u.country ? `${getCountryFlag(u.country)} ${getCountryName(u.country)}${u.region ? ` · ${u.region}` : ""}` : u.region || undefined}
              pinColor={markerColor}
              onPress={() => onUserPress?.(u)}
            />
          );
        })}

        {workshops.map((ws) => (
          <Marker
            key={`ws-${ws.id}`}
            coordinate={{ latitude: ws.latitude, longitude: ws.longitude }}
            title={ws.name}
            pinColor="#FF6B00"
          />
        ))}

        {showEventPins && filterEvents && eventPins.map((ep) => (
          <Marker
            key={`event-${ep.id}`}
            coordinate={{ latitude: ep.latitude, longitude: ep.longitude }}
            title={ep.title}
            description={ep.eventDate ? ep.eventDate.substring(0, 10) : undefined}
            onPress={() => onEventPress?.(ep.id)}
          >
            <View style={eventMarkerStyles.container}>
              <MaterialCommunityIcons name="calendar-star" size={18} color="#fff" />
            </View>
          </Marker>
        ))}

        {filterClubs && clubPins.map((club) => (
          <Marker
            key={`club-${club.id}`}
            coordinate={{ latitude: club.latitude, longitude: club.longitude }}
            title={club.name}
            description={[
              club.isFictitious ? "Posizione indicativa – centro regione" : null,
              club.region ?? null,
              club.memberCount > 0 ? `${club.memberCount} membri` : null,
            ].filter(Boolean).join(" · ") || undefined}
            onPress={() => onClubPress?.(club)}
          >
            <View style={[clubMarkerStyles.container, club.isFictitious && clubMarkerStyles.containerFictitious]}>
              <MaterialCommunityIcons name="shield-check" size={16} color="#fff" />
              {club.isFictitious && <View style={clubMarkerStyles.fictitiousDot} />}
            </View>
          </Marker>
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

        {activeSosRequests.map((sos) => (
          <React.Fragment key={`sos-${sos.id}`}>
            <Circle
              center={{ latitude: sos.latitude, longitude: sos.longitude }}
              radius={(sos.radiusKm || 10) * 1000}
              fillColor="rgba(255, 0, 0, 0.30)"
              strokeColor="rgba(255, 0, 0, 1)"
              strokeWidth={4}
            />
            <Marker
              coordinate={{ latitude: sos.latitude, longitude: sos.longitude }}
              title={`SOS: ${sos.requesterNickname || "Utente"}`}
              description={sos.reason}
            >
              <View style={sosMarkerStyles.container}>
                <MaterialCommunityIcons name="alert" size={22} color="#fff" />
                <Text style={sosMarkerStyles.label}>SOS</Text>
              </View>
            </Marker>
          </React.Fragment>
        ))}

        {realMeMarker != null && (
          <Marker
            key="real-me-marker"
            coordinate={{ latitude: realMeMarker.latitude, longitude: realMeMarker.longitude }}
            title="RealMe"
            description="La tua posizione GPS reale"
          >
            <View style={privacyMarkerStyles.wrapper}>
              <View style={[privacyMarkerStyles.badge, { backgroundColor: "#2E7D32" }]}>
                <Text style={privacyMarkerStyles.badgeText}>RealMe</Text>
              </View>
              <View style={[privacyMarkerStyles.dot, { backgroundColor: "#2E7D32" }]} />
            </View>
          </Marker>
        )}

        {fakeMeMarker != null && (
          <Marker
            key="fake-me-marker"
            coordinate={{ latitude: fakeMeMarker.latitude, longitude: fakeMeMarker.longitude }}
            title="FakeMe"
            description="La tua posizione fittizia visibile agli altri"
          >
            <View style={privacyMarkerStyles.wrapper}>
              <View style={[privacyMarkerStyles.badge, { backgroundColor: "#E65100" }]}>
                <Text style={privacyMarkerStyles.badgeText}>FakeMe</Text>
              </View>
              <View style={[privacyMarkerStyles.dot, { backgroundColor: "#E65100" }]} />
            </View>
          </Marker>
        )}
      </MapView>

      {locationLoading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="small" color={Colors.accent} />
        </View>
      )}

      <View style={[styles.filterBar, filterBarTopOffset != null && { top: filterBarTopOffset }]}>
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

        {onToggleFilterClubs != null && (
          <TouchableOpacity
            style={[styles.filterChip, filterClubs && { backgroundColor: "#009688" }]}
            onPress={onToggleFilterClubs}
            activeOpacity={0.7}
          >
            <MaterialCommunityIcons
              name="shield-check"
              size={16}
              color={filterClubs ? "#fff" : "#009688"}
            />
            <Text style={[styles.filterText, filterClubs && styles.filterTextActive]}>Club</Text>
          </TouchableOpacity>
        )}

        {showEventPins && onToggleFilterEvents != null && (
          <TouchableOpacity
            style={[styles.filterChip, filterEvents && { backgroundColor: "#F57C00" }]}
            onPress={onToggleFilterEvents}
            activeOpacity={0.7}
          >
            <MaterialCommunityIcons
              name="calendar-star"
              size={16}
              color={filterEvents ? "#fff" : "#F57C00"}
            />
            <Text style={[styles.filterText, filterEvents && styles.filterTextActive]}>Raduni</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.controlsContainer}>
        <TouchableOpacity
          style={styles.locationButton}
          onPress={centerOnUser}
          activeOpacity={0.7}
        >
          <MaterialCommunityIcons name="crosshairs-gps" size={22} color={Colors.accent} />
        </TouchableOpacity>

        {showDayNightButton && (
          <TouchableOpacity
            style={styles.locationButton}
            onPress={handleToggleDayNight}
            activeOpacity={0.7}
            disabled={saveMapStyleMutation.isPending}
          >
            <MaterialCommunityIcons
              name={resolvedProvider === "carto_light" ? "weather-night" : "weather-sunny"}
              size={22}
              color={Colors.accent}
            />
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.availabilityContainer}>
        <View style={styles.availabilityIndicator}>
          <View style={styles.indicatorRow}>
            <View style={[styles.statusDot, { backgroundColor: isAvailable ? Colors.success : Colors.accentRed }]} />
            <Text style={[styles.availabilityText, { color: isAvailable ? Colors.success : Colors.accentRed }]}>
              {isAvailable ? t("map.available") : t("map.unavailable")}
            </Text>
          </View>
          <View style={styles.indicatorRow}>
            <View style={[styles.statusDot, { backgroundColor: ghostMode ? "#888888" : Colors.success }]} />
            <Text style={[styles.availabilityText, { color: ghostMode ? "#888888" : Colors.success }]}>
              {ghostMode ? t("map.offline") : t("map.online")}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}

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
    bottom: Platform.OS === "web" ? 117 : 97,
    right: 12,
    gap: 10,
    alignItems: "flex-end",
  },
  availabilityContainer: {
    position: "absolute",
    bottom: Platform.OS === "web" ? 118 : 98,
    left: 12,
    zIndex: 10,
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
    flexDirection: "column",
    alignItems: "flex-start",
    gap: 4,
    backgroundColor: Colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  indicatorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  availabilityText: {
    fontSize: 12,
    fontWeight: "600" as const,
  },
});

const currentUserMarkerStyles = StyleSheet.create({
  wrapper: {
    alignItems: "center",
  },
  labelBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    marginBottom: 3,
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.3, shadowRadius: 2 },
      android: { elevation: 3 },
      web: { boxShadow: "0px 1px 3px rgba(0,0,0,0.3)" },
    }),
  },
  labelText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "700" as const,
    letterSpacing: 0.5,
  },
  pin: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#fff",
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.4, shadowRadius: 3 },
      android: { elevation: 5 },
      web: { boxShadow: "0px 2px 4px rgba(0,0,0,0.4)" },
    }),
  },
});

const sosMarkerStyles = StyleSheet.create({
  container: {
    backgroundColor: "#FF0000",
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 4,
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    borderWidth: 2,
    borderColor: "#fff",
    elevation: 6,
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.4, shadowRadius: 4 },
      android: {},
      web: { boxShadow: "0px 2px 4px rgba(0,0,0,0.4)" },
    }),
  },
  label: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "800" as const,
    letterSpacing: 1,
  },
});

const eventMarkerStyles = StyleSheet.create({
  container: {
    backgroundColor: "#FF8C00",
    borderRadius: 18,
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#fff",
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.4, shadowRadius: 3 },
      android: { elevation: 5 },
      web: { boxShadow: "0px 2px 4px rgba(0,0,0,0.4)" },
    }),
  },
});

const clubMarkerStyles = StyleSheet.create({
  container: {
    backgroundColor: "#009688",
    borderRadius: 18,
    width: 30,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#fff",
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.35, shadowRadius: 3 },
      android: { elevation: 5 },
      web: { boxShadow: "0px 2px 4px rgba(0,0,0,0.4)" },
    }),
  },
  containerFictitious: {
    backgroundColor: "#607D8B",
  },
  fictitiousDot: {
    position: "absolute" as const,
    top: -3,
    right: -3,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#FF9800",
    borderWidth: 1.5,
    borderColor: "#fff",
  },
});

const privacyMarkerStyles = StyleSheet.create({
  wrapper: {
    alignItems: "center",
  },
  badge: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 8,
    marginBottom: 4,
    borderWidth: 1.5,
    borderColor: "#fff",
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.35, shadowRadius: 2 },
      android: { elevation: 4 },
      web: { boxShadow: "0px 1px 3px rgba(0,0,0,0.35)" },
    }),
  },
  badgeText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "700" as const,
    letterSpacing: 0.5,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: "#fff",
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.3, shadowRadius: 2 },
      android: { elevation: 3 },
      web: { boxShadow: "0px 1px 2px rgba(0,0,0,0.3)" },
    }),
  },
});
