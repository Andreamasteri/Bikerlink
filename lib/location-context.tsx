import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { AppState, AppStateStatus, Platform } from "react-native";
import * as Location from "expo-location";
import { useQuery } from "@tanstack/react-query";
import { sendStartupBeacon } from "@/lib/startup-beacon";
import { apiRequest } from "@/lib/query-client";

interface LocationContextType {
  hasLocationPermission: boolean;
  hasBackgroundPermission: boolean;
  backgroundPermissionChecked: boolean;
  backgroundPermissionRevoked: boolean;
  gpsRequired: boolean;
  isGpsGateActive: boolean;
  requestPermission: () => Promise<boolean>;
  requestBackgroundPermission: () => Promise<boolean>;
  positionReady: boolean;
  webResolvedPosition: { latitude: number; longitude: number } | null;
}

const LocationContext = createContext<LocationContextType>({
  hasLocationPermission: true,
  hasBackgroundPermission: false,
  backgroundPermissionChecked: false,
  backgroundPermissionRevoked: false,
  gpsRequired: true,
  isGpsGateActive: false,
  requestPermission: async () => true,
  requestBackgroundPermission: async () => false,
  positionReady: false,
  webResolvedPosition: null,
});

export function useLocationGate() {
  return useContext(LocationContext);
}

const GPS_CHECK_INTERVAL = 4000;
const BG_PERMISSION_CHECK_INTERVAL = 30000;
const WEB_POSITION_POLL_INTERVAL = 30000;

