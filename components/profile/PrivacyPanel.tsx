import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Modal,
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
import { PrivacySettingsSection } from "./privacy/PrivacySettingsSection";
import { FakeHomeSection } from "./privacy/FakeHomeSection";

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
            <PrivacySettingsSection
              hideFromMap={hideFromMap}
              onHideFromMapChange={(val) => {
                setHideFromMap(val);
                privacyMutation.mutate({ hideFromMap: val });
              }}
              positionFuzz={positionFuzz}
              onPositionFuzzChange={(val) => {
                setPositionFuzz(val);
                privacyMutation.mutate({ positionFuzz: val });
              }}
              positionFuzzKm={positionFuzzKm}
              onPositionFuzzKmChange={setPositionFuzzKm}
              onPositionFuzzKmEndEditing={() => privacyMutation.mutate({ positionFuzzKm })}
            />

            <FakeHomeSection
              fakeHomeEnabled={fakeHomeEnabled}
              onFakeHomeEnabledChange={(val) => {
                setFakeHomeEnabled(val);
                privacyMutation.mutate({ fakeHomeEnabled: val });
              }}
              homeLatitude={homeLatitude}
              homeLongitude={homeLongitude}
              fakeHomeLatitude={fakeHomeLatitude}
              fakeHomeLongitude={fakeHomeLongitude}
              fakeHomeRadius={fakeHomeRadius}
              onFakeHomeRadiusChange={setFakeHomeRadius}
              onFakeHomeRadiusEndEditing={() => privacyMutation.mutate({ fakeHomeRadius })}
              onPickCoord={pickCoordFromGPS}
              onOpenMapPicker={openMapPicker}
            />

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
