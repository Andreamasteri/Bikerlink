import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { Platform, AppState, AppStateStatus, Alert } from "react-native";
import * as Location from "expo-location";
import { useQuery } from "@tanstack/react-query";
import { sendStartupBeacon } from "@/lib/startup-beacon";

interface LocationContextType {
  hasLocationPermission: boolean;
  hasBackgroundPermission: boolean;
  backgroundPermissionRevoked: boolean;
  gpsRequired: boolean;
  isGpsGateActive: boolean;
  requestPermission: () => Promise<boolean>;
  requestBackgroundPermission: () => Promise<boolean>;
}

const LocationContext = createContext<LocationContextType>({
  hasLocationPermission: true,
  hasBackgroundPermission: false,
  backgroundPermissionRevoked: false,
  gpsRequired: true,
  isGpsGateActive: false,
  requestPermission: async () => true,
  requestBackgroundPermission: async () => false,
});

export function useLocationGate() {
  return useContext(LocationContext);
}

const GPS_CHECK_INTERVAL = 4000;
const BG_PERMISSION_CHECK_INTERVAL = 30000;

function isWebPermissionsAvailable(): boolean {
  try {
    return Platform.OS === "web"
      && typeof navigator !== "undefined"
      && !!navigator.permissions
      && typeof navigator.permissions.query === "function";
  } catch {
    return false;
  }
}

export function LocationProvider({ children }: { children: React.ReactNode }) {
  const [hasPermission, setHasPermission] = useState(true);
  const [hasBackgroundPermission, setHasBackgroundPermission] = useState(false);
  const [backgroundPermissionRevoked, setBackgroundPermissionRevoked] = useState(false);
  const appState = useRef(AppState.currentState);
  const permissionStatusRef = useRef<PermissionStatus | null>(null);
  const hadBackgroundPermissionRef = useRef(false);

  const { data: gpsData } = useQuery<{ required: boolean }>({
    queryKey: ["/api/settings/gps-required"],
    staleTime: 30000,
  });
  const gpsRequired = gpsData?.required !== false;

  const checkPermission = useCallback(async () => {
    try {
      if (Platform.OS === "web") {
        if (isWebPermissionsAvailable()) {
          const result = await navigator.permissions.query({ name: "geolocation" as PermissionName });
          permissionStatusRef.current = result;
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

  const checkBackgroundPermission = useCallback(async () => {
    if (Platform.OS === "web") return;
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
    }
  }, []);

  const requestPermission = useCallback(async (): Promise<boolean> => {
    try {
      if (Platform.OS === "web") {
        if (typeof navigator === "undefined" || !navigator.geolocation) {
          setHasPermission(true);
          return true;
        }
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
      setHasPermission(true);
      return true;
    }
  }, []);

  const requestBackgroundPermission = useCallback(async (): Promise<boolean> => {
    if (Platform.OS === "web") return false;

    return new Promise<boolean>((resolve) => {
      Alert.alert(
        "Posizione in Background",
        "BikerLink ha bisogno della tua posizione anche quando l'app è minimizzata per:\n\n• Registrare percorsi in moto senza interruzioni\n• Inviare la posizione durante un'emergenza SOS\n• Mantenere la tua visibilità per la community\n\nTocca Continua e seleziona \"Sempre\" nella schermata successiva.",
        [
          {
            text: "Non ora",
            style: "cancel",
            onPress: () => resolve(false),
          },
          {
            text: "Continua",
            onPress: async () => {
              try {
                const { status } = await Location.requestBackgroundPermissionsAsync();
                const granted = status === "granted";
                setHasBackgroundPermission(granted);
                if (granted) {
                  hadBackgroundPermissionRef.current = true;
                  setBackgroundPermissionRevoked(false);
                }
                resolve(granted);
              } catch {
                resolve(false);
              }
            },
          },
        ]
      );
    });
  }, []);

  useEffect(() => {
    sendStartupBeacon("location_provider_mount");
  }, []);

  useEffect(() => {
    checkPermission();
    checkBackgroundPermission();
  }, [checkPermission, checkBackgroundPermission]);

  useEffect(() => {
    if (!gpsRequired) return;
    if (Platform.OS === "web") return;

    const interval = setInterval(checkPermission, GPS_CHECK_INTERVAL);
    return () => clearInterval(interval);
  }, [gpsRequired, checkPermission]);

  useEffect(() => {
    if (Platform.OS === "web") return;
    const interval = setInterval(checkBackgroundPermission, BG_PERMISSION_CHECK_INTERVAL);
    return () => clearInterval(interval);
  }, [checkBackgroundPermission]);

  useEffect(() => {
    if (Platform.OS === "web") return;

    const subscription = AppState.addEventListener("change", (nextState: AppStateStatus) => {
      if (appState.current.match(/inactive|background/) && nextState === "active") {
        checkPermission();
        checkBackgroundPermission();
      }
      appState.current = nextState;
    });
    return () => subscription.remove();
  }, [checkPermission, checkBackgroundPermission]);

  useEffect(() => {
    if (!isWebPermissionsAvailable()) return;

    let cleanup: (() => void) | null = null;
    let cancelled = false;

    navigator.permissions.query({ name: "geolocation" as PermissionName }).then((result) => {
      if (cancelled) return;
      const handler = () => {
        setHasPermission(result.state === "granted");
      };
      result.addEventListener("change", handler);
      cleanup = () => result.removeEventListener("change", handler);
    }).catch(() => {
      if (!cancelled) setHasPermission(true);
    });

    return () => {
      cancelled = true;
      if (cleanup) cleanup();
    };
  }, []);

  const isGpsGateActive = gpsRequired && !hasPermission;

  return (
    <LocationContext.Provider value={{
      hasLocationPermission: hasPermission,
      hasBackgroundPermission,
      backgroundPermissionRevoked,
      gpsRequired,
      isGpsGateActive,
      requestPermission,
      requestBackgroundPermission,
    }}>
      {children}
    </LocationContext.Provider>
  );
}
