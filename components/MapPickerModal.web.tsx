import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, TextInput } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";

interface Props {
  coord: { latitude: number; longitude: number } | null;
  onCoordChange: (coord: { latitude: number; longitude: number }) => void;
  onConfirm: () => void;
  onClose: () => void;
}

export default function MapPickerContent({ coord, onCoordChange, onConfirm, onClose }: Props) {
  const insets = useSafeAreaInsets();

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      <View style={[styles.mapHeader, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={onClose}>
          <Ionicons name="close" size={24} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.mapHeaderTitle}>Inserisci coordinate</Text>
        <TouchableOpacity onPress={onConfirm} disabled={!coord}>
          <Text style={[styles.mapConfirmText, !coord && { opacity: 0.4 }]}>Conferma</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.webMapFallback}>
        <Ionicons name="map-outline" size={48} color={Colors.textSecondary} />
        <Text style={styles.webMapText}>
          La mappa non è disponibile su web.{"\n"}Inserisci le coordinate manualmente:
        </Text>
        <TextInput
          style={styles.input}
          placeholder="Latitudine (es. 41.9028)"
          placeholderTextColor={Colors.textSecondary}
          value={coord ? String(coord.latitude) : ""}
          onChangeText={(t) =>
            onCoordChange({ latitude: parseFloat(t) || 0, longitude: coord?.longitude || 0 })
          }
          keyboardType="numeric"
        />
        <TextInput
          style={styles.input}
          placeholder="Longitudine (es. 12.4964)"
          placeholderTextColor={Colors.textSecondary}
          value={coord ? String(coord.longitude) : ""}
          onChangeText={(t) =>
            onCoordChange({ latitude: coord?.latitude || 0, longitude: parseFloat(t) || 0 })
          }
          keyboardType="numeric"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  mapHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  mapHeaderTitle: { fontFamily: "Inter_600SemiBold", fontSize: 16, color: Colors.text },
  mapConfirmText: { fontFamily: "Inter_600SemiBold", fontSize: 16, color: Colors.accent },
  webMapFallback: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
    gap: 16,
  },
  webMapText: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: 22,
  },
  input: {
    backgroundColor: Colors.background,
    borderRadius: 12,
    padding: 14,
    fontFamily: "Inter_400Regular",
    fontSize: 15,
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.border,
    width: "100%",
    maxWidth: 400,
  },
});
