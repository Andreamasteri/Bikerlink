import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Modal,
  Switch,
  TextInput,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import { useMutation } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { apiRequest, queryClient } from "@/lib/query-client";
import Colors from "@/constants/colors";
import LeafletPickerMap from "@/components/LeafletPickerMap";
import type { ProfileData } from "./types";

interface Props {
  profileData: ProfileData | undefined;
}

const GPS_PRECISION_OPTIONS = [
  { value: "low", label: "Bassa (risparmio batteria)" },
  { value: "balanced", label: "Bilanciata" },
  { value: "high", label: "Alta (più precisa)" },
];

export default function PrivacyPanel({ profileData }: Props) {
  const insets = useSafeAreaInsets();

  const [privacyExpanded, setPrivacyExpanded] = useState(false);
  const [gpsPrecisionExpanded, setGpsPrecisionExpanded] = useState(false);
  const [mapPickerVisible, setMapPickerVisible] = useState(false);
  const [mapPickerTarget, setMapPickerTarget] = useState<"home" | "fake" | null>(null);
  const [mapPickerCoord, setMapPickerCoord] = useState<{ latitude: number; longitude: number }>({
    latitude: 41.9,
    longitude: 12.5,
  });

  const [hideFromMap, setHideFromMap] = useState(false);
  const [positionFuzz, setPositionFuzz] = useState(false);
  const [positionFuzzKm, setPositionFuzzKm] = useState(1);
  const [fakeHomeEnabled, setFakeHomeEnabled] = useState(false);
  const [homeLatitude, setHomeLatitude] = useState<number | null>(null);
  const [homeLongitude, setHomeLongitude] = useState<number | null>(null);
  const [fakeHomeLatitude, setFakeHomeLatitude] = useState<number | null>(null);
  const [fakeHomeLongitude, setFakeHomeLongitude] = useState<number | null>(null);
  const [fakeHomeRadius, setFakeHomeRadius] = useState(2);
  const [gpsPrecision, setGpsPrecision] = useState("balanced");

  useEffect(() => {
    if (profileData?.profile) {
      const p = profileData.profile;
      setHideFromMap(p.hideFromMap ?? false);
      setPositionFuzz(p.positionFuzz ?? false);
      setPositionFuzzKm(p.positionFuzzKm ?? 1);
      setFakeHomeEnabled(p.fakeHomeEnabled ?? false);
      setHomeLatitude(p.homeLatitude ?? null);
      setHomeLongitude(p.homeLongitude ?? null);
      setFakeHomeLatitude(p.fakeHomeLatitude ?? null);
      setFakeHomeLongitude(p.fakeHomeLongitude ?? null);
      setFakeHomeRadius(p.fakeHomeRadius ?? 2);
    }
  }, [profileData?.profile]);

  const repushLocationForPrivacy = useCallback(async () => {
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
    mutationFn: async (data: {
      hideFromMap?: boolean;
      positionFuzz?: boolean;
      positionFuzzKm?: number;
      fakeHomeEnabled?: boolean;
      homeLatitude?: number | null;
      homeLongitude?: number | null;
      fakeHomeLatitude?: number | null;
      fakeHomeLongitude?: number | null;
      fakeHomeRadius?: number;
      gpsPrecision?: string;
    }) => {
      await apiRequest("PUT", "/api/users/me/privacy", data);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/users/me"] });
      if (variables.positionFuzz === true || variables.fakeHomeEnabled === true) {
        repushLocationForPrivacy();
      }
    },
    onError: (_err, variables) => {
      if (variables.hideFromMap !== undefined) setHideFromMap((v) => !v);
      if (variables.positionFuzz !== undefined) setPositionFuzz((v) => !v);
      if (variables.fakeHomeEnabled !== undefined) setFakeHomeEnabled((v) => !v);
      Alert.alert("Errore", "Errore nel salvataggio delle impostazioni privacy. Riprova.");
    },
  });

  const pickCoordFromGPS = async (target: "home" | "fake") => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          "Permesso negato",
          "Concedi l'accesso alla posizione nelle impostazioni dell'app."
        );
        return;
      }
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const lat = loc.coords.latitude;
      const lng = loc.coords.longitude;
      if (target === "home") {
        setHomeLatitude(lat);
        setHomeLongitude(lng);
        privacyMutation.mutate({ homeLatitude: lat, homeLongitude: lng });
      } else {
        setFakeHomeLatitude(lat);
        setFakeHomeLongitude(lng);
        privacyMutation.mutate({ fakeHomeLatitude: lat, fakeHomeLongitude: lng });
      }
    } catch {
      Alert.alert("Errore GPS", "Impossibile ottenere la posizione attuale. Riprova.");
    }
  };

  const openMapPicker = (target: "home" | "fake") => {
    setMapPickerTarget(target);
    if (target === "home" && homeLatitude != null && homeLongitude != null) {
      setMapPickerCoord({ latitude: homeLatitude, longitude: homeLongitude });
    } else if (target === "fake" && fakeHomeLatitude != null && fakeHomeLongitude != null) {
      setMapPickerCoord({ latitude: fakeHomeLatitude, longitude: fakeHomeLongitude });
    } else {
      setMapPickerCoord({ latitude: 41.9, longitude: 12.5 });
    }
    setMapPickerVisible(true);
  };

  const confirmMapPicker = () => {
    if (mapPickerTarget === "home") {
      setHomeLatitude(mapPickerCoord.latitude);
      setHomeLongitude(mapPickerCoord.longitude);
      privacyMutation.mutate({
        homeLatitude: mapPickerCoord.latitude,
        homeLongitude: mapPickerCoord.longitude,
      });
    } else if (mapPickerTarget === "fake") {
      setFakeHomeLatitude(mapPickerCoord.latitude);
      setFakeHomeLongitude(mapPickerCoord.longitude);
      privacyMutation.mutate({
        fakeHomeLatitude: mapPickerCoord.latitude,
        fakeHomeLongitude: mapPickerCoord.longitude,
      });
    }
    setMapPickerVisible(false);
  };

  return (
    <>
      <View style={styles.section}>
        <Pressable
          style={styles.accordionHeader}
          onPress={() => setPrivacyExpanded((v) => !v)}
        >
          <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>Privacy & Posizione</Text>
          <Ionicons
            name={privacyExpanded ? "chevron-up" : "chevron-down"}
            size={18}
            color={Colors.textSecondary}
          />
        </Pressable>

        {privacyExpanded && (
          <View style={{ paddingTop: 8 }}>
            {/* Hide from map */}
            <View style={styles.privacyRow}>
              <View style={styles.privacyRowLeft}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.privacyLabel}>Nasconditi dalla mappa</Text>
                  <Text style={styles.privacyDesc}>
                    Il tuo pin non sarà visibile nella mappa pubblica.
                  </Text>
                </View>
              </View>
              <Switch
                value={hideFromMap}
                onValueChange={(val) => {
                  setHideFromMap(val);
                  privacyMutation.mutate({ hideFromMap: val });
                }}
                trackColor={{ false: Colors.border, true: Colors.accent }}
                thumbColor="#fff"
              />
            </View>

            {/* Position fuzz */}
            <View style={styles.privacyRow}>
              <View style={styles.privacyRowLeft}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.privacyLabel}>Posizione sfocata</Text>
                  <Text style={styles.privacyDesc}>
                    La tua posizione viene mostrata con un offset casuale per proteggere la privacy.
                  </Text>
                </View>
              </View>
              <Switch
                value={positionFuzz}
                onValueChange={(val) => {
                  setPositionFuzz(val);
                  privacyMutation.mutate({ positionFuzz: val });
                }}
                trackColor={{ false: Colors.border, true: Colors.accent }}
                thumbColor="#fff"
              />
            </View>
            {positionFuzz && (
              <View style={styles.privacyKmRow}>
                <Text style={styles.privacyKmLabel}>Raggio sfocatura (km):</Text>
                <TextInput
                  style={styles.privacyKmInput}
                  keyboardType="decimal-pad"
                  value={String(positionFuzzKm)}
                  onChangeText={(t) => {
                    const n = parseFloat(t);
                    if (!isNaN(n) && n > 0) setPositionFuzzKm(n);
                  }}
                  onEndEditing={() => privacyMutation.mutate({ positionFuzzKm })}
                />
                <Text style={styles.privacyKmLabel}>km</Text>
              </View>
            )}

            {/* Fake home */}
            <View style={styles.privacyRow}>
              <View style={styles.privacyRowLeft}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.privacyLabel}>Casa fittizia</Text>
                  <Text style={styles.privacyDesc}>
                    Mostra una posizione "casa" alternativa invece di quella reale.
                  </Text>
                  {fakeHomeEnabled && (
                    <Text style={styles.privacyWarning}>
                      ⚠ Aggiorna la tua posizione dopo aver attivato questa opzione.
                    </Text>
                  )}
                </View>
              </View>
              <Switch
                value={fakeHomeEnabled}
                onValueChange={(val) => {
                  setFakeHomeEnabled(val);
                  privacyMutation.mutate({ fakeHomeEnabled: val });
                }}
                trackColor={{ false: Colors.border, true: Colors.accent }}
                thumbColor="#fff"
              />
            </View>

            {/* Home position picker */}
            <View style={styles.fakeHomeCard}>
              <View style={styles.fakeHomeSection}>
                <Text style={styles.fakeHomeSectionLabel}>Posizione Casa</Text>
                {homeLatitude != null && homeLongitude != null ? (
                  <Text style={styles.fakeHomeCoords}>
                    {homeLatitude.toFixed(5)}, {homeLongitude.toFixed(5)}
                  </Text>
                ) : (
                  <Text style={styles.fakeHomeCoords}>Non impostata</Text>
                )}
                <View style={styles.fakeHomeBtnRow}>
                  <Pressable
                    style={styles.fakeHomeBtn}
                    onPress={() => pickCoordFromGPS("home")}
                  >
                    <Ionicons name="locate" size={14} color={Colors.accent} />
                    <Text style={styles.fakeHomeBtnLabel}>GPS</Text>
                  </Pressable>
                  <Pressable
                    style={styles.fakeHomeBtn}
                    onPress={() => openMapPicker("home")}
                  >
                    <Ionicons name="map" size={14} color={Colors.accent} />
                    <Text style={styles.fakeHomeBtnLabel}>Mappa</Text>
                  </Pressable>
                </View>
              </View>
            </View>

            {fakeHomeEnabled && (
              <View style={[styles.fakeHomeCard, { marginTop: 8 }]}>
                <View style={styles.fakeHomeSection}>
                  <Text style={styles.fakeHomeSectionLabel}>Posizione Fittizia</Text>
                  {fakeHomeLatitude != null && fakeHomeLongitude != null ? (
                    <Text style={styles.fakeHomeCoords}>
                      {fakeHomeLatitude.toFixed(5)}, {fakeHomeLongitude.toFixed(5)}
                    </Text>
                  ) : (
                    <Text style={styles.fakeHomeCoords}>Non impostata</Text>
                  )}
                  <View style={styles.fakeHomeBtnRow}>
                    <Pressable
                      style={styles.fakeHomeBtn}
                      onPress={() => pickCoordFromGPS("fake")}
                    >
                      <Ionicons name="locate" size={14} color={Colors.accent} />
                      <Text style={styles.fakeHomeBtnLabel}>GPS</Text>
                    </Pressable>
                    <Pressable
                      style={styles.fakeHomeBtn}
                      onPress={() => openMapPicker("fake")}
                    >
                      <Ionicons name="map" size={14} color={Colors.accent} />
                      <Text style={styles.fakeHomeBtnLabel}>Mappa</Text>
                    </Pressable>
                  </View>
                  <View style={[styles.privacyKmRow, { paddingHorizontal: 0 }]}>
                    <Text style={styles.privacyKmLabel}>Raggio (km):</Text>
                    <TextInput
                      style={styles.privacyKmInput}
                      keyboardType="decimal-pad"
                      value={String(fakeHomeRadius)}
                      onChangeText={(t) => {
                        const n = parseFloat(t);
                        if (!isNaN(n) && n > 0) setFakeHomeRadius(n);
                      }}
                      onEndEditing={() => privacyMutation.mutate({ fakeHomeRadius })}
                    />
                    <Text style={styles.privacyKmLabel}>km</Text>
                  </View>
                </View>
              </View>
            )}

            {/* GPS Precision */}
            <View style={[styles.privacyRow, { borderBottomWidth: 0, marginTop: 8 }]}>
              <Pressable
                style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}
                onPress={() => setGpsPrecisionExpanded((v) => !v)}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.privacyLabel}>Precisione GPS</Text>
                  <Text style={styles.privacyDesc}>
                    {GPS_PRECISION_OPTIONS.find((o) => o.value === gpsPrecision)?.label ?? gpsPrecision}
                  </Text>
                </View>
                <Ionicons
                  name={gpsPrecisionExpanded ? "chevron-up" : "chevron-down"}
                  size={16}
                  color={Colors.textSecondary}
                />
              </Pressable>
            </View>
            {gpsPrecisionExpanded && (
              <View style={{ marginBottom: 8 }}>
                {GPS_PRECISION_OPTIONS.map((opt) => (
                  <Pressable
                    key={opt.value}
                    style={[
                      styles.gpsPrecisionOption,
                      gpsPrecision === opt.value && styles.gpsPrecisionOptionActive,
                    ]}
                    onPress={() => {
                      setGpsPrecision(opt.value);
                      privacyMutation.mutate({ gpsPrecision: opt.value });
                      setGpsPrecisionExpanded(false);
                    }}
                  >
                    <Text
                      style={[
                        styles.gpsPrecisionLabel,
                        gpsPrecision === opt.value && { color: Colors.accent },
                      ]}
                    >
                      {opt.label}
                    </Text>
                    {gpsPrecision === opt.value && (
                      <Ionicons name="checkmark" size={16} color={Colors.accent} />
                    )}
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        )}
      </View>

      {/* Map Picker Modal */}
      <Modal
        visible={mapPickerVisible}
        transparent={false}
        animationType="slide"
        onRequestClose={() => setMapPickerVisible(false)}
      >
        <View style={{ flex: 1, backgroundColor: Colors.background }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              padding: 16,
              paddingTop: insets.top + 8,
              backgroundColor: Colors.card,
              borderBottomWidth: 1,
              borderBottomColor: Colors.border,
            }}
          >
            <Pressable onPress={() => setMapPickerVisible(false)} style={{ marginRight: 12 }}>
              <Ionicons name="close" size={24} color={Colors.text} />
            </Pressable>
            <Text style={{ flex: 1, fontSize: 16, fontWeight: "600", color: Colors.text }}>
              {mapPickerTarget === "home" ? "Posizione Casa" : "Posizione Fittizia"}
            </Text>
            <Pressable
              onPress={confirmMapPicker}
              style={{
                backgroundColor: Colors.accent,
                borderRadius: 8,
                paddingVertical: 8,
                paddingHorizontal: 16,
              }}
            >
              <Text style={{ color: "#fff", fontWeight: "700" }}>Conferma</Text>
            </Pressable>
          </View>
          <LeafletPickerMap
            initialLat={mapPickerCoord.latitude}
            initialLng={mapPickerCoord.longitude}
            initialZoom={12}
            selectedCoord={{ lat: mapPickerCoord.latitude, lng: mapPickerCoord.longitude }}
            onCoordPicked={(coord) => setMapPickerCoord(coord)}
          />
          <View
            style={{
              padding: 12,
              paddingBottom: insets.bottom + 8,
              backgroundColor: Colors.card,
            }}
          >
            <Text
              style={{ textAlign: "center", color: Colors.textSecondary, fontSize: 13 }}
            >
              Tocca la mappa per spostare il pin
            </Text>
            <Text
              style={{ textAlign: "center", color: Colors.text, fontSize: 13, marginTop: 4 }}
            >
              {`${mapPickerCoord.latitude.toFixed(5)}, ${mapPickerCoord.longitude.toFixed(5)}`}
            </Text>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  section: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    marginHorizontal: 16,
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
    marginBottom: 12,
  },
  accordionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  privacyRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  privacyRowLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "flex-start",
    marginRight: 12,
  },
  privacyLabel: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
    marginBottom: 4,
  },
  privacyDesc: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    lineHeight: 16,
  },
  privacyWarning: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    color: "#F59E0B",
    lineHeight: 17,
    marginTop: 4,
  },
  privacyKmRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
  privacyKmLabel: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: Colors.textSecondary,
    marginRight: 6,
  },
  privacyKmInput: {
    minWidth: 64,
    height: 36,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    textAlign: "center",
    textAlignVertical: "center",
    includeFontPadding: false,
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
    backgroundColor: Colors.surface,
    marginRight: 6,
    paddingVertical: 0,
  },
  fakeHomeCard: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 14,
    marginHorizontal: 4,
    marginTop: 6,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  fakeHomeSection: {
    gap: 6,
  },
  fakeHomeSectionLabel: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: Colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  fakeHomeCoords: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.text,
    opacity: 0.7,
  },
  fakeHomeBtnRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 2,
  },
  fakeHomeBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: Colors.background,
    borderRadius: 8,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  fakeHomeBtnLabel: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: Colors.text,
  },
  gpsPrecisionOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 8,
    marginBottom: 2,
  },
  gpsPrecisionOptionActive: {
    backgroundColor: Colors.accent + "18",
  },
  gpsPrecisionLabel: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: Colors.text,
  },
});
