import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";

interface FakeHomeIntroModalProps {
  visible: boolean;
  onClose: (dontShowAgain: boolean) => void;
  dontShowAgain: boolean;
  setDontShowAgain: (val: boolean) => void;
}

export function FakeHomeIntroModal({
  visible,
  onClose,
  dontShowAgain,
  setDontShowAgain,
}: FakeHomeIntroModalProps) {
  const colors = useColors();

  if (!visible) return null;

  return (
    <View style={[StyleSheet.absoluteFill, styles.overlay]}>
      <View style={[styles.card, { backgroundColor: colors.surface }]}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12 }}>
          <Ionicons name="home" size={28} color={colors.accent} />
          <Text style={{ fontSize: 18, fontFamily: "Inter_700Bold", color: colors.text, flex: 1 }}>Configura Fake Home</Text>
        </View>
        <Text style={{ fontSize: 14, fontFamily: "Inter_400Regular", color: colors.textSecondary, lineHeight: 20, marginBottom: 16 }}>
          La zona Fake Home non è ancora configurata.{"\n\n"}Vai in Privacy & GPS per impostare la posizione reale di casa e quella fittizia: quando sei nel raggio, la tua posizione visibile verrà sostituita automaticamente.
        </Text>
        <Pressable style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 16 }} onPress={() => setDontShowAgain(!dontShowAgain)}>
          <View style={{ width: 18, height: 18, borderRadius: 4, borderWidth: 1.5, borderColor: dontShowAgain ? colors.accent : colors.border, backgroundColor: dontShowAgain ? colors.accent : "transparent", alignItems: "center", justifyContent: "center" }}>
            {dontShowAgain && <Ionicons name="checkmark" size={12} color="#fff" />}
          </View>
          <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: colors.textSecondary }}>Non mostrare più</Text>
        </Pressable>
        <Pressable style={{ backgroundColor: colors.accent, borderRadius: 10, paddingVertical: 12, alignItems: "center" }} onPress={() => onClose(dontShowAgain)}>
          <Text style={{ fontSize: 15, fontFamily: "Inter_600SemiBold", color: "#fff" }}>OK</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.5)",
    padding: 24,
    zIndex: 9999,
  },
  card: {
    borderRadius: 16,
    padding: 24,
    width: "100%",
  },
});