export function LocationProvider({ children }: { children: React.ReactNode }) {
  const [hasPermission, setHasPermission] = useState(true);
  const [hasBackgroundPermission, setHasBackgroundPermission] = useState(false);
  const [backgroundPermissionChecked, setBackgroundPermissionChecked] = useState(false);
  const [backgroundPermissionRevoked, setBackgroundPermissionRevoked] = useState(false);
  const [positionReady, setPositionReady] = useState(Platform.OS !== "web");
  const [webResolvedPosition, setWebResolvedPosition] = useState<{ latitude: number; longitude: number } | null>(null);
  const appState = useRef(AppState.currentState);
  const hadBackgroundPermissionRef = useRef(false);
  const webGpsDoneRef = useRef(false);
  const webPositionFoundRef = useRef(false);

  const { data: gpsData } = useQuery<{ required: boolean }>({
    queryKey: ["/api/settings/gps-required"],
    staleTime: 30000,
  });
  const gpsRequired = gpsData?.required !== false;

  const checkPermission = useCallback(async () => {
    if (Platform.OS === "web") {
      if (typeof navigator !== "undefined" && navigator.geolocation) {
        navigator.permissions?.query({ name: "geolocation" as PermissionName }).then((result) => {
          setHasPermission(result.state === "granted" || result.state === "prompt");
        }).catch(() => {
          setHasPermission(true);
        });
      } else {
        setHasPermission(true);
      }
      return;
    }
    try {
      const { status } = await Location.getForegroundPermissionsAsync();
      setHasPermission(status === "granted");
    } catch {
      setHasPermission(true);
    }
  }, []);

  const checkBackgroundPermission = useCallback(async () => {
    if (Platform.OS === "web") {
      setHasBackgroundPermission(false);
      setBackgroundPermissionChecked(true);
      return;
    }
    try {
      const { status } = await Location.getBackgroundPermissionsAsync();
      const granted = status === "granted";
      setHasBackgroundPermission(granted);

      if (hadBackgroundPermissionRef.current && !granted) {
        setBackgroundPermissionRevoked(true);
      } else if (granted) {
        hadBackgroundPermissionRef.current = true;
        setBackgroundPermissionRevoked(false);
      }
    } catch {
      setHasBackgroundPermission(false);
    } finally {
      setBackgroundPermissionChecked(true);
    }
  }, []);

  const tryResolveWebPositionFromDb = useCallback(async (): Promise<boolean> => {
    try {
      const res = await apiRequest("GET", "/api/user/position");
      const data = await res.json();
      if (data?.latitude != null && data?.longitude != null) {
        setWebResolvedPosition({ latitude: data.latitude, longitude: data.longitude });
        setPositionReady(true);
        webPositionFoundRef.current = true;
        return true;
      }
    } catch {}
    return false;
  }, []);

  const requestPermission = useCallback(async (): Promise<boolean> => {
    if (Platform.OS === "web") {
      return new Promise((resolve) => {
        if (typeof navigator === "undefined" || !navigator.geolocation) {
          setHasPermission(true);
          resolve(true);
          return;
        }
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            setHasPermission(true);
            setWebResolvedPosition({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
            setPositionReady(true);
            webPositionFoundRef.current = true;
            resolve(true);
          },
          () => { setHasPermission(false); resolve(false); }
        );
      });
    }
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      const granted = status === "granted";
      setHasPermission(granted);
      return granted;
    } catch {
      setHasPermission(true);
      return true;
    }
  }, []);

  const requestBackgroundPermission = useCallback(async (): Promise<boolean> => {
    if (Platform.OS === "web") {
      return false;
    }
    try {
      const { status } = await Location.requestBackgroundPermissionsAsync();
      const granted = status === "granted";
      setHasBackgroundPermission(granted);
      if (granted) {
        hadBackgroundPermissionRef.current = true;
        setBackgroundPermissionRevoked(false);
      }
      return granted;
    } catch {
      return false;
    }
  }, []);

  useEffect(() => {
    sendStartupBeacon("location_provider_mount");
  }, []);

  useEffect(() => {
    checkPermission();
    checkBackgroundPermission();
  }, [checkPermission, checkBackgroundPermission]);

  useEffect(() => {
    if (Platform.OS !== "web") return;
    if (webGpsDoneRef.current) return;
    webGpsDoneRef.current = true;

    if (typeof navigator === "undefined" || !navigator.geolocation) {
      tryResolveWebPositionFromDb();
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setWebResolvedPosition({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
        setPositionReady(true);
        webPositionFoundRef.current = true;
      },
      () => {
        tryResolveWebPositionFromDb();
      },
      { timeout: 8000, maximumAge: 60000 }
    );
  }, [tryResolveWebPositionFromDb]);

  useEffect(() => {
    if (Platform.OS !== "web") return;

    const interval = setInterval(async () => {
      if (webPositionFoundRef.current) return;

      if (typeof navigator !== "undefined" && navigator.geolocation) {
        navigator.permissions?.query({ name: "geolocation" as PermissionName }).then(async (result) => {
          if (result.state === "granted") {
            navigator.geolocation.getCurrentPosition(
              (pos) => {
                setWebResolvedPosition({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
                setPositionReady(true);
                webPositionFoundRef.current = true;
              },
              () => {
                tryResolveWebPositionFromDb();
              },
              { timeout: 5000, maximumAge: 30000 }
            );
          } else {
            await tryResolveWebPositionFromDb();
          }
        }).catch(async () => {
          await tryResolveWebPositionFromDb();
        });
      } else {
        await tryResolveWebPositionFromDb();
      }
    }, WEB_POSITION_POLL_INTERVAL);

    return () => clearInterval(interval);
  }, [tryResolveWebPositionFromDb]);

  useEffect(() => {
    if (!gpsRequired) return;

    const interval = setInterval(checkPermission, GPS_CHECK_INTERVAL);
    return () => clearInterval(interval);
  }, [gpsRequired, checkPermission]);

  useEffect(() => {
    const interval = setInterval(checkBackgroundPermission, BG_PERMISSION_CHECK_INTERVAL);
    return () => clearInterval(interval);
  }, [checkBackgroundPermission]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState: AppStateStatus) => {
      if (appState.current.match(/inactive|background/) && nextState === "active") {
        checkPermission();
        checkBackgroundPermission();
      }
      appState.current = nextState;
    });
    return () => subscription.remove();
  }, [checkPermission, checkBackgroundPermission]);

  const isGpsGateActive = gpsRequired && !hasPermission;

  return (
    <LocationContext.Provider value={{
      hasLocationPermission: hasPermission,
      hasBackgroundPermission,
      backgroundPermissionChecked,
      backgroundPermissionRevoked,
      gpsRequired,
      isGpsGateActive,
      requestPermission,
      requestBackgroundPermission,
      positionReady,
      webResolvedPosition,
    }}>
      {children}
    </LocationContext.Provider>
  );
}
