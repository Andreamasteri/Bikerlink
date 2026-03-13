import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { Platform, AppState, AppStateStatus } from "react-native";
import * as Location from "expo-location";
import { useQuery } from "@tanstack/react-query";

interface LocationContextType {
  hasLocationPermission: boolean;
  gpsRequired: boolean;
  isGpsGateActive: boolean;
  requestPermission: () => Promise<boolean>;
}

const LocationContext = createContext<LocationContextType>({
  hasLocationPermission: true,
  gpsRequired: true,
  isGpsGateActive: false,
  requestPermission: async () => true,
});

export function useLocationGate() {
  return useContext(LocationContext);
}

const GPS_CHECK_INTERVAL = 4000;

export function LocationProvider({ children }: { children: React.ReactNode }) {
  const [hasPermission, setHasPermission] = useState(true);
  const appState = useRef(AppState.currentState);

  const { data: gpsData } = useQuery<{ required: boolean }>({
    queryKey: ["/api/settings/gps-required"],
    staleTime: 30000,
  });
  const gpsRequired = gpsData?.required !== false;

  const checkPermission = useCallback(async () => {
    try {
      if (Platform.OS === "web") {
        if (navigator.permissions) {
          const result = await navigator.permissions.query({ name: "geolocation" as PermissionName });
          setHasPermission(result.state === "granted");
        } else {
          setHasPermission(true);
        }
      } else {
        const { status } = await Location.getForegroundPermissionsAsync();
        setHasPermission(status === "granted");
      }
    } catch {
      setHasPermission(true);
    }
  }, []);

  const requestPermission = useCallback(async (): Promise<boolean> => {
    try {
      if (Platform.OS === "web") {
        return new Promise((resolve) => {
          navigator.geolocation.getCurrentPosition(
            () => { setHasPermission(true); resolve(true); },
            () => { setHasPermission(false); resolve(false); },
            { timeout: 5000 }
          );
        });
      } else {
        const { status } = await Location.requestForegroundPermissionsAsync();
        const granted = status === "granted";
        setHasPermission(granted);
        return granted;
      }
    } catch {
      setHasPermission(false);
      return false;
    }
  }, []);

  useEffect(() => {
    checkPermission();
  }, [checkPermission]);

  useEffect(() => {
    if (!gpsRequired) return;

    const interval = setInterval(checkPermission, GPS_CHECK_INTERVAL);
    return () => clearInterval(interval);
  }, [gpsRequired, checkPermission]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState: AppStateStatus) => {
      if (appState.current.match(/inactive|background/) && nextState === "active") {
        checkPermission();
      }
      appState.current = nextState;
    });
    return () => subscription.remove();
  }, [checkPermission]);

  useEffect(() => {
    if (Platform.OS === "web" && navigator.permissions) {
      let cleanup: (() => void) | null = null;
      navigator.permissions.query({ name: "geolocation" as PermissionName }).then((result) => {
        const handler = () => {
          setHasPermission(result.state === "granted");
        };
        result.addEventListener("change", handler);
        cleanup = () => result.removeEventListener("change", handler);
      }).catch(() => {});
      return () => { if (cleanup) cleanup(); };
    }
  }, []);

  const isGpsGateActive = gpsRequired && !hasPermission;

  return (
    <LocationContext.Provider value={{
      hasLocationPermission: hasPermission,
      gpsRequired,
      isGpsGateActive,
      requestPermission,
    }}>
      {children}
    </LocationContext.Provider>
  );
}
