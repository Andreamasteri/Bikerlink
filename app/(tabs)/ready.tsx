import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
  ActivityIndicator,
  ScrollView,
  Modal,
  Alert,
  TextInput,
  Image,
  KeyboardAvoidingView,
  Switch,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import Colors from "@/constants/colors";
import { InlineMiniPlayer } from "@/components/MiniPlayer";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/lib/auth-context";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient, getApiUrl } from "@/lib/query-client";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSetting } from "@/lib/settings-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useT } from "@/lib/language-context";
import * as Location from "expo-location";
import LeafletPickerMap from "@/components/LeafletPickerMap";

const sosLaunchIcon = require("@/assets/images/sos-launch-icon.png");

type MapTarget =
  | "homeReal"
  | "homeFake"
  | "workReal"
  | "workFake"
  | "whateverReal"
  | "whateverFake";

type VisibilitySummaryProps = {
  isAvailable: boolean;
  isGhostMode: boolean;
  hideFromMap: boolean;
  offlineRandomize: boolean;
};

function getVisibilitySummary(props: VisibilitySummaryProps): {
  label: string;
  icon: "eye-off" | "eye" | "location-outline" | "shuffle-outline";
  color: string;
  bg: string;
} {
  const { isAvailable, isGhostMode, hideFromMap, offlineRandomize } = props;

  if (!isAvailable) {
    return {
      label: "Non visibile",
      icon: "eye-off",
      color: "#fff",
      bg: Colors.textSecondary,
    };
  }
  if (isGhostMode) {
    return {
      label: "Ghost mode attivo",
      icon: "eye-off",
      color: "#fff",
      bg: "#555",
    };
  }
  if (hideFromMap) {
    return {
      label: "Nascosto dalla mappa",
      icon: "location-outline",
      color: "#fff",
      bg: Colors.accentRed,
    };
  }
  if (offlineRandomize) {
    return {
      label: "Posizione offuscata",
      icon: "shuffle-outline",
      color: "#fff",
      bg: "#E07B00",
    };
  }
  return {
    label: "Visibile a tutti",
    icon: "eye",
    color: "#fff",
    bg: Colors.success,
  };
}

function VisibilitySummary(props: VisibilitySummaryProps) {
  const summary = getVisibilitySummary(props);
  return (
    <View style={[visStyles.badge, { backgroundColor: summary.bg }]}>
      <Ionicons name={summary.icon} size={14} color={summary.color} />
      <Text style={[visStyles.label, { color: summary.color }]}>{summary.label}</Text>
    </View>
  );
}

const visStyles = StyleSheet.create({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    marginBottom: 4,
    alignSelf: "center",
  },
  label: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
});

function FakeZoneCoordPanel({
  realLabel,
  fakeLabel,
  realLat,
  realLng,
  fakeLat,
  fakeLng,
  realTarget,
  fakeTarget,
  colors,
  onPickGPS,
  onOpenMap,
}: {
  realLabel: string;
  fakeLabel: string;
  realLat: number | null;
  realLng: number | null;
  fakeLat: number | null;
  fakeLng: number | null;
  realTarget: MapTarget;
  fakeTarget: MapTarget;
  colors: ReturnType<typeof useColors>;
  onPickGPS: (target: MapTarget) => void;
  onOpenMap: (target: MapTarget, lat?: number | null, lng?: number | null) => void;
}) {
  return (
    <View style={{ marginTop: 8, borderRadius: 10, borderWidth: 1, borderColor: colors.border, overflow: "hidden" }}>
      <View style={{ padding: 10, backgroundColor: colors.background }}>
        <Text style={{ fontSize: 12, fontFamily: "Inter_500Medium", color: colors.textSecondary, marginBottom: 4 }}>
          {realLabel}
        </Text>
        <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: colors.text, marginBottom: 6 }}>
          {realLat != null && realLng != null
            ? `${realLat.toFixed(5)}, ${realLng.toFixed(5)}`
            : "Non impostata"}
        </Text>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Pressable
            style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }}
            onPress={() => onPickGPS(realTarget)}
          >
            <Ionicons name="locate" size={13} color={colors.text} />
            <Text style={{ fontSize: 12, fontFamily: "Inter_500Medium", color: colors.text }}>GPS</Text>
          </Pressable>
          <Pressable
            style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }}
            onPress={() => onOpenMap(realTarget, realLat, realLng)}
          >
            <Ionicons name="map-outline" size={13} color={colors.text} />
            <Text style={{ fontSize: 12, fontFamily: "Inter_500Medium", color: colors.text }}>Mappa</Text>
          </Pressable>
        </View>
      </View>
      <View style={{ height: 1, backgroundColor: colors.border }} />
      <View style={{ padding: 10, backgroundColor: colors.background }}>
        <Text style={{ fontSize: 12, fontFamily: "Inter_500Medium", color: colors.textSecondary, marginBottom: 4 }}>
          {fakeLabel}
        </Text>
        <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: colors.text, marginBottom: 6 }}>
          {fakeLat != null && fakeLng != null
            ? `${fakeLat.toFixed(5)}, ${fakeLng.toFixed(5)}`
            : "Non impostata"}
        </Text>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Pressable
            style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }}
            onPress={() => onPickGPS(fakeTarget)}
          >
            <Ionicons name="locate" size={13} color={colors.text} />
            <Text style={{ fontSize: 12, fontFamily: "Inter_500Medium", color: colors.text }}>GPS</Text>
          </Pressable>
          <Pressable
            style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }}
            onPress={() => onOpenMap(fakeTarget, fakeLat, fakeLng)}
          >
            <Ionicons name="map-outline" size={13} color={colors.text} />
            <Text style={{ fontSize: 12, fontFamily: "Inter_500Medium", color: colors.text }}>Mappa</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

