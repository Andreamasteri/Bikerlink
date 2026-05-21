import React from "react";
import { View, Text, StyleSheet, Modal, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { GeoZone } from "./UserDetailModal";

// Note: MapView and MapMarker should be passed from the parent because of the conditional import logic.
interface ZoneMapModalProps {
  zone: GeoZone | null;
  onClose: () => void;
  MapView: any;
  MapMarker: any;
  insets: { top: number; bottom: number };
}

export const ZoneMapModal: React.FC<ZoneMapModalProps> = ({
  zone,
  onClose,
  MapView,
  MapMarker,
  insets,
}) => {
  return (
    <Modal visible={!!zone} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={[styles.mapModal, { paddingTop: insets.top + 10, paddingBottom: insets.bottom + 10 }]}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>
              Zona {zone?.type ?? ""}
            </Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color={Colors.text} />
            </TouchableOpacity>
          </View>
          <View style={{ flex: 1 }}>
            {zone && MapView ? (
              <MapView
                style={{ flex: 1 }}
                googleMapsApiKey={process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY}
                initialRegion={{
                  latitude: zone.lat,
                  longitude: zone.lng,
                  latitudeDelta: 0.012,
                  longitudeDelta: 0.012,
                }}
              >
                {MapMarker && (
                  <MapMarker
                    coordinate={{ latitude: zone.lat, longitude: zone.lng }}
                  />
                )}
              </MapView>
            ) : (
              <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
                <Text style={styles.note}>Mappa non disponibile</Text>
              </View>
            )}
          </View>
          {zone && (
            <View style={styles.mapFooter}>
              <Text style={styles.mapCoords}>
                {zone.lat.toFixed(6)}, {zone.lng.toFixed(6)}
              </Text>
              <Text style={styles.mapMeta}>
                {zone.visitCount} rilevazioni · {zone.totalMinutes} min totali
              </Text>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    padding: 20,
  },
  mapModal: {
    flex: 1,
    backgroundColor: Colors.background,
    marginTop: 60,
    marginHorizontal: 12,
    borderRadius: 16,
    overflow: "hidden",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  modalTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 20,
    color: Colors.text,
  },
  note: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 8,
    textAlign: "center" as const,
  },
  mapFooter: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  mapCoords: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    color: Colors.text,
  },
  mapMeta: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 2,
  },
});
