import { useState, useEffect, useCallback, useRef } from "react";
import { Alert } from "react-native";
import * as Location from "expo-location";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/query-client";
import { useAuth } from "@/lib/auth-context";
import { useT } from "@/lib/language-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { MapTarget } from "@/components/ready/FakeZoneCoordPanel";
import {
  GPS_PRECISION_STORAGE_KEY,
  restartBackgroundLocationTaskWithPrecision,
} from "@/lib/background-location-task";

export function useReadyState() {
  const { user } = useAuth();
  const t = useT();

  const [infoModalVisible, setInfoModalVisible] = useState(false);
  const [showSosModal, setShowSosModal] = useState(false);
  const [sosReason, setSosReason] = useState("");
  const [sosRadiusKm, setSosRadiusKm] = useState(10);
  const [customRadius, setCustomRadius] = useState("");
  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [privacyExpanded, setPrivacyExpanded] = useState(false);
  const [gpsPrecisionExpanded, setGpsPrecisionExpanded] = useState(false);

  const [positionFuzz, setPositionFuzz] = useState(false);
  const [positionFuzzKm, setPositionFuzzKm] = useState(1);
  const [fakeHomeEnabled, setFakeHomeEnabled] = useState(false);
  const [homeLatitude, setHomeLatitude] = useState<number | null>(null);
  const [homeLongitude, setHomeLongitude] = useState<number | null>(null);
  const [fakeHomeLatitude, setFakeHomeLatitude] = useState<number | null>(null);
  const [fakeHomeLongitude, setFakeHomeLongitude] = useState<number | null>(null);
  const [fakeHomeRadius, setFakeHomeRadius] = useState(2);
  const [fakeWorkEnabled, setFakeWorkEnabled] = useState(false);
  const [workLatitude, setWorkLatitude] = useState<number | null>(null);
  const [workLongitude, setWorkLongitude] = useState<number | null>(null);
  const [fakeWorkLatitude, setFakeWorkLatitude] = useState<number | null>(null);
  const [fakeWorkLongitude, setFakeWorkLongitude] = useState<number | null>(null);
  const [fakeWorkRadius, setFakeWorkRadius] = useState(2);
  const [fakeWhateverEnabled, setFakeWhateverEnabled] = useState(false);
  const [whateverLatitude, setWhateverLatitude] = useState<number | null>(null);
  const [whateverLongitude, setWhateverLongitude] = useState<number | null>(null);
  const [fakeWhateverLatitude, setFakeWhateverLatitude] = useState<number | null>(null);
  const [fakeWhateverLongitude, setFakeWhateverLongitude] = useState<number | null>(null);
  const [fakeWhateverRadius, setFakeWhateverRadius] = useState(2);
  const [gpsPrecision, setGpsPrecision] = useState("balanced");

  const [fixedPositionEnabled, setFixedPositionEnabled] = useState(false);
  const [fixedPositionLat, setFixedPositionLat] = useState<number | null>(null);
  const [fixedPositionLng, setFixedPositionLng] = useState<number | null>(null);
  const [isSettingFixedPosition, setIsSettingFixedPosition] = useState(false);

  const [mapPickerVisible, setMapPickerVisible] = useState(false);
  const [mapPickerTarget, setMapPickerTarget] = useState<MapTarget>("homeReal");
  const [mapPickerCoord, setMapPickerCoord] = useState({ latitude: 41.9, longitude: 12.5 });
  const [mapPickerForFixed, setMapPickerForFixed] = useState(false);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  // Migration one-shot: vecchia chiave "user_ghost_mode" → "@bikerlink/ghost_mode_active"
  useEffect(() => {
    (async () => {
      try {
        const legacy = await AsyncStorage.getItem("user_ghost_mode");
        if (legacy !== null) {
          await AsyncStorage.setItem("@bikerlink/ghost_mode_active", legacy);
          await AsyncStorage.removeItem("user_ghost_mode");
        }
      } catch {
        // no-op: migration fallita, la chiave legacy verrà ignorata
      }
    })();
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function initLocation() {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === "granted" && !cancelled) {
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          if (!cancelled) setLocation({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
        }
      } catch (err) {
        console.warn("[ready] Location init fallita:", err);
      }
    }
    initLocation();
    return () => { cancelled = true; };
  }, []);

  const { data, isLoading } = useQuery({
    queryKey: ["/api/users/profile"],
  });

  const { data: meData } = useQuery({
    queryKey: ["/api/users/me"],
    enabled: !!user,
  });

  const { data: ghostSettingData } = useQuery<{ enabled: boolean }>({
    queryKey: ["/api/settings/ghost-mode-enabled"],
  });
  const ghostModeFeatureEnabled = ghostSettingData?.enabled === true;

  interface ProfileQueryData { isAvailable?: boolean; ghostMode?: boolean }
  const profileD = data as ProfileQueryData | undefined;
  const isAvailable = profileD?.isAvailable || false;
  const isGhostMode = profileD?.ghostMode || false;

  interface MeProfile {
    hideFromMap?: boolean; offlinePositionRandomize?: boolean;
    positionFuzz?: boolean; positionFuzzKm?: number;
    fakeHomeEnabled?: boolean; homeLatitude?: number | null; homeLongitude?: number | null;
    fakeHomeLatitude?: number | null; fakeHomeLongitude?: number | null; fakeHomeRadius?: number;
    fakeWorkEnabled?: boolean; workLatitude?: number | null; workLongitude?: number | null;
    fakeWorkLatitude?: number | null; fakeWorkLongitude?: number | null; fakeWorkRadius?: number;
    fakeWhateverEnabled?: boolean; whateverLatitude?: number | null; whateverLongitude?: number | null;
    fakeWhateverLatitude?: number | null; fakeWhateverLongitude?: number | null; fakeWhateverRadius?: number;
    gpsPrecision?: string;
    fixedPositionEnabled?: boolean; fixedPositionLat?: number | null; fixedPositionLng?: number | null;
  }
  interface MeQueryData { profile?: MeProfile | null }
  const meQ = meData as MeQueryData | undefined;
  const meProfile = meQ?.profile;
  const hideFromMap = meProfile?.hideFromMap ?? false;
  const offlineRandomize = meProfile?.offlinePositionRandomize !== false;

  useEffect(() => {
    const p = (meData as MeQueryData | undefined)?.profile;
    if (!p) return;
    setPositionFuzz(p.positionFuzz ?? false);
    setPositionFuzzKm(p.positionFuzzKm ?? 1);
    setFakeHomeEnabled(p.fakeHomeEnabled ?? false);
    setHomeLatitude(p.homeLatitude ?? null);
    setHomeLongitude(p.homeLongitude ?? null);
    setFakeHomeLatitude(p.fakeHomeLatitude ?? null);
    setFakeHomeLongitude(p.fakeHomeLongitude ?? null);
    setFakeHomeRadius(p.fakeHomeRadius ?? 2);
    setFakeWorkEnabled(p.fakeWorkEnabled ?? false);
    setWorkLatitude(p.workLatitude ?? null);
    setWorkLongitude(p.workLongitude ?? null);
    setFakeWorkLatitude(p.fakeWorkLatitude ?? null);
    setFakeWorkLongitude(p.fakeWorkLongitude ?? null);
    setFakeWorkRadius(p.fakeWorkRadius ?? 2);
    setFakeWhateverEnabled(p.fakeWhateverEnabled ?? false);
    setWhateverLatitude(p.whateverLatitude ?? null);
    setWhateverLongitude(p.whateverLongitude ?? null);
    setFakeWhateverLatitude(p.fakeWhateverLatitude ?? null);
    setFakeWhateverLongitude(p.fakeWhateverLongitude ?? null);
    setFakeWhateverRadius(p.fakeWhateverRadius ?? 2);
    const precision = p.gpsPrecision ?? "balanced";
    setGpsPrecision(precision);
    AsyncStorage.setItem(GPS_PRECISION_STORAGE_KEY, precision).catch(() => {});
    setFixedPositionEnabled(p.fixedPositionEnabled ?? false);
    setFixedPositionLat(p.fixedPositionLat ?? null);
    setFixedPositionLng(p.fixedPositionLng ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [(meData as MeQueryData | undefined)?.profile]);

  const invalidateOnlineQueries = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/users/profile"] });
    queryClient.invalidateQueries({ queryKey: ["/api/users/biker-available-count"] });
    queryClient.invalidateQueries({ queryKey: ["/api/users/zavorrine-available-count"] });
    queryClient.invalidateQueries({ queryKey: ["/api/users/online-count"] });
    queryClient.invalidateQueries({ queryKey: ["/api/users/biker-available-list"] });
    queryClient.invalidateQueries({ queryKey: ["/api/users/zavorrine-available-list"] });
    queryClient.invalidateQueries({ queryKey: ["/api/users/online-list"] });
    queryClient.invalidateQueries({ queryKey: ["/api/users/nearby"] });
  };

  const showToast = (msg: string) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToastMsg(msg);
    toastTimerRef.current = setTimeout(() => setToastMsg(null), 2500);
  };

  const toggleMutation = useMutation({
    mutationFn: async (newVal: boolean) => {
      await apiRequest("PUT", "/api/users/profile/dynamic", {
        isAvailable: newVal,
      });
      return newVal;
    },
    onSuccess: (_data: boolean, variables: boolean) => {
      invalidateOnlineQueries();
      showToast(variables ? t("ready.nowAvailable") : t("ready.noLongerAvailable"));
    },
    onError: () => {
      Alert.alert(t("common.error"), t("ready.toggleError"));
    },
  });

  const ghostMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      await apiRequest("PUT", "/api/users/me/ghost-mode", { enabled });
      return enabled;
    },
    onSuccess: (enabled: boolean) => {
      invalidateOnlineQueries();
      queryClient.invalidateQueries({ queryKey: ["/api/users/me"] });
      AsyncStorage.setItem("@bikerlink/ghost_mode_active", enabled ? "true" : "false").catch(() => {
        // no-op: ignore storage write failures
      });
    },
    onError: () => {
      Alert.alert(t("common.error"), t("ride.ghostModeNotAvailable"));
    },
  });

  const repushLocation = useCallback(async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return;
      const loc =
        (await Location.getLastKnownPositionAsync()) ??
        (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
      if (loc) {
        await apiRequest("PUT", "/api/users/location", {
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
        });
      }
    } catch {
      // no-op: ignore location update failures in repushLocation
    }
  }, []);

  const privacyMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      await apiRequest("PUT", "/api/users/me/privacy", payload);
    },
    onSuccess: (_: unknown, variables: Record<string, unknown>) => {
      invalidateOnlineQueries();
      queryClient.invalidateQueries({ queryKey: ["/api/users/me"] });
      if (
        variables.positionFuzz === true ||
        variables.fakeHomeEnabled === true ||
        variables.fakeWorkEnabled === true ||
        variables.fakeWhateverEnabled === true
      ) {
        repushLocation();
      }
      if (typeof variables.gpsPrecision === "string") {
        const newPrecision = variables.gpsPrecision;
        AsyncStorage.setItem(GPS_PRECISION_STORAGE_KEY, newPrecision).catch(() => {});
        restartBackgroundLocationTaskWithPrecision(newPrecision).catch(() => {});
      }
    },
    onError: (_err: Error, variables: Record<string, unknown>) => {
      if (variables.positionFuzz !== undefined) setPositionFuzz(!variables.positionFuzz);
      if (variables.fakeHomeEnabled !== undefined) setFakeHomeEnabled(!variables.fakeHomeEnabled);
      if (variables.fakeWorkEnabled !== undefined) setFakeWorkEnabled(!variables.fakeWorkEnabled);
      if (variables.fakeWhateverEnabled !== undefined) setFakeWhateverEnabled(!variables.fakeWhateverEnabled);
      Alert.alert(t("common.error"), t("ready.toggleError"));
    },
  });

  const handleToggle = () => {
    toggleMutation.mutate(!isAvailable);
  };

  const openMapPicker = (target: MapTarget, lat?: number | null, lng?: number | null) => {
    setMapPickerForFixed(false);
    setMapPickerTarget(target);
    setMapPickerCoord({ latitude: lat ?? location?.latitude ?? 41.9, longitude: lng ?? location?.longitude ?? 12.5 });
    setMapPickerVisible(true);
  };

  const openFixedPositionMapPicker = () => {
    setMapPickerForFixed(true);
    setMapPickerCoord({ latitude: fixedPositionLat ?? location?.latitude ?? 41.9, longitude: fixedPositionLng ?? location?.longitude ?? 12.5 });
    setMapPickerVisible(true);
  };

  const confirmMapPicker = () => {
    const lat = mapPickerCoord.latitude;
    const lng = mapPickerCoord.longitude;
    if (mapPickerForFixed) {
      setFixedPositionLat(lat);
      setFixedPositionLng(lng);
      privacyMutation.mutate({ fixedPositionEnabled: true, fixedPositionLat: lat, fixedPositionLng: lng });
      setMapPickerVisible(false);
      return;
    }
    const updates: Record<string, number> = {};
    if (mapPickerTarget === "homeReal") { setHomeLatitude(lat); setHomeLongitude(lng); updates.homeLatitude = lat; updates.homeLongitude = lng; }
    else if (mapPickerTarget === "homeFake") { setFakeHomeLatitude(lat); setFakeHomeLongitude(lng); updates.fakeHomeLatitude = lat; updates.fakeHomeLongitude = lng; }
    else if (mapPickerTarget === "workReal") { setWorkLatitude(lat); setWorkLongitude(lng); updates.workLatitude = lat; updates.workLongitude = lng; }
    else if (mapPickerTarget === "workFake") { setFakeWorkLatitude(lat); setFakeWorkLongitude(lng); updates.fakeWorkLatitude = lat; updates.fakeWorkLongitude = lng; }
    else if (mapPickerTarget === "whateverReal") { setWhateverLatitude(lat); setWhateverLongitude(lng); updates.whateverLatitude = lat; updates.whateverLongitude = lng; }
    else if (mapPickerTarget === "whateverFake") { setFakeWhateverLatitude(lat); setFakeWhateverLongitude(lng); updates.fakeWhateverLatitude = lat; updates.fakeWhateverLongitude = lng; }
    privacyMutation.mutate(updates);
    setMapPickerVisible(false);
  };

  const setFixedPositionFromGPS = useCallback(async () => {
    try {
      setIsSettingFixedPosition(true);
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permesso negato", "Concedi l'accesso alla posizione nelle impostazioni.");
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const lat = loc.coords.latitude;
      const lng = loc.coords.longitude;
      setFixedPositionLat(lat);
      setFixedPositionLng(lng);
      privacyMutation.mutate({ fixedPositionEnabled: true, fixedPositionLat: lat, fixedPositionLng: lng });
    } catch {
      Alert.alert("Errore GPS", "Impossibile ottenere la posizione.");
    } finally {
      setIsSettingFixedPosition(false);
    }
  }, [privacyMutation]);

  const pickFromGPS = async (target: MapTarget) => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permesso negato", "Concedi l'accesso alla posizione nelle impostazioni.");
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const lat = loc.coords.latitude;
      const lng = loc.coords.longitude;
      const updates: Record<string, number> = {};
      if (target === "homeReal") { setHomeLatitude(lat); setHomeLongitude(lng); updates.homeLatitude = lat; updates.homeLongitude = lng; }
      else if (target === "homeFake") { setFakeHomeLatitude(lat); setFakeHomeLongitude(lng); updates.fakeHomeLatitude = lat; updates.fakeHomeLongitude = lng; }
      else if (target === "workReal") { setWorkLatitude(lat); setWorkLongitude(lng); updates.workLatitude = lat; updates.workLongitude = lng; }
      else if (target === "workFake") { setFakeWorkLatitude(lat); setFakeWorkLongitude(lng); updates.fakeWorkLatitude = lat; updates.fakeWorkLongitude = lng; }
      else if (target === "whateverReal") { setWhateverLatitude(lat); setWhateverLongitude(lng); updates.whateverLatitude = lat; updates.whateverLongitude = lng; }
      else if (target === "whateverFake") { setFakeWhateverLatitude(lat); setFakeWhateverLongitude(lng); updates.fakeWhateverLatitude = lat; updates.fakeWhateverLongitude = lng; }
      privacyMutation.mutate(updates);
    } catch {
      Alert.alert("Errore GPS", "Impossibile ottenere la posizione.");
    }
  };

  return {
    t,
    user,
    infoModalVisible, setInfoModalVisible,
    showSosModal, setShowSosModal,
    sosReason, setSosReason,
    sosRadiusKm, setSosRadiusKm,
    customRadius, setCustomRadius,
    location,
    toastMsg,
    privacyExpanded, setPrivacyExpanded,
    gpsPrecisionExpanded, setGpsPrecisionExpanded,
    positionFuzz, setPositionFuzz,
    positionFuzzKm, setPositionFuzzKm,
    fakeHomeEnabled, setFakeHomeEnabled,
    homeLatitude, homeLongitude,
    fakeHomeLatitude, fakeHomeLongitude,
    fakeHomeRadius, setFakeHomeRadius,
    fakeWorkEnabled, setFakeWorkEnabled,
    workLatitude, workLongitude,
    fakeWorkLatitude, fakeWorkLongitude,
    fakeWorkRadius, setFakeWorkRadius,
    fakeWhateverEnabled, setFakeWhateverEnabled,
    whateverLatitude, whateverLongitude,
    fakeWhateverLatitude, fakeWhateverLongitude,
    fakeWhateverRadius, setFakeWhateverRadius,
    gpsPrecision, setGpsPrecision,
    fixedPositionEnabled, setFixedPositionEnabled,
    fixedPositionLat, setFixedPositionLat,
    fixedPositionLng, setFixedPositionLng,
    isSettingFixedPosition,
    setFixedPositionFromGPS,
    openFixedPositionMapPicker,
    mapPickerVisible, setMapPickerVisible,
    mapPickerCoord, setMapPickerCoord,
    mapPickerForFixed,
    ghostModeFeatureEnabled,
    isAvailable,
    isGhostMode,
    hideFromMap,
    offlineRandomize,
    isLoading,
    toggleMutation,
    ghostMutation,
    privacyMutation,
    handleToggle,
    openMapPicker,
    confirmMapPicker,
    pickFromGPS,
  };
}