export default function ReadyToRideScreen() {
  const colors = useColors();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const sosEnabled = useSetting("sosEnabled");
  const t = useT();

  const [infoModalVisible, setInfoModalVisible] = useState(false);
  const [showSosModal, setShowSosModal] = useState(false);
  const [sosReason, setSosReason] = useState("");
  const [sosRadiusKm, setSosRadiusKm] = useState(10);
  const [customRadius, setCustomRadius] = useState("");
  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const toastTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const [mapPickerVisible, setMapPickerVisible] = useState(false);
  const [mapPickerTarget, setMapPickerTarget] = useState<MapTarget>("homeReal");
  const [mapPickerCoord, setMapPickerCoord] = useState({ latitude: 41.9, longitude: 12.5 });

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
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

  const isAvailable = (data as any)?.isAvailable || false;
  const isGhostMode = (data as any)?.ghostMode || false;

  const meProfile = (meData as any)?.profile;
  const hideFromMap = meProfile?.hideFromMap ?? false;
  const offlineRandomize = meProfile?.offlinePositionRandomize !== false;

  useEffect(() => {
    const p = (meData as any)?.profile;
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
    setGpsPrecision(p.gpsPrecision ?? "balanced");
  }, [(meData as any)?.profile]);

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
      AsyncStorage.setItem("user_ghost_mode", enabled ? "true" : "false").catch(() => {});
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
    } catch {}
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
    setMapPickerTarget(target);
    setMapPickerCoord({ latitude: lat ?? 41.9, longitude: lng ?? 12.5 });
    setMapPickerVisible(true);
  };

  const confirmMapPicker = () => {
    const lat = mapPickerCoord.latitude;
    const lng = mapPickerCoord.longitude;
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

  const mySosQuery = useQuery<any>({
    queryKey: ["/api/sos/my"],
    staleTime: 10000,
    refetchInterval: 10000,
    enabled: !!user && sosEnabled,
  });

  const createSosMutation = useMutation({
    mutationFn: async (d: { reason: string; latitude: number; longitude: number; radiusKm: number }) => {
      const res = await apiRequest("POST", "/api/sos", d);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sos/my"] });
      queryClient.invalidateQueries({ queryKey: ["/api/sos/active"] });
      setShowSosModal(false);
      setSosReason("");
      setSosRadiusKm(10);
      setCustomRadius("");
    },
    onError: (error: Error) => {
      Alert.alert("Errore", error.message);
    },
  });

  const cancelSosMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("PUT", `/api/sos/${id}/cancel`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sos/my"] });
      queryClient.invalidateQueries({ queryKey: ["/api/sos/active"] });
    },
    onError: (error: Error) => {
      Alert.alert("Errore", error.message);
    },
  });

  const gpsOptions = [
    { key: "lowest", label: t("profile.gpsLowestLabel"), desc: t("profile.gpsLowestDesc"), icon: "battery-half-outline" },
    { key: "balanced", label: t("profile.gpsBalancedLabel"), desc: t("profile.gpsBalancedDesc"), icon: "compass-outline" },
    { key: "high", label: t("profile.gpsHighLabel"), desc: t("profile.gpsHighDesc"), icon: "locate-outline" },
    { key: "highest", label: t("profile.gpsHighestLabel"), desc: t("profile.gpsHighestDesc"), icon: "navigate-outline" },
    { key: "bestForNavigation", label: t("profile.gpsBestForNavLabel"), desc: t("profile.gpsBestForNavDesc"), icon: "map-outline" },
  ] as { key: string; label: string; desc: string; icon: string }[];

  if (isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top }}>
      <InlineMiniPlayer />

      <Pressable
        style={{ position: "absolute", top: insets.top + 8, right: 16, zIndex: 10, padding: 6 }}
        onPress={() => setInfoModalVisible(true)}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons name="information-circle-outline" size={26} color={colors.textSecondary} />
      </Pressable>

      <Modal
        visible={infoModalVisible}
        animationType="slide"
        transparent={false}
        onRequestClose={() => setInfoModalVisible(false)}
      >
        <View style={{ flex: 1, backgroundColor: colors.background }}>
          <View style={{
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: 16,
            paddingTop: insets.top + 8,
            paddingBottom: 14,
            backgroundColor: colors.surface,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
          }}>
            <Text style={{ flex: 1, fontSize: 17, fontFamily: "Inter_700Bold", color: colors.text }}>
              Come funziona questo schermo
            </Text>
            <Pressable onPress={() => setInfoModalVisible(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close" size={24} color={colors.textSecondary} />
            </Pressable>
          </View>

          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 32 }}
            showsVerticalScrollIndicator={false}
          >
            <View style={{ marginBottom: 24 }}>
              <Text style={{ fontSize: 15, fontFamily: "Inter_700Bold", color: colors.text, marginBottom: 10 }}>
                Disponibilità
              </Text>
              <View style={{ gap: 10 }}>
                <View style={{ backgroundColor: colors.surface, borderRadius: 12, padding: 14 }}>
                  <Text style={{ fontSize: 13, fontFamily: "Inter_700Bold", color: Colors.success, marginBottom: 4 }}>
                    Online disponibile
                  </Text>
                  <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: colors.text, lineHeight: 20 }}>
                    Hai premuto il pulsante verde. Sei visibile sulla mappa, appari nelle liste "disponibili" e la tua posizione viene aggiornata in tempo reale. Gli altri biker possono trovarti e contattarti.
                  </Text>
                </View>
                <View style={{ backgroundColor: colors.surface, borderRadius: 12, padding: 14 }}>
                  <Text style={{ fontSize: 13, fontFamily: "Inter_700Bold", color: "#E07B00", marginBottom: 4 }}>
                    Online non disponibile
                  </Text>
                  <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: colors.text, lineHeight: 20 }}>
                    Hai premuto il pulsante rosso ma l'app è ancora aperta. Risulti connesso all'app ma <Text style={{ fontFamily: "Inter_600SemiBold" }}>non appari nelle liste dei disponibili</Text>. La tua ultima posizione nota resta sulla mappa come punto "non disponibile". Puoi comunque usare chat e funzioni social.
                  </Text>
                </View>
                <View style={{ backgroundColor: colors.surface, borderRadius: 12, padding: 14 }}>
                  <Text style={{ fontSize: 13, fontFamily: "Inter_700Bold", color: Colors.accentRed, marginBottom: 4 }}>
                    Offline
                  </Text>
                  <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: colors.text, lineHeight: 20 }}>
                    L'app è chiusa o non ha connessione. La posizione non viene aggiornata e dopo qualche minuto di inattività il server ti rimuove automaticamente dalla mappa. Nessuno può vederti finché non riapri l'app.
                  </Text>
                </View>
              </View>
            </View>

            <View style={{ height: 1, backgroundColor: colors.border, marginBottom: 24 }} />

            <View style={{ marginBottom: 24 }}>
              <Text style={{ fontSize: 15, fontFamily: "Inter_700Bold", color: colors.text, marginBottom: 10 }}>
                Ghost Mode
              </Text>
              <View style={{ backgroundColor: colors.surface, borderRadius: 12, padding: 14 }}>
                <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: colors.text, lineHeight: 20 }}>
                  Quando attivo, risulti presente nell'app ma <Text style={{ fontFamily: "Inter_600SemiBold" }}>la tua posizione è nascosta</Text> agli altri utenti. Puoi vedere gli altri sulla mappa, ma nessuno può vedere te. Utile quando vuoi navigare senza essere disturbato.
                </Text>
              </View>
            </View>

            <View style={{ height: 1, backgroundColor: colors.border, marginBottom: 24 }} />

            <View style={{ marginBottom: 24 }}>
              <Text style={{ fontSize: 15, fontFamily: "Inter_700Bold", color: colors.text, marginBottom: 10 }}>
                Nascondi dalla mappa
              </Text>
              <View style={{ backgroundColor: colors.surface, borderRadius: 12, padding: 14 }}>
                <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: colors.text, lineHeight: 20 }}>
                  La tua icona <Text style={{ fontFamily: "Inter_600SemiBold" }}>non appare sulla mappa</Text> della community, anche se sei online e disponibile. Puoi comunque interagire con la chat e con le altre funzioni. Utile quando vuoi essere "raggiungibile" senza mostrare dove ti trovi.
                </Text>
              </View>
            </View>

            <View style={{ height: 1, backgroundColor: colors.border, marginBottom: 24 }} />

            <View style={{ marginBottom: 24 }}>
              <Text style={{ fontSize: 15, fontFamily: "Inter_700Bold", color: colors.text, marginBottom: 10 }}>
                Randomizza posizione
              </Text>
              <View style={{ backgroundColor: colors.surface, borderRadius: 12, padding: 14 }}>
                <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: colors.text, lineHeight: 20 }}>
                  Quando sei offline, invece di scomparire dalla mappa, la tua posizione viene <Text style={{ fontFamily: "Inter_600SemiBold" }}>spostata casualmente</Text> di qualche centinaio di metri rispetto alla tua posizione reale. Gli altri vedono un punto approssimativo, non la tua casa o il tuo garage esatto.
                </Text>
              </View>
            </View>

            <View style={{ height: 1, backgroundColor: colors.border, marginBottom: 24 }} />

            <View style={{ marginBottom: 24 }}>
              <Text style={{ fontSize: 15, fontFamily: "Inter_700Bold", color: colors.text, marginBottom: 10 }}>
                Privacy & Posizione
              </Text>
              <View style={{ gap: 10 }}>
                <View style={{ backgroundColor: colors.surface, borderRadius: 12, padding: 14 }}>
                  <Text style={{ fontSize: 13, fontFamily: "Inter_700Bold", color: colors.text, marginBottom: 4 }}>
                    Altera posizione (offuscamento)
                  </Text>
                  <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: colors.text, lineHeight: 20 }}>
                    Aggiunge un offset casuale alla tua posizione GPS prima di inviarla al server. Gli altri vedono un punto vicino a te, ma non esattamente dove sei. Disattivala durante i giri in gruppo per essere localizzato correttamente dai compagni.
                  </Text>
                </View>
                <View style={{ backgroundColor: colors.surface, borderRadius: 12, padding: 14 }}>
                  <Text style={{ fontSize: 13, fontFamily: "Inter_700Bold", color: colors.text, marginBottom: 4 }}>
                    Fake Home / Lavoro / Punto personalizzato
                  </Text>
                  <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: colors.text, lineHeight: 20 }}>
                    Permette di impostare una <Text style={{ fontFamily: "Inter_600SemiBold" }}>posizione falsa</Text> per casa, lavoro o un qualsiasi altro luogo. Quando sei in quell'area, l'app mostra la posizione falsa invece di quella reale, proteggendo la tua privacy in luoghi sensibili.
                  </Text>
                </View>
              </View>
            </View>

            <View style={{ height: 1, backgroundColor: colors.border, marginBottom: 24 }} />

            <View style={{ marginBottom: 24 }}>
              <Text style={{ fontSize: 15, fontFamily: "Inter_700Bold", color: colors.text, marginBottom: 10 }}>
                Precisione GPS
              </Text>
              <View style={{ gap: 10 }}>
                <View style={{ backgroundColor: colors.surface, borderRadius: 12, padding: 14 }}>
                  <Text style={{ fontSize: 13, fontFamily: "Inter_700Bold", color: colors.text, marginBottom: 4 }}>
                    Alta / Massima precisione
                  </Text>
                  <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: colors.text, lineHeight: 20 }}>
                    Usa il GPS a piena potenza. Posizione più accurata (1–5 m), ma consuma più batteria. Ideale per navigazione e giri in moto.
                  </Text>
                </View>
                <View style={{ backgroundColor: colors.surface, borderRadius: 12, padding: 14 }}>
                  <Text style={{ fontSize: 13, fontFamily: "Inter_700Bold", color: colors.text, marginBottom: 4 }}>
                    Bilanciata
                  </Text>
                  <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: colors.text, lineHeight: 20 }}>
                    Buon compromesso tra accuratezza (~10–50 m) e consumo batteria. Adatta all'uso quotidiano quando non stai navigando attivamente.
                  </Text>
                </View>
                <View style={{ backgroundColor: colors.surface, borderRadius: 12, padding: 14 }}>
                  <Text style={{ fontSize: 13, fontFamily: "Inter_700Bold", color: colors.text, marginBottom: 4 }}>
                    Risparmio energetico
                  </Text>
                  <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: colors.text, lineHeight: 20 }}>
                    Usa principalmente il Wi-Fi e la rete mobile per stimare la posizione. Molto meno precisa (~100–500 m), ma con impatto minimo sulla batteria. Utile quando sei fermo o vuoi solo segnalare la zona in cui ti trovi.
                  </Text>
                </View>
              </View>
            </View>

            <Pressable
              onPress={() => setInfoModalVisible(false)}
              style={{
                backgroundColor: colors.accent,
                borderRadius: 14,
                paddingVertical: 14,
                alignItems: "center",
                marginTop: 8,
              }}
            >
              <Text style={{ fontSize: 16, fontFamily: "Inter_700Bold", color: "#fff" }}>Chiudi</Text>
            </Pressable>
          </ScrollView>
        </View>
      </Modal>

      <Modal visible={mapPickerVisible} transparent={false} animationType="slide" onRequestClose={() => setMapPickerVisible(false)}>
        <View style={{ flex: 1, backgroundColor: Colors.background }}>
          <View style={{ flexDirection: "row", alignItems: "center", padding: 16, paddingTop: insets.top + 8, backgroundColor: Colors.card, borderBottomWidth: 1, borderBottomColor: Colors.border }}>
            <Pressable onPress={() => setMapPickerVisible(false)} style={{ marginRight: 12 }}>
              <Ionicons name="close" size={24} color={Colors.text} />
            </Pressable>
            <Text style={{ flex: 1, fontSize: 16, fontFamily: "Inter_600SemiBold", color: Colors.text }}>
              Seleziona posizione
            </Text>
            <Pressable
              onPress={confirmMapPicker}
              style={{ backgroundColor: Colors.accent, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 16 }}
            >
              <Text style={{ color: "#fff", fontFamily: "Inter_700Bold" }}>Conferma</Text>
            </Pressable>
          </View>
          <LeafletPickerMap
            initialLat={mapPickerCoord.latitude}
            initialLng={mapPickerCoord.longitude}
            initialZoom={12}
            selectedCoord={{ lat: mapPickerCoord.latitude, lng: mapPickerCoord.longitude }}
            onCoordPicked={(coord: { lat: number; lng: number }) =>
              setMapPickerCoord({ latitude: coord.lat, longitude: coord.lng })
            }
          />
          <View style={{ padding: 12, paddingBottom: insets.bottom + 8, backgroundColor: Colors.card }}>
            <Text style={{ textAlign: "center", fontFamily: "Inter_400Regular", color: Colors.textSecondary, fontSize: 13 }}>
              Tocca la mappa per spostare il pin
            </Text>
            <Text style={{ textAlign: "center", fontFamily: "Inter_500Medium", color: Colors.text, fontSize: 13, marginTop: 4 }}>
              {`${mapPickerCoord.latitude.toFixed(5)}, ${mapPickerCoord.longitude.toFixed(5)}`}
            </Text>
          </View>
        </View>
      </Modal>

      <ScrollView
        style={[styles.container, { backgroundColor: colors.background }]}
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingBottom: insets.bottom + 16,
          },
        ]}
      >
      <View style={styles.content}>
        <Ionicons
          name="bicycle"
          size={64}
          color={isAvailable ? Colors.success : Colors.accentRed}
        />

        <Text style={styles.statusText}>
          {isAvailable ? t("ready.statusAvailable") : t("map.unavailable")}
        </Text>
        <Text style={styles.statusSubtext}>
          {isAvailable
            ? t("ready.statusSubAvailable")
            : t("ready.statusSubUnavailable")}
        </Text>

        <Pressable
          style={[
            styles.toggleBtn,
            { backgroundColor: isAvailable ? Colors.success : Colors.accentRed },
          ]}
          onPress={handleToggle}
          disabled={toggleMutation.isPending || ghostMutation.isPending}
        >
          {toggleMutation.isPending ? (
            <ActivityIndicator color="#fff" size="large" />
          ) : (
            <Ionicons
              name={isAvailable ? "checkmark-circle" : "close-circle"}
              size={48}
              color="#fff"
            />
          )}
        </Pressable>

        {toastMsg !== null && (
          <View style={styles.toastContainer}>
            <Text style={styles.toastText}>{toastMsg}</Text>
          </View>
        )}

        <VisibilitySummary
          isAvailable={isAvailable}
          isGhostMode={isGhostMode}
          hideFromMap={hideFromMap}
          offlineRandomize={offlineRandomize}
        />

        <View style={styles.settingsGroup}>
          {ghostModeFeatureEnabled && (
            <View style={[styles.settingCard, { backgroundColor: colors.surface }]}>
              <View style={styles.privacyRow}>
                <Ionicons
                  name={isGhostMode ? "eye-off" : "eye"}
                  size={20}
                  color={isGhostMode ? Colors.accent : Colors.textSecondary}
                  style={styles.privacyRowIcon}
                />
                <View style={styles.privacyRowText}>
                  <Text style={styles.privacyRowLabel}>{t("ride.ghostMode")}</Text>
                  <Text style={styles.privacyRowDesc}>
                    {isGhostMode ? t("ride.ghostModeDesc") : t("ready.privacy.visibleOnMap")}
                  </Text>
                </View>
                <Switch
                  value={isGhostMode}
                  onValueChange={(val) => ghostMutation.mutate(val)}
                  disabled={ghostMutation.isPending}
                  trackColor={{ false: Colors.border, true: Colors.accent }}
                  thumbColor="#fff"
                />
              </View>
            </View>
          )}

          <View style={[styles.settingCard, { backgroundColor: colors.surface }]}>
            <View style={styles.privacyRow}>
              <Ionicons
                name="eye-off-outline"
                size={20}
                color={hideFromMap ? Colors.accent : Colors.textSecondary}
                style={styles.privacyRowIcon}
              />
              <View style={styles.privacyRowText}>
                <Text style={styles.privacyRowLabel}>{t("ready.privacy.hideFromMapLabel")}</Text>
                <Text style={styles.privacyRowDesc}>
                  {t("ready.privacy.hideFromMapDesc")}
                </Text>
              </View>
              <Switch
                value={hideFromMap}
                onValueChange={(val) => privacyMutation.mutate({ hideFromMap: val })}
                disabled={privacyMutation.isPending}
                trackColor={{ false: Colors.border, true: Colors.accent }}
                thumbColor="#fff"
              />
            </View>
          </View>

          <View style={[styles.settingCard, { backgroundColor: colors.surface }]}>
            <View style={styles.privacyRow}>
              <Ionicons
                name="shuffle-outline"
                size={20}
                color={offlineRandomize ? Colors.accent : Colors.textSecondary}
                style={styles.privacyRowIcon}
              />
              <View style={styles.privacyRowText}>
                <Text style={styles.privacyRowLabel}>{t("ready.privacy.offlineRandomizeLabel")}</Text>
                <Text style={styles.privacyRowDesc}>
                  {t("ready.privacy.offlineRandomizeDesc")}
                </Text>
              </View>
              <Switch
                value={offlineRandomize}
                onValueChange={(val) => privacyMutation.mutate({ offlinePositionRandomize: val })}
                disabled={privacyMutation.isPending}
                trackColor={{ false: Colors.border, true: Colors.accent }}
                thumbColor="#fff"
              />
            </View>
          </View>

          <View style={[styles.settingCard, { backgroundColor: colors.surface }]}>
            <Pressable style={styles.accordionHeader} onPress={() => setPrivacyExpanded((v) => !v)}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Ionicons name="shield-outline" size={18} color={Colors.accent} />
                <Text style={styles.accordionTitle}>Privacy & Posizione</Text>
              </View>
              <Ionicons name={privacyExpanded ? "chevron-up" : "chevron-down"} size={16} color={Colors.textSecondary} />
            </Pressable>

            {privacyExpanded && (
              <View style={styles.accordionContent}>
                <View style={styles.privacyRow}>
                  <Ionicons name="locate-outline" size={20} color={Colors.accent} style={styles.privacyRowIcon} />
                  <View style={styles.privacyRowText}>
                    <Text style={styles.privacyRowLabel}>Altera Posizione</Text>
                    {positionFuzz ? (
                      <Text style={styles.privacyWarning}>Disattivala prima di un giro in compagnia!</Text>
                    ) : (
                      <Text style={styles.privacyRowDesc}>Sposta randomicamente la posizione visibile.</Text>
                    )}
                  </View>
                  <Switch
                    value={positionFuzz}
                    onValueChange={(val) => { setPositionFuzz(val); privacyMutation.mutate({ positionFuzz: val }); }}
                    trackColor={{ false: Colors.border, true: Colors.accent }}
                    thumbColor="#fff"
                  />
                </View>
                {positionFuzz && (
                  <View style={styles.kmRow}>
                    <Ionicons name="resize-outline" size={15} color={Colors.textSecondary} />
                    <Text style={[styles.kmLabel, { color: Colors.textSecondary }]}>Raggio:</Text>
                    <TextInput
                      style={[styles.kmInput, { color: Colors.text, borderColor: Colors.border, backgroundColor: Colors.background }]}
                      keyboardType="number-pad"
                      value={String(positionFuzzKm)}
                      onChangeText={(v) => {
                        const n = parseInt(v, 10);
                        if (!isNaN(n) && n >= 1 && n <= 50) {
                          setPositionFuzzKm(n);
                          privacyMutation.mutate({ positionFuzzKm: n });
                        }
                      }}
                      maxLength={2}
                      selectTextOnFocus
                    />
                    <Text style={[styles.kmLabel, { color: Colors.textSecondary }]}>km (max 50)</Text>
                  </View>
                )}

                <View style={styles.privacyDivider} />

                <View style={styles.privacyRow}>
                  <Ionicons name="home-outline" size={20} color={Colors.accent} style={styles.privacyRowIcon} />
                  <View style={styles.privacyRowText}>
                    <Text style={styles.privacyRowLabel}>Fake Home</Text>
                    <Text style={styles.privacyRowDesc}>Vicino a casa, la posizione viene sostituita.</Text>
                  </View>
                  <Switch
                    value={fakeHomeEnabled}
                    onValueChange={(val) => { setFakeHomeEnabled(val); privacyMutation.mutate({ fakeHomeEnabled: val }); }}
                    trackColor={{ false: Colors.border, true: Colors.accent }}
                    thumbColor="#fff"
                  />
                </View>
                {fakeHomeEnabled && (
                  <>
                    <FakeZoneCoordPanel
                      realLabel="Posizione Casa (reale)"
                      fakeLabel="Posizione Fittizia"
                      realLat={homeLatitude}
                      realLng={homeLongitude}
                      fakeLat={fakeHomeLatitude}
                      fakeLng={fakeHomeLongitude}
                      realTarget="homeReal"
                      fakeTarget="homeFake"
                      colors={colors}
                      onPickGPS={pickFromGPS}
                      onOpenMap={openMapPicker}
                    />
                    <View style={styles.kmRow}>
                      <Text style={[styles.kmLabel, { color: Colors.textSecondary }]}>Raggio attivazione:</Text>
                      <TextInput
                        style={[styles.kmInput, { color: Colors.text, borderColor: Colors.border, backgroundColor: Colors.background }]}
                        keyboardType="number-pad"
                        value={String(fakeHomeRadius)}
                        onChangeText={(v) => {
                          const n = parseInt(v, 10);
                          if (!isNaN(n) && n >= 1 && n <= 100) {
                            setFakeHomeRadius(n);
                            privacyMutation.mutate({ fakeHomeRadius: n });
                          }
                        }}
                        maxLength={3}
                        selectTextOnFocus
                      />
                      <Text style={[styles.kmLabel, { color: Colors.textSecondary }]}>km</Text>
                    </View>
                  </>
                )}

                <View style={styles.privacyDivider} />

                <View style={styles.privacyRow}>
                  <Ionicons name="business-outline" size={20} color={Colors.accent} style={styles.privacyRowIcon} />
                  <View style={styles.privacyRowText}>
                    <Text style={styles.privacyRowLabel}>Fake Work</Text>
                    <Text style={styles.privacyRowDesc}>Vicino al lavoro, la posizione viene sostituita.</Text>
                  </View>
                  <Switch
                    value={fakeWorkEnabled}
                    onValueChange={(val) => { setFakeWorkEnabled(val); privacyMutation.mutate({ fakeWorkEnabled: val }); }}
                    trackColor={{ false: Colors.border, true: Colors.accent }}
                    thumbColor="#fff"
                  />
                </View>
                {fakeWorkEnabled && (
                  <>
                    <FakeZoneCoordPanel
                      realLabel="Posizione Lavoro (reale)"
                      fakeLabel="Posizione Fittizia"
                      realLat={workLatitude}
                      realLng={workLongitude}
                      fakeLat={fakeWorkLatitude}
                      fakeLng={fakeWorkLongitude}
                      realTarget="workReal"
                      fakeTarget="workFake"
                      colors={colors}
                      onPickGPS={pickFromGPS}
                      onOpenMap={openMapPicker}
                    />
                    <View style={styles.kmRow}>
                      <Text style={[styles.kmLabel, { color: Colors.textSecondary }]}>Raggio attivazione:</Text>
                      <TextInput
                        style={[styles.kmInput, { color: Colors.text, borderColor: Colors.border, backgroundColor: Colors.background }]}
                        keyboardType="number-pad"
                        value={String(fakeWorkRadius)}
                        onChangeText={(v) => {
                          const n = parseInt(v, 10);
                          if (!isNaN(n) && n >= 1 && n <= 100) {
                            setFakeWorkRadius(n);
                            privacyMutation.mutate({ fakeWorkRadius: n });
                          }
                        }}
                        maxLength={3}
                        selectTextOnFocus
                      />
                      <Text style={[styles.kmLabel, { color: Colors.textSecondary }]}>km</Text>
                    </View>
                  </>
                )}

                <View style={styles.privacyDivider} />

                <View style={styles.privacyRow}>
                  <Ionicons name="location-outline" size={20} color={Colors.accent} style={styles.privacyRowIcon} />
                  <View style={styles.privacyRowText}>
                    <Text style={styles.privacyRowLabel}>Fake Whatever</Text>
                    <Text style={styles.privacyRowDesc}>Per qualsiasi altro luogo, sostituisci la posizione.</Text>
                  </View>
                  <Switch
                    value={fakeWhateverEnabled}
                    onValueChange={(val) => { setFakeWhateverEnabled(val); privacyMutation.mutate({ fakeWhateverEnabled: val }); }}
                    trackColor={{ false: Colors.border, true: Colors.accent }}
                    thumbColor="#fff"
                  />
                </View>
                {fakeWhateverEnabled && (
                  <>
                    <FakeZoneCoordPanel
                      realLabel="Posizione (reale)"
                      fakeLabel="Posizione Fittizia"
                      realLat={whateverLatitude}
                      realLng={whateverLongitude}
                      fakeLat={fakeWhateverLatitude}
                      fakeLng={fakeWhateverLongitude}
                      realTarget="whateverReal"
                      fakeTarget="whateverFake"
                      colors={colors}
                      onPickGPS={pickFromGPS}
                      onOpenMap={openMapPicker}
                    />
                    <View style={styles.kmRow}>
                      <Text style={[styles.kmLabel, { color: Colors.textSecondary }]}>Raggio attivazione:</Text>
                      <TextInput
                        style={[styles.kmInput, { color: Colors.text, borderColor: Colors.border, backgroundColor: Colors.background }]}
                        keyboardType="number-pad"
                        value={String(fakeWhateverRadius)}
                        onChangeText={(v) => {
                          const n = parseInt(v, 10);
                          if (!isNaN(n) && n >= 1 && n <= 100) {
                            setFakeWhateverRadius(n);
                            privacyMutation.mutate({ fakeWhateverRadius: n });
                          }
                        }}
                        maxLength={3}
                        selectTextOnFocus
                      />
                      <Text style={[styles.kmLabel, { color: Colors.textSecondary }]}>km</Text>
                    </View>
                  </>
                )}
              </View>
            )}
          </View>

          <View style={[styles.settingCard, { backgroundColor: colors.surface }]}>
            <View style={styles.accordionHeader}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Ionicons name="navigate-outline" size={18} color={Colors.accent} />
                <View>
                  <Text style={styles.accordionTitle}>Precisione GPS Tracking</Text>
                  <Text style={styles.privacyRowDesc}>
                    {gpsOptions.find((o) => o.key === gpsPrecision)?.label ?? gpsPrecision}
                  </Text>
                </View>
              </View>
              <Ionicons name="chevron-down" size={16} color={Colors.textSecondary} />
            </View>
          </View>
        </View>

        {sosEnabled && (
          <View style={styles.sosRow}>
            <Pressable
              style={[styles.sosBtn, mySosQuery.data ? styles.sosBtnActive : null]}
              onPress={() => {
                if (mySosQuery.data) {
                  Alert.alert(
                    t("ready.cancelSosTitle"),
                    t("ready.cancelSosMsg"),
                    [
                      { text: t("common.no"), style: "cancel" },
                      { text: t("ready.cancelSosYes"), style: "destructive", onPress: () => cancelSosMutation.mutate(mySosQuery.data.id) },
                    ]
                  );
                } else {
                  setShowSosModal(true);
                }
              }}
            >
              <Image source={sosLaunchIcon} style={[styles.sosIconLeft, mySosQuery.data ? styles.sosIconLeftActive : null]} resizeMode="contain" />
              <Text style={[styles.sosLabelLeft, mySosQuery.data ? styles.sosLabelLeftActive : null]}>
                {mySosQuery.data ? "SOS ATTIVO" : "LANCIA SOS"}
              </Text>
            </Pressable>

          </View>
        )}

      </View>

      <Modal visible={showSosModal} transparent animationType="fade" onRequestClose={() => setShowSosModal(false)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ flex: 1 }}
        >
          <Pressable style={styles.modalOverlay} onPress={() => setShowSosModal(false)}>
          <Pressable style={styles.sosSheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.handle} />
            <View style={{ alignItems: "center", marginBottom: 16 }}>
              <Image source={sosLaunchIcon} style={{ width: 80, height: 60 }} resizeMode="contain" />
              <Text style={styles.sosSheetTitle}>Richiesta SOS</Text>
              <Text style={styles.sosSheetSubtitle}>Descrivi il problema</Text>
            </View>
            <TextInput
              style={styles.sosInput}
              placeholder="Foratura, batteria, sequestro mezzo..."
              placeholderTextColor={Colors.textSecondary + "80"}
              value={sosReason}
              onChangeText={setSosReason}
              multiline
              maxLength={200}
            />
            <Text style={styles.sosRadiusLabel}>Raggio d'azione</Text>
            <View style={styles.sosRadiusRow}>
              {[10, 20, 50].map((km) => (
                <Pressable
                  key={km}
                  style={[styles.sosRadiusChip, sosRadiusKm === km && !customRadius && styles.sosRadiusChipActive]}
                  onPress={() => { setSosRadiusKm(km); setCustomRadius(""); }}
                >
                  <Text style={[styles.sosRadiusChipText, sosRadiusKm === km && !customRadius && styles.sosRadiusChipTextActive]}>
                    {km} km
                  </Text>
                </Pressable>
              ))}
              <TextInput
                style={[styles.sosRadiusCustom, customRadius ? styles.sosRadiusCustomActive : null]}
                placeholder="Altro"
                placeholderTextColor={Colors.textSecondary + "80"}
                value={customRadius}
                onChangeText={(text) => {
                  const num = text.replace(/[^0-9]/g, "");
                  setCustomRadius(num);
                  if (num) {
                    setSosRadiusKm(parseInt(num, 10));
                  } else {
                    setSosRadiusKm(10);
                  }
                }}
                keyboardType="numeric"
                maxLength={4}
              />
            </View>
            <Pressable
              style={[styles.sosSubmitBtn, (!sosReason.trim() || createSosMutation.isPending) && { opacity: 0.5 }]}
              disabled={!sosReason.trim() || createSosMutation.isPending}
              onPress={() => {
                const finalRadius = customRadius ? parseInt(customRadius, 10) || 10 : sosRadiusKm;
                const sendSos = (coords: { latitude: number; longitude: number }) => {
                  createSosMutation.mutate({
                    reason: sosReason.trim(),
                    latitude: coords.latitude,
                    longitude: coords.longitude,
                    radiusKm: finalRadius,
                  });
                };
                if (location) {
                  sendSos(location);
                } else {
                  Alert.alert(
                    t("tracking.gpsUnavailable"),
                    t("ready.approxLocationMsg"),
                    [
                      { text: t("common.cancel"), style: "cancel" },
                      { text: t("ready.sendAnyway"), onPress: () => sendSos({ latitude: 42.5, longitude: 12.5 }) },
                    ]
                  );
                }
              }}
            >
              {createSosMutation.isPending ? (
                <ActivityIndicator color={Colors.background} />
              ) : (
                <Text style={styles.sosSubmitText}>Invia SOS</Text>
              )}
            </Pressable>
          </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  content: {
    alignItems: "center",
    padding: 24,
    gap: 8,
  },
  statusText: {
    fontSize: 28,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
    textAlign: "center",
    marginTop: 4,
  },
  statusSubtext: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    textAlign: "center",
    maxWidth: 280,
  },
  toggleBtn: {
    width: 140,
    height: 140,
    borderRadius: 70,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 16,
    elevation: 6,
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8 },
      android: {},
      web: { boxShadow: "0px 4px 8px rgba(0,0,0,0.3)" },
    }),
  },
  settingsGroup: {
    width: "100%",
    maxWidth: 420,
    marginTop: 16,
    gap: 6,
  },
  settingCard: {
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 4,
  },
  privacyRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
  },
  privacyRowIcon: {
    marginRight: 10,
  },
  privacyRowText: {
    flex: 1,
    paddingRight: 8,
  },
  privacyRowLabel: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
  },
  privacyRowDesc: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    marginTop: 2,
  },
  privacyWarning: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    color: "#E8821C",
    marginTop: 2,
  },
  privacyDivider: {
    height: 1,
    backgroundColor: Colors.border,
    opacity: 0.6,
    marginVertical: 2,
  },
  accordionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
  },
  accordionTitle: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
  },
  accordionContent: {
    marginTop: 4,
    gap: 8,
    paddingBottom: 4,
  },
  kmRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 4,
  },
  kmLabel: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  kmInput: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    width: 48,
    textAlign: "center",
  },
  gpsOption: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
  },
  gpsOptionLabel: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 2,
  },
  gpsOptionDesc: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    lineHeight: 16,
  },
  toastContainer: {
    marginTop: 16,
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: Colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  toastText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
    textAlign: "center" as const,
  },
  sosRow: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: 20,
    paddingHorizontal: 16,
  },
  sosBtn: {
    alignItems: "center",
    gap: 10,
  },
  sosBtnActive: {
    opacity: 1,
  },
  sosIconLeft: {
    width: 187,
    height: 146,
    tintColor: "#CC0000",
  },
  sosIconLeftActive: {
    tintColor: "#990000",
  },
  sosLabelLeft: {
    fontSize: 21,
    fontFamily: "Inter_700Bold",
    color: "#CC0000",
    textAlign: "center" as const,
  },
  sosLabelLeftActive: {
    color: "#990000",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-start",
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
    alignSelf: "center",
    marginBottom: 16,
  },
  sosSheet: {
    backgroundColor: Colors.surface,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    padding: 20,
    paddingBottom: 24,
  },
  sosSheetTitle: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    color: "#FF6600",
    marginTop: 8,
  },
  sosSheetSubtitle: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    marginTop: 4,
  },
  sosInput: {
    backgroundColor: Colors.background,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 14,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: Colors.text,
    minHeight: 80,
    textAlignVertical: "top" as const,
    marginBottom: 16,
  },
  sosRadiusLabel: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
    marginTop: 12,
    marginBottom: 8,
  },
  sosRadiusRow: {
    flexDirection: "row" as const,
    gap: 8,
    marginBottom: 16,
  },
  sosRadiusChip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: Colors.background,
    borderWidth: 1.5,
    borderColor: Colors.border,
    alignItems: "center" as const,
  },
  sosRadiusChipActive: {
    backgroundColor: "#FF6600",
    borderColor: "#FF6600",
  },
  sosRadiusChipText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: Colors.textSecondary,
  },
  sosRadiusChipTextActive: {
    color: Colors.background,
  },
  sosRadiusCustom: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: Colors.background,
    borderWidth: 1.5,
    borderColor: Colors.border,
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
    textAlign: "center" as const,
  },
  sosRadiusCustomActive: {
    backgroundColor: "#FF6600",
    borderColor: "#FF6600",
    color: Colors.background,
  },
  sosSubmitBtn: {
    backgroundColor: "#FF6600",
    padding: 16,
    borderRadius: 12,
    alignItems: "center" as const,
  },
  sosSubmitText: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    color: Colors.background,
  },
});
