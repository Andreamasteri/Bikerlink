import React from "react";
import { View, Text, Pressable, Modal, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import LeafletPickerMap from "@/components/LeafletPickerMap";
import { EdgeInsets } from "react-native-safe-area-context";

interface MapPickerModalProps {
  visible: boolean;
  onClose: () => void;
  onConfirm: () => void;
  coord: { latitude: number; longitude: number };
  setCoord: (coord: { latitude: number; longitude: number }) => void;
  insets: EdgeInsets;
  isFixedPosition?: boolean;
}

export function MapPickerModal({
  visible,
  onClose,
  onConfirm,
  coord,
  setCoord,
  insets,
  isFixedPosition = false,
}: MapPickerModalProps) {
  const title = isFixedPosition
    ? "Scegli posizione fissa"
    : "Seleziona posizione";

  const hint = isFixedPosition
    ? "Tocca per posizionare il pin o trascinalo per precisione"
    : "Tocca la mappa per spostare il pin";

  return (
    <Modal
      visible={visible}
      transparent={false}
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={{ flex: 1, backgroundColor: Colors.background }}>
        <View
          style={[
            styles.header,
            { paddingTop: insets.top + 8 },
          ]}
        >
          <Pressable onPress={onClose} style={{ marginRight: 12 }}>
            <Ionicons name="close" size={24} color={Colors.text} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>{title}</Text>
            {isFixedPosition && (
              <Text style={styles.headerSubtitle}>
                Posizione mostrata agli altri utenti
              </Text>
            )}
          </View>
          <Pressable
            onPress={onConfirm}
            style={styles.confirmBtn}
          >
            <Text style={styles.confirmBtnText}>Conferma</Text>
          </Pressable>
        </View>

        {isFixedPosition && (
          <View style={styles.infoBanner}>
            <Ionicons name="pin" size={14} color={Colors.accent} style={{ marginRight: 6 }} />
            <Text style={styles.infoBannerText}>
              Tocca la mappa per posizionare il pin esattamente dove vuoi apparire
            </Text>
          </View>
        )}

        <LeafletPickerMap
          initialLat={coord.latitude}
          initialLng={coord.longitude}
          initialZoom={isFixedPosition ? 14 : 12}
          selectedCoord={{ lat: coord.latitude, lng: coord.longitude }}
          onCoordPicked={setCoord}
        />

        <View
          style={[
            styles.footer,
            { paddingBottom: insets.bottom + 8 },
          ]}
        >
          <Text style={styles.footerHint}>{hint}</Text>
          <Text style={styles.footerCoords}>
            {`${coord.latitude.toFixed(5)}, ${coord.longitude.toFixed(5)}`}
          </Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: Colors.card,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerTitle: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
  },
  headerSubtitle: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    marginTop: 1,
  },
  confirmBtn: {
    backgroundColor: Colors.accent,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  confirmBtnText: {
    color: "#fff",
    fontFamily: "Inter_700Bold",
    fontSize: 14,
  },
  infoBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.accent + "18",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.accent + "30",
  },
  infoBannerText: {
    flex: 1,
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.text,
    lineHeight: 17,
  },
  footer: {
    padding: 12,
    backgroundColor: Colors.card,
  },
  footerHint: {
    textAlign: "center",
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    fontSize: 13,
  },
  footerCoords: {
    textAlign: "center",
    fontFamily: "Inter_500Medium",
    color: Colors.text,
    fontSize: 13,
    marginTop: 4,
  },
});
