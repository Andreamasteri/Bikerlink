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
  const [bgExplainerResolve, setBgExplainerResolve] = useState<((v: boolean) => void) | null>(null);
  const appState = useRef(AppState.currentState);
  const permissionStatusRef = useRef<PermissionStatus | null>(null);
  const prevHasBgPermission = useRef(false);
  const hasCheckedBgOnce = useRef(false);

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

  const checkBgPermission = useCallback(async () => {
    if (Platform.OS === "web") return;
    try {
      const { status } = await Location.getBackgroundPermissionsAsync();
      const granted = status === "granted";

      if (hasCheckedBgOnce.current && prevHasBgPermission.current && !granted) {
        setBgPermissionRevoked(true);
      }

      prevHasBgPermission.current = granted;
      hasCheckedBgOnce.current = true;
      setHasBgPermission(granted);
    } catch {
      setHasBgPermission(false);
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
    try {
      return new Promise<boolean>((resolve) => {
        setBgExplainerResolve(() => resolve);
        setShowBgExplainer(true);
      });
    } catch {
      return false;
    }
  }, []);

  const handleExplainerConfirm = useCallback(async () => {
    setShowBgExplainer(false);
    const resolve = bgExplainerResolve;
    setBgExplainerResolve(null);
    try {
      const { status } = await Location.requestBackgroundPermissionsAsync();
      const granted = status === "granted";
      setHasBgPermission(granted);
      prevHasBgPermission.current = granted;
      hasCheckedBgOnce.current = true;
      if (granted) setBgPermissionRevoked(false);
      resolve?.(granted);
    } catch {
      resolve?.(false);
    }
  }, [bgExplainerResolve]);

  const handleExplainerDismiss = useCallback(() => {
    setShowBgExplainer(false);
    const resolve = bgExplainerResolve;
    setBgExplainerResolve(null);
    resolve?.(false);
  }, [bgExplainerResolve]);

  const dismissBgRevokedBanner = useCallback(() => {
    setBgPermissionRevoked(false);
  }, []);

  useEffect(() => {
    checkPermission();
    checkBgPermission();
  }, [checkPermission, checkBgPermission]);

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
        checkBgPermission();
      }
      appState.current = nextState;
    });
    return () => subscription.remove();
  }, [checkPermission, checkBgPermission]);

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
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 24,
    width: "100%",
    maxWidth: 400,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  title: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 12,
    textAlign: "center",
  },
  body: {
    color: Colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 16,
  },
  reasonRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 12,
    gap: 10,
  },
  bullet: {
    fontSize: 18,
    lineHeight: 22,
  },
  reasonText: {
    flex: 1,
    color: Colors.text,
    fontSize: 13,
    lineHeight: 19,
  },
  bold: {
    fontWeight: "700",
  },
  hint: {
    color: Colors.accent,
    fontSize: 13,
    fontStyle: "italic",
    marginTop: 8,
    marginBottom: 20,
    lineHeight: 18,
  },
  actions: {
    flexDirection: "row",
    gap: 12,
  },
  dismissBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: "center",
  },
  dismissText: {
    color: Colors.textSecondary,
    fontSize: 14,
    fontWeight: "600",
  },
  confirmBtn: {
    flex: 2,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: Colors.accent,
    alignItems: "center",
  },
  confirmText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
  },
});
