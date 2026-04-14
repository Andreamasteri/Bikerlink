import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { Platform, AppState, AppStateStatus, Modal, View, Text, TouchableOpacity, StyleSheet } from "react-native";
import * as Location from "expo-location";
import { useQuery } from "@tanstack/react-query";
import Colors from "@/constants/colors";

interface LocationContextType {
  hasLocationPermission: boolean;
  hasBackgroundPermission: boolean;
  gpsRequired: boolean;
  isGpsGateActive: boolean;
  bgPermissionRevoked: boolean;
  requestPermission: () => Promise<boolean>;
  requestBackgroundPermission: () => Promise<boolean>;
  dismissBgRevokedBanner: () => void;
}

const LocationContext = createContext<LocationContextType>({
  hasLocationPermission: true,
  hasBackgroundPermission: false,
  gpsRequired: true,
  isGpsGateActive: false,
  bgPermissionRevoked: false,
  requestPermission: async () => true,
  requestBackgroundPermission: async () => false,
  dismissBgRevokedBanner: () => {},
});

export function useLocationGate() {
  return useContext(LocationContext);
}

const GPS_CHECK_INTERVAL = 4000;

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

function BgPermissionExplainerModal({
  visible,
  onConfirm,
  onDismiss,
}: {
  visible: boolean;
  onConfirm: () => void;
  onDismiss: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <View style={explainerStyles.overlay}>
        <View style={explainerStyles.card}>
          <Text style={explainerStyles.title}>Posizione in Background</Text>
          <Text style={explainerStyles.body}>
            BikerLink ha bisogno di accedere alla tua posizione anche quando l'app è in background per tre motivi:
          </Text>
          <View style={explainerStyles.reasonRow}>
            <Text style={explainerStyles.bullet}>🏍️</Text>
            <Text style={explainerStyles.reasonText}>
              <Text style={explainerStyles.bold}>Tracciamento percorsi</Text> — il tracciato non si interrompe se passi ad un'altra app o spegni lo schermo.
            </Text>
          </View>
          <View style={explainerStyles.reasonRow}>
            <Text style={explainerStyles.bullet}>🆘</Text>
            <Text style={explainerStyles.reasonText}>
              <Text style={explainerStyles.bold}>Emergenza SOS</Text> — il server conosce la tua posizione anche a schermo spento per inviare soccorsi.
            </Text>
          </View>
          <View style={explainerStyles.reasonRow}>
            <Text style={explainerStyles.bullet}>🛡️</Text>
            <Text style={explainerStyles.reasonText}>
              <Text style={explainerStyles.bold}>Sicurezza community</Text> — ricevi avvisi SOS dai biker vicini in tempo reale.
            </Text>
          </View>
          <Text style={explainerStyles.hint}>
            Nella schermata successiva scegli "Consenti sempre" per abilitare questa funzione.
          </Text>
          <View style={explainerStyles.actions}>
            <TouchableOpacity style={explainerStyles.dismissBtn} onPress={onDismiss}>
              <Text style={explainerStyles.dismissText}>Non ora</Text>
            </TouchableOpacity>
            <TouchableOpacity style={explainerStyles.confirmBtn} onPress={onConfirm}>
              <Text style={explainerStyles.confirmText}>Continua</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export function LocationProvider({ children }: { children: React.ReactNode }) {
  const [hasPermission, setHasPermission] = useState(true);
  const [hasBgPermission, setHasBgPermission] = useState(false);
  const [bgPermissionRevoked, setBgPermissionRevoked] = useState(false);
  const [showBgExplainer, setShowBgExplainer] = useState(false);
  const bgExplainerResolve = useRef<((v: boolean) => void) | null>(null);
  const appState = useRef(AppState.currentState);
  const permissionStatusRef = useRef<PermissionStatus | null>(null);

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
      bgExplainerResolve.current = resolve;
      setShowBgExplainer(true);
    });
  }, []);

  const handleExplainerConfirm = useCallback(async () => {
    setShowBgExplainer(false);
    const resolve = bgExplainerResolve.current;
    bgExplainerResolve.current = null;
    try {
      const { status } = await Location.requestBackgroundPermissionsAsync();
      const granted = status === "granted";
      setHasBgPermission(granted);
      if (granted) setBgPermissionRevoked(false);
      resolve?.(granted);
    } catch {
      resolve?.(false);
    }
  }, []);

  const handleExplainerDismiss = useCallback(() => {
    setShowBgExplainer(false);
    const resolve = bgExplainerResolve.current;
    bgExplainerResolve.current = null;
    resolve?.(false);
  }, []);

  const dismissBgRevokedBanner = useCallback(() => {
    setBgPermissionRevoked(false);
  }, []);

  useEffect(() => {
    checkPermission();
  }, [checkPermission]);

  useEffect(() => {
    if (!gpsRequired) return;
    if (Platform.OS === "web") return;

    const interval = setInterval(checkPermission, GPS_CHECK_INTERVAL);
    return () => clearInterval(interval);
  }, [gpsRequired, checkPermission]);

  useEffect(() => {
    if (Platform.OS === "web") return;

    const subscription = AppState.addEventListener("change", (nextState: AppStateStatus) => {
      if (appState.current.match(/inactive|background/) && nextState === "active") {
        checkPermission();
      }
      appState.current = nextState;
    });
    return () => subscription.remove();
  }, [checkPermission]);

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
      hasBackgroundPermission: hasBgPermission,
      gpsRequired,
      isGpsGateActive,
      bgPermissionRevoked,
      requestPermission,
      requestBackgroundPermission,
      dismissBgRevokedBanner,
    }}>
      {children}
      <BgPermissionExplainerModal
        visible={showBgExplainer}
        onConfirm={handleExplainerConfirm}
        onDismiss={handleExplainerDismiss}
      />
    </LocationContext.Provider>
  );
}

const explainerStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  card: {
    backgroundColor: Colors.dark.background,
    borderRadius: 16,
    padding: 24,
    width: "100%",
    maxWidth: 400,
  },
  title: {
    fontSize: 20,
    fontWeight: "700" as const,
    color: Colors.dark.text,
    marginBottom: 12,
    textAlign: "center",
  },
  body: {
    fontSize: 14,
    color: Colors.dark.textSecondary,
    marginBottom: 16,
    lineHeight: 20,
  },
  reasonRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 12,
    gap: 8,
  },
  bullet: {
    fontSize: 18,
    lineHeight: 22,
  },
  reasonText: {
    flex: 1,
    fontSize: 14,
    color: Colors.dark.textSecondary,
    lineHeight: 20,
  },
  bold: {
    fontWeight: "700" as const,
    color: Colors.dark.text,
  },
  hint: {
    fontSize: 12,
    color: Colors.dark.textSecondary,
    fontStyle: "italic",
    marginTop: 8,
    marginBottom: 20,
    textAlign: "center",
  },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
  },
  dismissBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  dismissText: {
    fontSize: 15,
    color: Colors.dark.textSecondary,
    fontWeight: "500" as const,
  },
  confirmBtn: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    backgroundColor: Colors.dark.primary,
  },
  confirmText: {
    fontSize: 15,
    color: "#FFFFFF",
    fontWeight: "600" as const,
  },
});
