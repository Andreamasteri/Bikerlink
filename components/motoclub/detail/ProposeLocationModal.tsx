import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  TextInput,
  ActivityIndicator,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import LeafletPickerMap from "@/components/LeafletPickerMap";
import * as Location from "expo-location";
import { useSafeAreaInsets } from "react-native-safe-area-context";

interface ProposeLocationModalProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (coords: { latitude: number; longitude: number }, address: string) => void;
  isPending: boolean;
  clubName: string;
  hintText: string;
  sendingText: string;
  sendText: string;
}

export const ProposeLocationModal: React.FC<ProposeLocationModalProps> = ({
  visible,
  onClose,
  onSubmit,
  isPending,
  clubName,
  hintText,
  sendingText,
  sendText,
}) => {
  const insets = useSafeAreaInsets();
  const [proposeAddress, setProposeAddress] = useState("");
  const [proposeCoords, setProposeCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [gettingLocation, setGettingLocation] = useState(false);

  async function handleGetGPS() {
    setGettingLocation(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permesso negato", "Abilita la posizione nelle impostazioni");
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      setProposeCoords({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
    } catch {
      Alert.alert("Errore", "Impossibile ottenere la posizione GPS");
    } finally {
      setGettingLocation(false);
    }
  }

  function handleSubmit() {
    if (!proposeCoords) {
      Alert.alert("Posizione mancante", "Sposta il pin sulla mappa o usa il GPS per indicare la sede.");
      return;
    }
    onSubmit(proposeCoords, proposeAddress);
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalSheet, { paddingBottom: insets.bottom + 20 }]}>
          <View style={styles.modalHandle} />
          <Text style={styles.modalTitle}>Proponi sede fisica</Text>
          <Text style={styles.modalSub}>{hintText.replace("{name}", clubName)}</Text>

          <View style={styles.mapPickerContainer}>
            <LeafletPickerMap
              initialLat={41.9}
              initialLng={12.5}
              initialZoom={5}
              selectedCoord={proposeCoords ? { lat: proposeCoords.latitude, lng: proposeCoords.longitude } : null}
              onCoordPicked={(coord) => setProposeCoords(coord)}
            />
            {!proposeCoords && (
              <View style={styles.mapPickerHint}>
                <Text style={styles.mapPickerHintText}>Tocca sulla mappa per posizionare il pin</Text>
              </View>
            )}
            {proposeCoords && (
              <View style={styles.mapPickerCoords}>
                <Text style={styles.mapPickerCoordsText}>
                  {proposeCoords.latitude.toFixed(5)}, {proposeCoords.longitude.toFixed(5)}
                </Text>
              </View>
            )}
          </View>

          <TouchableOpacity style={styles.gpsBtn} onPress={handleGetGPS} disabled={gettingLocation}>
            {gettingLocation ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Ionicons name="locate" size={16} color="#fff" />
                <Text style={styles.gpsBtnText}>Usa la mia posizione GPS</Text>
              </>
            )}
          </TouchableOpacity>

          <Text style={styles.inputLabel}>Indirizzo (opzionale)</Text>
          <TextInput
            style={[styles.coordInput, { height: 60 }]}
            value={proposeAddress}
            onChangeText={setProposeAddress}
            placeholder="Via Roma 1, Milano..."
            placeholderTextColor={Colors.textSecondary}
            multiline
          />

          <View style={styles.modalBtnRow}>
            <TouchableOpacity style={styles.modalCancelBtn} onPress={onClose}>
              <Text style={styles.modalCancelBtnText}>Annulla</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modalSubmitBtn, isPending && { opacity: 0.6 }]}
              onPress={handleSubmit}
              disabled={isPending}
            >
              <Text style={styles.modalSubmitBtnText}>
                {isPending ? sendingText : sendText}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: Colors.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    gap: 10,
  },
  modalHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
    alignSelf: "center",
    marginBottom: 8,
  },
  modalTitle: { fontFamily: "Inter_700Bold", fontSize: 18, color: Colors.text, textAlign: "center" },
  modalSub: { fontFamily: "Inter_400Regular", fontSize: 13, color: Colors.textSecondary, textAlign: "center", marginBottom: 8 },
  gpsBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.accent,
    borderRadius: 10,
    paddingVertical: 12,
  },
  gpsBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: "#fff" },
  inputLabel: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: Colors.text },
  mapPickerContainer: {
    height: 200,
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 4,
    position: "relative",
  },
  mapPickerHint: {
    position: "absolute",
    bottom: 8,
    left: 8,
    right: 8,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    alignItems: "center",
  },
  mapPickerHintText: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: "#fff",
  },
  mapPickerCoords: {
    position: "absolute",
    bottom: 8,
    left: 8,
    right: 8,
    backgroundColor: "rgba(0,150,136,0.85)",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    alignItems: "center",
  },
  mapPickerCoordsText: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: "#fff",
  },
  coordInput: {
    backgroundColor: Colors.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: Colors.text,
  },
  modalBtnRow: { flexDirection: "row", gap: 10, marginTop: 8 },
  modalCancelBtn: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingVertical: 13,
    alignItems: "center",
  },
  modalCancelBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: Colors.text },
  modalSubmitBtn: {
    flex: 2,
    backgroundColor: "#2979FF",
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: "center",
  },
  modalSubmitBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: "#fff" },
});
