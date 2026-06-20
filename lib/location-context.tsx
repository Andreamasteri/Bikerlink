import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { AppState, AppStateStatus } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { sendStartupBeacon } from "@/lib/startup-beacon";

let _expoLocation: typeof import("expo-location") | null = null;
function loc(): typeof import("expo-location") {
  if (_expoLocation === null) {
    _expoLocation = require("expo-location") as typeof import("expo-location");
  }
  return _expoLocation!;
}

export interface SharedPosition {
  latitude: number;
  longitude: number;
}

interface LocationContextType {
  hasLocationPermission: boolean;
  locationPermissionDenied: boolean;
  locationPermissionPrompt: boolean;
  hasBackgroundPermission: boolean;
  backgroundPermissionChecked: boolean;
  backgroundPermissionRevoked: boolean;
  gpsRequired: boolean;
  isGpsGateActive: boolean;
  requestPermission: () => Promise<boolean>;
  requestBackgroundPermission: () => Promise<boolean>;
  positionReady: boolean;
  currentPosition: SharedPosition | null;
  positionLoading: boolean;
  suspendSharedWatch: () => void;
  resumeSharedWatch: () => void;
}

const LocationContext = createContext<LocationContextType>({
  hasLocationPermission: true,
  locationPermissionDenied: false,
  locationPermissionPrompt: false,
  hasBackgroundPermission: false,
  backgroundPermissionChecked: false,
  backgroundPermissionRevoked: false,
  gpsRequired: true,
  isGpsGateActive: false,
  requestPermission: async () => true,
  requestBackgroundPermission: async () => false,
  positionReady: true,
  currentPosition: null,
  positionLoading: true,
  suspendSharedWatch: () => {},
  resumeSharedWatch: () => {},
});

export function useLocationGate() {
  return useContext(LocationContext);
}

const GPS_CHECK_INTERVAL = 4000;
const BG_PERMISSION_CHECK_INTERVAL = 30000;

export function LocationProvider({ children }: { children: React.ReactNode }) {
  const [hasPermission, setHasPermission] = useState(true);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [permissionPrompt, setPermissionPrompt] = useState(false);
  const [hasBackgroundPermission, setHasBackgroundPermission] = useState(false);
  const [backgroundPermissionChecked, setBackgroundPermissionChecked] = useState(false);
  const [backgroundPermissionRevoked, setBackgroundPermissionRevoked] = useState(false);
  const [positionReady] = useState(true);

  const [currentPosition, setCurrentPosition] = useState<SharedPosition | null>(null);
  const [positionLoading, setPositionLoading] = useState(true);

  const appState = useRef(AppState.currentState);
  const hadBackgroundPermissionRef = useRef(false);
  const sharedWatchRef = useRef<import("expo-location").LocationSubscription | null>(null);
  const suspendedRef = useRef(false);

  const { data: gpsData } = useQuery<{ required: boolean }>({
    queryKey: ["/api/settings/gps-required"],
    staleTime: 30000,
  });
  const gpsRequired = gpsData?.required !== false;

  const checkPermission = useCallback(async () => {
    try {
      const { status } = await loc().getForegroundPermissionsAsync();
      setHasPermission(status === "granted");
      setPermissionDenied(status === "denied");
      setPermissionPrompt(status === "undetermined");
    } catch {
      setHasPermission(true);
      setPermissionDenied(false);
      setPermissionPrompt(false);
    }
  }, []);

  const checkBackgroundPermission = useCallback(async () => {
    try {
      const { status } = await loc().getBackgroundPermissionsAsync();
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

  const requestPermission = useCallback(async (): Promise<boolean> => {
    try {
      const { status } = await loc().requestForegroundPermissionsAsync();
      const granted = status === "granted";
      setHasPermission(granted);
      setPermissionDenied(status === "denied");
      setPermissionPrompt(status === "undetermined");
      return granted;
    } catch {
      setHasPermission(true);
      setPermissionDenied(false);
      setPermissionPrompt(false);
      return true;
    }
  }, []);

  const requestBackgroundPermission = useCallback(async (): Promise<boolean> => {
    try {
      const { status } = await loc().requestBackgroundPermissionsAsync();
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

  const startSharedWatch = useCallback(async () => {
    if (sharedWatchRef.current) return;
    if (suspendedRef.current) return;
    try {
      const { status } = await loc().getForegroundPermissionsAsync();
      if (status !== "granted") {
        setPositionLoading(false);
        return;
      }
      sharedWatchRef.current = await loc().watchPositionAsync(
        {
          accuracy: loc().Accuracy.Balanced,
          timeInterval: 5000,
          distanceInterval: 10,
        },
        (locationObj) => {
          setCurrentPosition({
            latitude: locationObj.coords.latitude,
            longitude: locationObj.coords.longitude,
          });
          setPositionLoading(false);
        }
      );
    } catch {
      setPositionLoading(false);
    }
  }, []);

  const stopSharedWatch = useCallback(() => {
    if (sharedWatchRef.current) {
      sharedWatchRef.current.remove();
      sharedWatchRef.current = null;
    }
  }, []);

  const suspendSharedWatch = useCallback(() => {
    suspendedRef.current = true;
    stopSharedWatch();
  }, [stopSharedWatch]);

  const resumeSharedWatch = useCallback(() => {
    suspendedRef.current = false;
    startSharedWatch();
  }, [startSharedWatch]);

  useEffect(() => {
    sendStartupBeacon("location_provider_mount");
  }, []);

  useEffect(() => {
    checkPermission();
    checkBackgroundPermission();
  }, [checkPermission, checkBackgroundPermission]);

  useEffect(() => {
    if (hasPermission) {
      startSharedWatch();
    } else {
      stopSharedWatch();
      setPositionLoading(false);
    }
    return () => {};
  }, [hasPermission, startSharedWatch, stopSharedWatch]);

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
      try {
        if (appState.current.match(/inactive|background/) && nextState === "active") {
          // Both checks are internally guarded and non-blocking; the try/catch
          // is a belt-and-braces guard so this native callback can never throw.
          checkPermission().catch(() => {});
          checkBackgroundPermission().catch(() => {});
        }
      } catch {
        // no-op: never let the AppState callback crash the app on resume
      }
      appState.current = nextState;
    });
    return () => subscription.remove();
  }, [checkPermission, checkBackgroundPermission]);

  useEffect(() => {
    return () => {
      stopSharedWatch();
    };
  }, [stopSharedWatch]);

  const isGpsGateActive = gpsRequired && !hasPermission;

  return (
    <LocationContext.Provider value={{
      hasLocationPermission: hasPermission,
      locationPermissionDenied: permissionDenied,
      locationPermissionPrompt: permissionPrompt,
      hasBackgroundPermission,
      backgroundPermissionChecked,
      backgroundPermissionRevoked,
      gpsRequired,
      isGpsGateActive,
      requestPermission,
      requestBackgroundPermission,
      positionReady,
      currentPosition,
      positionLoading,
      suspendSharedWatch,
      resumeSharedWatch,
    }}>
      {children}
    </LocationContext.Provider>
  );
}
