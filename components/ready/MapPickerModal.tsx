import React from "react";
import { View, Text, Pressable, Modal } from "react-native";
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
}

export function MapPickerModal({
  visible,
  onClose,
  onConfirm,
  coord,
  setCoord,
  insets,
}: MapPickerModalProps) {
  return (
    <Modal
      visible={visible}
      transparent={false}
      animationType="slide"
      onRequestClose={onClose}
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
          <Pressable onPress={onClose} style={{ marginRight: 12 }}>
            <Ionicons name="close" size={24} color={Colors.text} />
          </Pressable>
          <Text
            style={{
              flex: 1,
              fontSize: 16,
              fontFamily: "Inter_600SemiBold",
              color: Colors.text,
            }}
          >
            Seleziona posizione
          </Text>
          <Pressable
            onPress={onConfirm}
            style={{
              backgroundColor: Colors.accent,
              borderRadius: 8,
              paddingVertical: 8,
              paddingHorizontal: 16,
            }}
          >
            <Text style={{ color: "#fff", fontFamily: "Inter_700Bold" }}>
              Conferma
            </Text>
          </Pressable>
        </View>
        <LeafletPickerMap
          initialLat={coord.latitude}
          initialLng={coord.longitude}
          initialZoom={12}
          selectedCoord={{ lat: coord.latitude, lng: coord.longitude }}
          onCoordPicked={setCoord}
        />
        <View
          style={{
            padding: 12,
            paddingBottom: insets.bottom + 8,
            backgroundColor: Colors.card,
          }}
        >
          <Text
            style={{
              textAlign: "center",
              fontFamily: "Inter_400Regular",
              color: Colors.textSecondary,
              fontSize: 13,
            }}
          >
            Tocca la mappa per spostare il pin
          </Text>
          <Text
            style={{
              textAlign: "center",
              fontFamily: "Inter_500Medium",
              color: Colors.text,
              fontSize: 13,
              marginTop: 4,
            }}
          >
            {`${coord.latitude.toFixed(5)}, ${coord.longitude.toFixed(5)}`}
          </Text>
        </View>
      </View>
    </Modal>
  );
}
