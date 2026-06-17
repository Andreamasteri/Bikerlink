import { useState, useCallback, useEffect } from "react";
import * as Location from "expo-location";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { sendStartupBeacon } from "@/lib/startup-beacon";
import { apiRequest } from "@/lib/query-client";
import { getRegionCoordinates } from "@/constants/regions";
import { subscribeGpsPosition } from "@/lib/shared-gps-position";

type Coords = { latitude: number; longitude: number };

type Props = {
  userRegion?: string | null;
  userCountry?: string | null;
  profileLat?: number | null;
  profileLng?: number | null;
};

type Result = {
  location: Coords | null;
  locationLoading: boolean;
  setLocation: (coords: Coords) => void;
  fetchGPSLocation: () => Promise<Coords | null>;
  handleCenterPosition: () => Promise<void>;
};

export function useMapLocation({ userRegion, userCountry, profileLat, profileLng }: Props): Result {
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
      try { await apiRequest("PUT", "/api/users/location", coords); } catch {
        // no-op: ignore location update failures
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

  useEffect(() => {
    let cancelled = false;

    const unsubscribe = subscribeGpsPosition((coords) => {
      if (cancelled) return;
      setLocation(coords);
      setLocationLoading(false);
      AsyncStorage.setItem("map_last_gps", JSON.stringify(coords)).catch(() => {});
    });

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
          const gps = await fetchGPSLocation();
          if (gps && !cancelled) setLocation(gps);
          return;
        }
        if (profileLat != null && profileLng != null && !isNaN(Number(profileLat)) && !isNaN(Number(profileLng))) {
          if (!cancelled) setLocation((prev) => prev ?? { latitude: Number(profileLat), longitude: Number(profileLng) });
          if (!cancelled) setLocationLoading(false);
          const gps = await fetchGPSLocation();
          if (gps && !cancelled) setLocation(gps);
          return;
        }

        const gps = await fetchGPSLocation();
        if (cancelled) return;
        if (gps) { setLocation(gps); setLocationLoading(false); }
        else { const fallback = getRegionFallback(); if (fallback) setLocation((prev) => prev ?? fallback); setLocationLoading(false); }
      } catch (err) {
        console.warn("[index] initMapLocation fallita:", err);
        if (!cancelled) setLocationLoading(false);
      }
    }
    initMapLocation();
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [fetchGPSLocation, getRegionFallback, userRegion, userCountry, profileLat, profileLng]);

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
