import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { AppState, AppStateStatus, Platform } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { sendStartupBeacon } from "@/lib/startup-beacon";
import { apiRequest } from "@/lib/query-client";

// Lazy getter — evita che expo-location venga caricato al momento dell'inizializzazione
// del modulo (causa crash Android con inlineRequires: true).
let _expoLocation: typeof import("expo-location") | null = null;
function loc(): typeof import("expo-location") {
  if (_expoLocation === null) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    _expoLocation = require("expo-location") as typeof import("expo-location");
  }
  return _expoLocation!;
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
  webResolvedPosition: { latitude: number; longitude: number } | null;
  webPhonePositionAvailable: boolean | null;
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
  positionReady: false,
  webResolvedPosition: null,
  webPhonePositionAvailable: null,
});

export function useLocationGate() {
  return useContext(LocationContext);
}

const GPS_CHECK_INTERVAL = 4000;
const BG_PERMISSION_CHECK_INTERVAL = 30000;
const WEB_POSITION_POLL_INTERVAL = 30000;

export function LocationProvider({ children }: { children: React.ReactNode }) {
  const [hasPermission, setHasPermission] = useState(true);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [permissionPrompt, setPermissionPrompt] = useState(false);
  const [hasBackgroundPermission, setHasBackgroundPermission] = useState(false);
  const [backgroundPermissionChecked, setBackgroundPermissionChecked] = useState(false);
  const [backgroundPermissionRevoked, setBackgroundPermissionRevoked] = useState(false);
  const [positionReady, setPositionReady] = useState(Platform.OS !== "web");
  const [webResolvedPosition, setWebResolvedPosition] = useState<{ latitude: number; longitude: number } | null>(null);
  const [webPhonePositionAvailable, setWebPhonePositionAvailable] = useState<boolean | null>(null);
  const appState = useRef(AppState.currentState);
  const hadBackgroundPermissionRef = useRef(false);
  const webGpsDoneRef = useRef(false);
  const webPositionFoundRef = useRef(false);
  const lastMobileSourceRef = useRef<string | null>(null);

  const { data: gpsData } = useQuery<{ required: boolean }>({
    queryKey: ["/api/settings/gps-required"],
    staleTime: 30000,
  });
  const gpsRequired = gpsData?.required !== false;

  const checkPermission = useCallback(async () => {
    if (Platform.OS === "web") {
      if (typeof navigator !== "undefined" && navigator.geolocation) {
        if (navigator.permissions) {
          navigator.permissions.query({ name: "geolocation" as PermissionName }).then((result) => {
            const denied = result.state === "denied";
            const prompt = result.state === "prompt";
            setHasPermission(!denied);
            setPermissionDenied(denied);
            setPermissionPrompt(prompt);
          }).catch(() => {
            setHasPermission(true);
            setPermissionDenied(false);
            setPermissionPrompt(true);
          });
        } else {
          setHasPermission(true);
          setPermissionDenied(false);
          setPermissionPrompt(true);
        }
      } else {
        setHasPermission(true);
        setPermissionDenied(false);
        setPermissionPrompt(true);
      }
      return;
    }
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
    if (Platform.OS === "web") {
      setHasBackgroundPermission(false);
      setBackgroundPermissionChecked(true);
      return;
    }
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

  const tryResolveWebPositionFromDb = useCallback(async (): Promise<{ latitude: number; longitude: number; source: string | null } | null> => {
    try {
      const res = await apiRequest("GET", "/api/user/position");
      const data = await res.json();
      if (data?.latitude != null && data?.longitude != null) {
        return { latitude: data.latitude, longitude: data.longitude, source: data.source ?? null };
      }
    } catch {
      // no-op: last position recovery is best-effort
    }
    return null;
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
          async (pos) => {
            setHasPermission(true);
            setPermissionDenied(false);
            setPermissionPrompt(false);
            const browserPos = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
            const mobile = await tryResolveWebPositionFromDb();
            const best = mobile?.source === "live" ? { latitude: mobile.latitude, longitude: mobile.longitude } : browserPos;
            setWebResolvedPosition(best);
            setPositionReady(true);
            webPositionFoundRef.current = true;
            resolve(true);
          },
          () => {
            setHasPermission(false);
            if (navigator.permissions) {
              navigator.permissions.query({ name: "geolocation" as PermissionName }).then((result) => {
                const denied = result.state === "denied";
                setPermissionDenied(denied);
                setPermissionPrompt(!denied);
              }).catch(() => {
                setPermissionDenied(false);
                setPermissionPrompt(true);
              });
            } else {
              setPermissionDenied(false);
              setPermissionPrompt(true);
            }
            resolve(false);
          }
        );
      });
    }
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
    if (Platform.OS === "web") {
      return false;
    }
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
      tryResolveWebPositionFromDb().then((mobile) => {
        if (mobile) {
          setWebResolvedPosition({ latitude: mobile.latitude, longitude: mobile.longitude });
          setPositionReady(true);
          webPositionFoundRef.current = true;
        }
      });
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const browserPos = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
        const mobile = await tryResolveWebPositionFromDb();
        const best = mobile?.source === "live" ? { latitude: mobile.latitude, longitude: mobile.longitude } : browserPos;
        setWebResolvedPosition(best);
        setPositionReady(true);
        webPositionFoundRef.current = true;
      },
      async () => {
        const mobile = await tryResolveWebPositionFromDb();
        if (mobile) {
          setWebResolvedPosition({ latitude: mobile.latitude, longitude: mobile.longitude });
          setPositionReady(true);
          webPositionFoundRef.current = true;
        }
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
              async (pos) => {
                const browserPos = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
                const mobile = await tryResolveWebPositionFromDb();
                const best = mobile?.source === "live" ? { latitude: mobile.latitude, longitude: mobile.longitude } : browserPos;
                setWebResolvedPosition(best);
                setPositionReady(true);
                webPositionFoundRef.current = true;
              },
              async () => {
                const mobile = await tryResolveWebPositionFromDb();
                if (mobile) {
                  setWebResolvedPosition({ latitude: mobile.latitude, longitude: mobile.longitude });
                  setPositionReady(true);
                  webPositionFoundRef.current = true;
                }
              },
              { timeout: 5000, maximumAge: 30000 }
            );
          } else {
            const mobile = await tryResolveWebPositionFromDb();
            if (mobile) {
              setWebResolvedPosition({ latitude: mobile.latitude, longitude: mobile.longitude });
              setPositionReady(true);
              webPositionFoundRef.current = true;
            }
          }
        }).catch(async () => {
          const mobile = await tryResolveWebPositionFromDb();
          if (mobile) {
            setWebResolvedPosition({ latitude: mobile.latitude, longitude: mobile.longitude });
            setPositionReady(true);
            webPositionFoundRef.current = true;
          }
        });
      } else {
        const mobile = await tryResolveWebPositionFromDb();
        if (mobile) {
          setWebResolvedPosition({ latitude: mobile.latitude, longitude: mobile.longitude });
          setPositionReady(true);
          webPositionFoundRef.current = true;
        }
      }
    }, WEB_POSITION_POLL_INTERVAL);

    return () => clearInterval(interval);
  }, [tryResolveWebPositionFromDb]);

  useEffect(() => {
    if (Platform.OS !== "web") return;

    const interval = setInterval(async () => {
      const mobile = await tryResolveWebPositionFromDb();
      if (!mobile) return;

      const prevSource = lastMobileSourceRef.current;
      lastMobileSourceRef.current = mobile.source;

      if (mobile.source === "live") {
        setWebResolvedPosition({ latitude: mobile.latitude, longitude: mobile.longitude });
        setPositionReady(true);
        webPositionFoundRef.current = true;
      } else if (prevSource === "live" && mobile.source !== "live") {
        if (typeof navigator !== "undefined" && navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              setWebResolvedPosition({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
            },
            () => {},
            { timeout: 8000, maximumAge: 60000 }
          );
        }
      }
    }, WEB_POSITION_POLL_INTERVAL);

    return () => clearInterval(interval);
  }, [tryResolveWebPositionFromDb]);

  useEffect(() => {
    if (Platform.OS !== "web") return;

    const checkPhonePosition = async () => {
      try {
        const res = await apiRequest("GET", "/api/users/my-last-position");
        const data = await res.json();
        setWebPhonePositionAvailable(!!data?.available);
      } catch {
        setWebPhonePositionAvailable(null);
      }
    };

    checkPhonePosition();
    const interval = setInterval(checkPhonePosition, WEB_POSITION_POLL_INTERVAL);
    return () => clearInterval(interval);
  }, []);

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
      webResolvedPosition,
      webPhonePositionAvailable,
    }}>
      {children}
    </LocationContext.Provider>
  );
}
