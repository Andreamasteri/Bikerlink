import { useState, useCallback, useEffect } from "react";
import * as Location from "expo-location";
import { AppState, AppStateStatus } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { sendStartupBeacon } from "@/lib/startup-beacon";
import { apiRequest } from "@/lib/query-client";
import { getRegionCoordinates } from "@/constants/regions";
import type { SharedPosition } from "@/lib/location-context";

const GHOST_MODE_KEY = "@bikerlink/ghost_mode_active";

type Coords = { latitude: number; longitude: number };

type Props = {
  userRegion?: string | null;
  userCountry?: string | null;
  profileLat?: number | null;
  profileLng?: number | null;
  currentPosition?: SharedPosition | null;
};

type Result = {
  location: Coords | null;
  locationLoading: boolean;
  setLocation: (coords: Coords) => void;
  fetchGPSLocation: () => Promise<Coords | null>;
  handleCenterPosition: () => Promise<void>;
};

export function useMapLocation({ userRegion, userCountry, profileLat, profileLng, currentPosition }: Props): Result {
  const [location, setLocation] = useState<Coords | null>(null);
  const [locationLoading, setLocationLoading] = useState(true);

  const fetchGPSLocation = useCallback(async (): Promise<Coords | null> => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      sendStartupBeacon("gps_permission_result", { status });
      if (status !== "granted") return null;
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const coords: Coords = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
      try { await AsyncStorage.setItem("map_last_gps", JSON.stringify(coords)); } catch {
        // no-op: ignore storage write failures
      }
      const ghost = await AsyncStorage.getItem(GHOST_MODE_KEY).catch(() => null);
      if (ghost !== "true") {
        try { await apiRequest("PUT", "/api/users/location", coords); } catch {
          // no-op: ignore location update failures
        }
      }
      return coords;
    } catch {
      return null;
    }
  }, []);

  const getRegionFallback = useCallback((): Coords | null => {
    if (userRegion) return getRegionCoordinates(userRegion, userCountry);
    return null;
  }, [userRegion, userCountry]);

  // Sync live position from the shared LocationContext watch — no extra GPS stream opened.
  useEffect(() => {
    if (!currentPosition) return;
    setLocation({ latitude: currentPosition.latitude, longitude: currentPosition.longitude });
    setLocationLoading(false);
  }, [currentPosition]);

  // Persist context position to map_last_gps cache when the app goes to background/inactive.
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState: AppStateStatus) => {
      if ((nextState === "background" || nextState === "inactive") && currentPosition) {
        AsyncStorage.setItem(
          "map_last_gps",
          JSON.stringify({ latitude: currentPosition.latitude, longitude: currentPosition.longitude })
        ).catch(() => {});
      }
    });
    return () => subscription.remove();
  }, [currentPosition]);

  // One-time init: show cached or region/profile coords instantly while the shared watch warms up.
  useEffect(() => {
    let cancelled = false;

    async function initMapLocation() {
      try {
        try {
          const cachedGps = await AsyncStorage.getItem("map_last_gps");
          if (cachedGps) {
            const parsed = JSON.parse(cachedGps);
            if (parsed && typeof parsed.latitude === "number" && typeof parsed.longitude === "number") {
              if (!cancelled) { setLocation({ latitude: parsed.latitude, longitude: parsed.longitude }); setLocationLoading(false); }
            }
          }
        } catch {
          // no-op: ignore JSON parsing or storage read errors
        }

        sendStartupBeacon("fetch_gps_start");

        if (userRegion) {
          if (!cancelled) setLocation((prev) => prev ?? getRegionCoordinates(userRegion!, userCountry));
          if (!cancelled) setLocationLoading(false);
          return;
        }
        if (profileLat != null && profileLng != null && !isNaN(Number(profileLat)) && !isNaN(Number(profileLng))) {
          if (!cancelled) setLocation((prev) => prev ?? { latitude: Number(profileLat), longitude: Number(profileLng) });
          if (!cancelled) setLocationLoading(false);
          return;
        }

        const fallback = getRegionFallback();
        if (!cancelled) {
          if (fallback) setLocation((prev) => prev ?? fallback);
          setLocationLoading(false);
        }
      } catch (err) {
        console.warn("[index] initMapLocation fallita:", err);
        if (!cancelled) setLocationLoading(false);
      }
    }

    initMapLocation();
    return () => { cancelled = true; };
  }, [userRegion, userCountry, profileLat, profileLng, getRegionFallback]);

  const handleCenterPosition = useCallback(async () => {
    const gps = await fetchGPSLocation();
    if (gps) setLocation(gps);
    else { const fallback = getRegionFallback(); if (fallback) setLocation(fallback); }
  }, [fetchGPSLocation, getRegionFallback]);

  return {
    location,
    locationLoading,
    setLocation,
    fetchGPSLocation,
    handleCenterPosition,
  };
}
