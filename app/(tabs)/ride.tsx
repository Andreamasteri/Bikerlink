import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Modal,
  Switch,
  TextInput,
  Alert,
  ActivityIndicator,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/lib/auth-context";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient, getApiUrl } from "@/lib/query-client";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useT } from "@/lib/language-context";
import * as Location from "expo-location";
import LeafletPickerMap from "@/components/LeafletPickerMap";
import Colors from "@/constants/colors";

const PRIVACY_POPUP_KEY = "ride_privacy_popup_seen_v1";

type MapTarget =
  | "homeReal"
  | "homeFake"
  | "workReal"
  | "workFake"
  | "whateverReal"
  | "whateverFake";

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

export default function RidePrivacyScreen() {
  const colors = useColors();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const t = useT();

  const [showPrivacyPopup, setShowPrivacyPopup] = useState(false);
  const [popupDontShow, setPopupDontShow] = useState(false);
  const [privacyExpanded, setPrivacyExpanded] = useState(false);
  const [gpsPrecisionExpanded, setGpsPrecisionExpanded] = useState(false);

  const [hideFromMap, setHideFromMap] = useState(false);
  const [positionFuzz, setPositionFuzz] = useState(false);
  const [positionFuzzKm, setPositionFuzzKm] = useState(1);
  const [offlineRandomize, setOfflineRandomize] = useState(true);
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

  const { data: profileData, isLoading: profileLoading } = useQuery({
    queryKey: ["/api/users/me"],
    enabled: !!user,
  });

  const { data: ghostSettingData } = useQuery<{ enabled: boolean }>({
    queryKey: ["/api/settings/ghost-mode-enabled"],
  });
  const ghostModeFeatureEnabled = ghostSettingData?.enabled === true;
  const isGhostMode = (profileData as any)?.ghostMode || false;

  useEffect(() => {
    const p = (profileData as any)?.profile;
    if (!p) return;
    setHideFromMap(p.hideFromMap ?? false);
    setPositionFuzz(p.positionFuzz ?? false);
    setPositionFuzzKm(p.positionFuzzKm ?? 1);
    setOfflineRandomize(p.offlinePositionRandomize !== false);
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
  }, [(profileData as any)?.profile]);

  useFocusEffect(useCallback(() => {
    AsyncStorage.getItem(PRIVACY_POPUP_KEY)
      .then((val) => { if (!val) setShowPrivacyPopup(true); })
      .catch(() => {});
  }, []));

  const ghostMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      await apiRequest("PUT", "/api/users/me/ghost-mode", { enabled });
      return enabled;
    },
    onSuccess: (enabled: boolean) => {
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
    mutationFn: async (data: Record<string, unknown>) => {
      await apiRequest("PUT", "/api/users/me/privacy", data);
    },
    onSuccess: (_: unknown, variables: Record<string, unknown>) => {
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
      if (variables.hideFromMap !== undefined) setHideFromMap(!variables.hideFromMap);
      if (variables.positionFuzz !== undefined) setPositionFuzz(!variables.positionFuzz);
      if (variables.offlinePositionRandomize !== undefined) setOfflineRandomize(!variables.offlinePositionRandomize);
      if (variables.fakeHomeEnabled !== undefined) setFakeHomeEnabled(!variables.fakeHomeEnabled);
      if (variables.fakeWorkEnabled !== undefined) setFakeWorkEnabled(!variables.fakeWorkEnabled);
      if (variables.fakeWhateverEnabled !== undefined) setFakeWhateverEnabled(!variables.fakeWhateverEnabled);
      Alert.alert("Errore", "Errore nel salvataggio. Riprova.");
    },
  });

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

  const closePrivacyPopup = () => {
    if (popupDontShow) {
      AsyncStorage.setItem(PRIVACY_POPUP_KEY, "true").catch(() => {});
    }
    setShowPrivacyPopup(false);
  };

  if (profileLoading) {
    return (
      <View style={[ss.loadingContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  const gpsOptions = [
    { key: "lowest", label: t("profile.gpsLowestLabel"), desc: t("profile.gpsLowestDesc"), icon: "battery-half-outline" },
    { key: "balanced", label: t("profile.gpsBalancedLabel"), desc: t("profile.gpsBalancedDesc"), icon: "compass-outline" },
    { key: "high", label: t("profile.gpsHighLabel"), desc: t("profile.gpsHighDesc"), icon: "locate-outline" },
    { key: "highest", label: t("profile.gpsHighestLabel"), desc: t("profile.gpsHighestDesc"), icon: "navigate-outline" },
    { key: "bestForNavigation", label: t("profile.gpsBestForNavLabel"), desc: t("profile.gpsBestForNavDesc"), icon: "map-outline" },
  ] as { key: string; label: string; desc: string; icon: string }[];

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Modal visible={showPrivacyPopup} transparent animationType="fade" onRequestClose={closePrivacyPopup}>
        <View style={ss.popupOverlay}>
          <View style={[ss.popupCard, { backgroundColor: colors.surface }]}>
            <View style={ss.popupHeader}>
              <Ionicons name="shield-checkmark" size={32} color={colors.accent} />
              <Text style={[ss.popupTitle, { color: colors.text }]}>Privacy & Posizione</Text>
            </View>
            <Text style={[ss.popupBody, { color: colors.textSecondary }]}>
              In questa sezione puoi configurare come BikerLink gestisce la tua posizione:{"\n\n"}
              <Text style={{ fontFamily: "Inter_600SemiBold", color: colors.text }}>Randomizza Offline</Text>: quando esci dall'app, la tua ultima posizione viene spostata di ±20 km.{"\n\n"}
              <Text style={{ fontFamily: "Inter_600SemiBold", color: colors.text }}>Altera Posizione</Text>: sposta randomicamente la posizione visibile di alcuni km.{"\n\n"}
              <Text style={{ fontFamily: "Inter_600SemiBold", color: colors.text }}>Fake Zones</Text>: vicino a casa, lavoro o altro luogo, la tua posizione viene sostituita con una fittizia.
            </Text>
            <Pressable style={ss.dontShowRow} onPress={() => setPopupDontShow(!popupDontShow)}>
              <View style={[ss.checkbox, { borderColor: colors.border }, popupDontShow && { backgroundColor: colors.accent, borderColor: colors.accent }]}>
                {popupDontShow && <Ionicons name="checkmark" size={12} color="#fff" />}
              </View>
              <Text style={[ss.dontShowLabel, { color: colors.textSecondary }]}>Non mostrare più</Text>
            </Pressable>
            <Pressable style={[ss.popupBtn, { backgroundColor: colors.accent }]} onPress={closePrivacyPopup}>
              <Text style={ss.popupBtnText}>Capito!</Text>
            </Pressable>
          </View>
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
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingBottom: insets.bottom + 24,
          paddingTop: Platform.OS === "web" ? 67 : 0,
          gap: 12,
          padding: 16,
        }}
        showsVerticalScrollIndicator={false}
      >
        <Pressable
          style={[ss.infoBanner, { backgroundColor: colors.surface, borderColor: colors.border }]}
          onPress={() => setShowPrivacyPopup(true)}
        >
          <Ionicons name="information-circle-outline" size={18} color={colors.accent} />
          <Text style={[ss.infoBannerText, { color: colors.textSecondary }]}>
            Informazioni sulle opzioni privacy
          </Text>
          <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
        </Pressable>

        {ghostModeFeatureEnabled && (
          <View style={[ss.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[ss.sectionTitle, { color: colors.textSecondary }]}>MODALITÀ GHOST</Text>
            <View style={ss.toggleRow}>
              <Ionicons
                name={isGhostMode ? "eye-off" : "eye"}
                size={22}
                color={isGhostMode ? colors.accent : colors.textSecondary}
              />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={[ss.toggleLabel, { color: colors.text }]}>Ghost Mode</Text>
                <Text style={[ss.toggleDesc, { color: colors.textSecondary }]}>
                  {isGhostMode ? "Posizione randomizzata ±20km" : "Sei visibile sulla mappa"}
                </Text>
              </View>
              <Switch
                value={isGhostMode}
                onValueChange={(val) => ghostMutation.mutate(val)}
                disabled={ghostMutation.isPending}
                trackColor={{ false: colors.border, true: colors.accent }}
                thumbColor="#fff"
              />
            </View>
          </View>
        )}

        <View style={[ss.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Pressable style={ss.accordionHeader} onPress={() => setPrivacyExpanded((v) => !v)}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <Ionicons name="shield-outline" size={20} color={colors.accent} />
              <Text style={[ss.sectionTitle, { color: colors.text, marginBottom: 0 }]}>Privacy & Posizione</Text>
            </View>
            <Ionicons name={privacyExpanded ? "chevron-up" : "chevron-down"} size={18} color={colors.textSecondary} />
          </Pressable>

          {privacyExpanded && (
            <View style={ss.accordionContent}>
              <View style={ss.toggleRow}>
                <Ionicons name="shuffle-outline" size={20} color={colors.accent} style={{ marginRight: 10 }} />
                <View style={{ flex: 1 }}>
                  <Text style={[ss.toggleLabel, { color: colors.text }]}>Randomizza posizione offline</Text>
                  <Text style={[ss.toggleDesc, { color: colors.textSecondary }]}>
                    Quando chiudi l'app, la tua posizione viene spostata di ±20 km.
                  </Text>
                </View>
                <Switch
                  value={offlineRandomize}
                  onValueChange={(val) => { setOfflineRandomize(val); privacyMutation.mutate({ offlinePositionRandomize: val }); }}
                  trackColor={{ false: colors.border, true: colors.accent }}
                  thumbColor="#fff"
                />
              </View>

              <View style={[ss.divider, { backgroundColor: colors.border }]} />

              <View style={ss.toggleRow}>
                <Ionicons name="eye-off-outline" size={20} color={colors.accent} style={{ marginRight: 10 }} />
                <View style={{ flex: 1 }}>
                  <Text style={[ss.toggleLabel, { color: colors.text }]}>Non visibile sulla mappa</Text>
                  <Text style={[ss.toggleDesc, { color: colors.textSecondary }]}>Il tuo marker non viene mostrato agli altri utenti.</Text>
                </View>
                <Switch
                  value={hideFromMap}
                  onValueChange={(val) => { setHideFromMap(val); privacyMutation.mutate({ hideFromMap: val }); }}
                  trackColor={{ false: colors.border, true: colors.accent }}
                  thumbColor="#fff"
                />
              </View>

              <View style={[ss.divider, { backgroundColor: colors.border }]} />

              <View style={ss.toggleRow}>
                <Ionicons name="locate-outline" size={20} color={colors.accent} style={{ marginRight: 10 }} />
                <View style={{ flex: 1 }}>
                  <Text style={[ss.toggleLabel, { color: colors.text }]}>Altera Posizione</Text>
                  {positionFuzz ? (
                    <Text style={ss.warning}>Disattivala prima di un giro in compagnia!</Text>
                  ) : (
                    <Text style={[ss.toggleDesc, { color: colors.textSecondary }]}>Sposta randomicamente la posizione visibile.</Text>
                  )}
                </View>
                <Switch
                  value={positionFuzz}
                  onValueChange={(val) => { setPositionFuzz(val); privacyMutation.mutate({ positionFuzz: val }); }}
                  trackColor={{ false: colors.border, true: colors.accent }}
                  thumbColor="#fff"
                />
              </View>
              {positionFuzz && (
                <View style={ss.kmRow}>
                  <Ionicons name="resize-outline" size={15} color={colors.textSecondary} />
                  <Text style={[ss.kmLabel, { color: colors.textSecondary }]}>Raggio:</Text>
                  <TextInput
                    style={[ss.kmInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
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
                  <Text style={[ss.kmLabel, { color: colors.textSecondary }]}>km (max 50)</Text>
                </View>
              )}

              <View style={[ss.divider, { backgroundColor: colors.border }]} />

              <View style={ss.toggleRow}>
                <Ionicons name="home-outline" size={20} color={colors.accent} style={{ marginRight: 10 }} />
                <View style={{ flex: 1 }}>
                  <Text style={[ss.toggleLabel, { color: colors.text }]}>Fake Home</Text>
                  <Text style={[ss.toggleDesc, { color: colors.textSecondary }]}>Vicino a casa, la posizione viene sostituita.</Text>
                </View>
                <Switch
                  value={fakeHomeEnabled}
                  onValueChange={(val) => {
                    setFakeHomeEnabled(val);
                    privacyMutation.mutate({ fakeHomeEnabled: val });
                  }}
                  trackColor={{ false: colors.border, true: colors.accent }}
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
                  <View style={ss.kmRow}>
                    <Text style={[ss.kmLabel, { color: colors.textSecondary }]}>Raggio attivazione:</Text>
                    <TextInput
                      style={[ss.kmInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
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
                    <Text style={[ss.kmLabel, { color: colors.textSecondary }]}>km</Text>
                  </View>
                </>
              )}

              <View style={[ss.divider, { backgroundColor: colors.border }]} />

              <View style={ss.toggleRow}>
                <Ionicons name="business-outline" size={20} color={colors.accent} style={{ marginRight: 10 }} />
                <View style={{ flex: 1 }}>
                  <Text style={[ss.toggleLabel, { color: colors.text }]}>Fake Work</Text>
                  <Text style={[ss.toggleDesc, { color: colors.textSecondary }]}>Vicino al lavoro, la posizione viene sostituita.</Text>
                </View>
                <Switch
                  value={fakeWorkEnabled}
                  onValueChange={(val) => { setFakeWorkEnabled(val); privacyMutation.mutate({ fakeWorkEnabled: val }); }}
                  trackColor={{ false: colors.border, true: colors.accent }}
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
                  <View style={ss.kmRow}>
                    <Text style={[ss.kmLabel, { color: colors.textSecondary }]}>Raggio attivazione:</Text>
                    <TextInput
                      style={[ss.kmInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
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
                    <Text style={[ss.kmLabel, { color: colors.textSecondary }]}>km</Text>
                  </View>
                </>
              )}

              <View style={[ss.divider, { backgroundColor: colors.border }]} />

              <View style={ss.toggleRow}>
                <Ionicons name="location-outline" size={20} color={colors.accent} style={{ marginRight: 10 }} />
                <View style={{ flex: 1 }}>
                  <Text style={[ss.toggleLabel, { color: colors.text }]}>Fake Whatever</Text>
                  <Text style={[ss.toggleDesc, { color: colors.textSecondary }]}>Per qualsiasi altro luogo, sostituisci la posizione.</Text>
                </View>
                <Switch
                  value={fakeWhateverEnabled}
                  onValueChange={(val) => { setFakeWhateverEnabled(val); privacyMutation.mutate({ fakeWhateverEnabled: val }); }}
                  trackColor={{ false: colors.border, true: colors.accent }}
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
                  <View style={ss.kmRow}>
                    <Text style={[ss.kmLabel, { color: colors.textSecondary }]}>Raggio attivazione:</Text>
                    <TextInput
                      style={[ss.kmInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
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
                    <Text style={[ss.kmLabel, { color: colors.textSecondary }]}>km</Text>
                  </View>
                </>
              )}
            </View>
          )}
        </View>

        <View style={[ss.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Pressable style={ss.accordionHeader} onPress={() => setGpsPrecisionExpanded((v) => !v)}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <Ionicons name="navigate-outline" size={20} color={colors.accent} />
              <Text style={[ss.sectionTitle, { color: colors.text, marginBottom: 0 }]}>Precisione GPS Tracking</Text>
            </View>
            <Ionicons name={gpsPrecisionExpanded ? "chevron-up" : "chevron-down"} size={18} color={colors.textSecondary} />
          </Pressable>
          {gpsPrecisionExpanded && (
            <View style={ss.accordionContent}>
              {gpsOptions.map((opt) => {
                const isSelected = gpsPrecision === opt.key;
                return (
                  <Pressable
                    key={opt.key}
                    style={[
                      ss.gpsOption,
                      { borderColor: isSelected ? colors.accent : colors.border, backgroundColor: isSelected ? colors.accent + "15" : colors.background },
                    ]}
                    onPress={() => { setGpsPrecision(opt.key); privacyMutation.mutate({ gpsPrecision: opt.key }); }}
                  >
                    <Ionicons name={opt.icon as any} size={20} color={isSelected ? colors.accent : colors.textSecondary} />
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text style={[ss.toggleLabel, { color: isSelected ? colors.accent : colors.text }]}>{opt.label}</Text>
                      <Text style={[ss.toggleDesc, { color: colors.textSecondary }]}>{opt.desc}</Text>
                    </View>
                    {isSelected && <Ionicons name="checkmark-circle" size={20} color={colors.accent} />}
                  </Pressable>
                );
              })}
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.accent + "10", borderRadius: 8, padding: 8, marginTop: 4 }}>
                <Ionicons name="information-circle-outline" size={14} color={colors.accent} />
                <Text style={{ flex: 1, fontSize: 11, fontFamily: "Inter_400Regular", color: colors.textSecondary }}>
                  {t("profile.unitsModeOverride")}
                </Text>
              </View>
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const ss = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  infoBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
  },
  infoBannerText: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  section: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    overflow: "hidden",
  },
  sectionTitle: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  accordionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  accordionContent: {
    marginTop: 14,
    gap: 12,
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  toggleLabel: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 2,
  },
  toggleDesc: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    lineHeight: 16,
  },
  warning: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    color: "#E8821C",
  },
  divider: {
    height: 1,
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
  popupOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  popupCard: {
    borderRadius: 16,
    padding: 24,
    width: "100%",
    maxWidth: 400,
  },
  popupHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 16,
  },
  popupTitle: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
  },
  popupBody: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    lineHeight: 22,
    marginBottom: 20,
  },
  dontShowRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 20,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1.5,
    justifyContent: "center",
    alignItems: "center",
  },
  dontShowLabel: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  popupBtn: {
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
  },
  popupBtnText: {
    color: "#fff",
    fontSize: 16,
    fontFamily: "Inter_700Bold",
  },
});
