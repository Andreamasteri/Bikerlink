import React from "react";
import {
  Modal, View, Text, Pressable, StyleSheet,
  ActivityIndicator, Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";

interface MapTapConfirmModalProps {
  visible: boolean;
  address: string;
  geocoding: boolean;
  onSetStart: () => void;
  onAddWaypoint: () => void;
  onSetEnd: () => void;
  onDismiss: () => void;
}

export const MapTapConfirmModal: React.FC<MapTapConfirmModalProps> = ({
  visible,
  address,
  geocoding,
  onSetStart,
  onAddWaypoint,
  onSetEnd,
  onDismiss,
}) => {
  const colors = useColors();
  const s = styles(colors);

  return (
    <Modal
      transparent
      animationType="slide"
      visible={visible}
      onRequestClose={onDismiss}
      statusBarTranslucent
    >
      <Pressable style={s.backdrop} onPress={onDismiss} />
      <View style={s.sheet}>
        <View style={s.handle} />

        <View style={s.addressRow}>
          <Ionicons name="location" size={18} color={colors.accent} />
          {geocoding ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
              <ActivityIndicator size="small" color={colors.accent} />
              <Text style={s.addressText}>Ricerca indirizzo…</Text>
            </View>
          ) : (
            <Text style={s.addressText} numberOfLines={2}>{address}</Text>
          )}
        </View>

        <Text style={s.question}>Cosa vuoi fare con questo punto?</Text>

        <View style={s.actions}>
          <Pressable style={[s.actionBtn, { borderColor: "#22c55e" }]} onPress={onSetStart}>
            <Ionicons name="flag-outline" size={20} color="#22c55e" />
            <Text style={[s.actionLabel, { color: "#22c55e" }]}>Imposta come Partenza</Text>
          </Pressable>

          <Pressable style={[s.actionBtn, { borderColor: colors.accent }]} onPress={onAddWaypoint}>
            <Ionicons name="add-circle-outline" size={20} color={colors.accent} />
            <Text style={[s.actionLabel, { color: colors.accent }]}>Aggiungi tappa</Text>
          </Pressable>

          <Pressable style={[s.actionBtn, { borderColor: colors.accentRed }]} onPress={onSetEnd}>
            <Ionicons name="checkmark-circle-outline" size={20} color={colors.accentRed} />
            <Text style={[s.actionLabel, { color: colors.accentRed }]}>Imposta come Arrivo</Text>
          </Pressable>
        </View>

        <Pressable style={s.cancelBtn} onPress={onDismiss}>
          <Text style={s.cancelText}>Annulla</Text>
        </Pressable>
      </View>
    </Modal>
  );
};

const styles = (colors: ReturnType<typeof useColors>) =>
  StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)" },
    sheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      paddingTop: 12,
      paddingBottom: Platform.OS === "ios" ? 34 : 20,
      paddingHorizontal: 16,
      ...Platform.select({
        ios: {
          shadowColor: "#000",
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: 0.15,
          shadowRadius: 20,
        },
        android: { elevation: 16 },
      }),
    },
    handle: {
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.border,
      alignSelf: "center",
      marginBottom: 16,
    },
    addressRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 10,
      backgroundColor: colors.background,
      borderRadius: 12,
      padding: 12,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: colors.border,
    },
    addressText: {
      fontFamily: "Inter_500Medium",
      fontSize: 14,
      color: colors.text,
      flex: 1,
    },
    question: {
      fontFamily: "Inter_400Regular",
      fontSize: 13,
      color: colors.textSecondary,
      marginBottom: 12,
      textAlign: "center",
    },
    actions: { gap: 10, marginBottom: 12 },
    actionBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      borderWidth: 1.5,
      borderRadius: 14,
      paddingVertical: 14,
      paddingHorizontal: 16,
      backgroundColor: colors.surface,
    },
    actionLabel: {
      fontFamily: "Inter_600SemiBold",
      fontSize: 15,
    },
    cancelBtn: {
      alignItems: "center",
      paddingVertical: 12,
    },
    cancelText: {
      fontFamily: "Inter_500Medium",
      fontSize: 15,
      color: colors.textSecondary,
    },
  });
