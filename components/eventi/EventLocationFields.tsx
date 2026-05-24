import React from "react";
import { View, Text, StyleSheet, TextInput, Pressable, Modal, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

interface EventLocationFieldsProps {
  form: {
    locationName: string;
    latitude: string;
    longitude: string;
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- form field key/value setter
  set: (key: any, value: any) => void;
  showMapPicker: boolean;
  setShowMapPicker: (show: boolean) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- MapRegion shape from react-native-maps
  mapRegion: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- MapRegion shape from react-native-maps
  setMapRegion: (region: any) => void;
  tempCoords: { latitude: number; longitude: number } | null;
  setTempCoords: (coords: { latitude: number; longitude: number } | null) => void;
  confirmMapCoords: () => void;
  coordLabel: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- react-native-maps lazy import
  MapView: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- react-native-maps lazy import
  Marker: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- safe area insets shape
  insets: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- map center coords
  italyCenter: any;
}

export function EventLocationFields({
  form,
  set,
  showMapPicker,
  setShowMapPicker,
  mapRegion,
  setMapRegion,
  tempCoords,
  setTempCoords,
  confirmMapCoords,
  coordLabel,
  MapView,
  Marker,
  insets,
  italyCenter,
}: EventLocationFieldsProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>Luogo dell'evento</Text>

      <Text style={styles.label}>Luogo dell'evento *</Text>
      <TextInput
        style={styles.input}
        value={form.locationName}
        onChangeText={(v) => set("locationName", v)}
        placeholder="Nome del luogo o indirizzo"
        placeholderTextColor={Colors.textSecondary}
      />

      <Text style={styles.label}>Coordinate GPS (opzionale)</Text>
      {MapView ? (
        <>
          <Pressable style={styles.mapPickerBtn} onPress={() => {
            if (form.latitude && form.longitude) {
              const lat = parseFloat(form.latitude);
              const lng = parseFloat(form.longitude);
              setMapRegion({ latitude: lat, longitude: lng, latitudeDelta: 0.05, longitudeDelta: 0.05 });
              setTempCoords({ latitude: lat, longitude: lng });
            } else {
              setMapRegion(italyCenter);
              setTempCoords(null);
            }
            setShowMapPicker(true);
          }}>
            <Ionicons
              name={coordLabel ? "location" : "map-outline"}
              size={18}
              color={coordLabel ? Colors.accent : Colors.textSecondary}
            />
            <Text style={[styles.mapPickerText, coordLabel ? { color: Colors.accent } : {}]}>
              {coordLabel ? `📍 ${coordLabel}` : "Seleziona posizione sulla mappa"}
            </Text>
            {coordLabel && (
              <Pressable
                onPress={() => { set("latitude", ""); set("longitude", ""); }}
                hitSlop={8}
              >
                <Ionicons name="close-circle" size={18} color={Colors.textSecondary} />
              </Pressable>
            )}
          </Pressable>

          <Modal visible={showMapPicker} animationType="slide" onRequestClose={() => setShowMapPicker(false)}>
            <View style={[styles.mapModal, { paddingTop: Platform.OS === "ios" ? insets.top : 0 }]}>
              <View style={styles.mapHeader}>
                <Pressable onPress={() => setShowMapPicker(false)} style={styles.mapHeaderBtn}>
                  <Text style={styles.mapHeaderBtnText}>Annulla</Text>
                </Pressable>
                <Text style={styles.mapHeaderTitle}>Tocca per posizionare il pin</Text>
                <Pressable onPress={confirmMapCoords} style={[styles.mapHeaderBtn, styles.mapConfirmBtn]}>
                  <Text style={[styles.mapHeaderBtnText, { color: Colors.accent }]}>Conferma</Text>
                </Pressable>
              </View>
              <MapView
                style={{ flex: 1 }}
                googleMapsApiKey={process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY}
                region={mapRegion}
                onRegionChangeComplete={setMapRegion}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any -- MapPress event from react-native-maps
                onPress={(e: any) => {
                  const { latitude, longitude } = e.nativeEvent.coordinate;
                  setTempCoords({ latitude, longitude });
                }}
              >
                {tempCoords && <Marker coordinate={tempCoords} pinColor={Colors.accent} />}
              </MapView>
              {tempCoords && (
                <View style={styles.coordBanner}>
                  <Text style={styles.coordBannerText}>
                    {tempCoords.latitude.toFixed(5)}, {tempCoords.longitude.toFixed(5)}
                  </Text>
                </View>
              )}
            </View>
          </Modal>
        </>
      ) : (
        <View style={styles.coordRow}>
          <TextInput
            style={[styles.input, styles.coordInput]}
            value={form.latitude}
            onChangeText={(v) => set("latitude", v)}
            placeholder="Latitudine"
            placeholderTextColor={Colors.textSecondary}
            keyboardType="decimal-pad"
          />
          <TextInput
            style={[styles.input, styles.coordInput]}
            value={form.longitude}
            onChangeText={(v) => set("longitude", v)}
            placeholder="Longitudine"
            placeholderTextColor={Colors.textSecondary}
            keyboardType="decimal-pad"
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 4,
  },
  sectionTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 15,
    color: Colors.accent,
    marginTop: 16,
    marginBottom: 4,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  label: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 10,
    marginBottom: 4,
  },
  input: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: Colors.text,
    fontFamily: "Inter_400Regular",
    fontSize: 14,
  },
  mapPickerBtn: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  mapPickerText: {
    flex: 1,
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: Colors.textSecondary,
  },
  mapModal: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  mapHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: Colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  mapHeaderTitle: {
    fontFamily: "Inter_500Medium",
    fontSize: 14,
    color: Colors.text,
  },
  mapHeaderBtn: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  mapConfirmBtn: {},
  mapHeaderBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
    color: Colors.textSecondary,
  },
  coordBanner: {
    position: "absolute",
    bottom: 40,
    left: 16,
    right: 16,
    backgroundColor: "rgba(0,0,0,0.75)",
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    alignItems: "center",
  },
  coordBannerText: {
    fontFamily: "Inter_500Medium",
    fontSize: 14,
    color: "#fff",
  },
  coordRow: {
    flexDirection: "row",
    gap: 8,
  },
  coordInput: {
    flex: 1,
  },
});
