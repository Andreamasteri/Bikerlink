import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { useRouter, type Href } from "expo-router";

interface GarageReminderModalProps {
  visible: boolean;
  onClose: () => void;
  isBikerOrCoppia: boolean;
  text: string;
  buttonText: string;
}

export function GarageReminderModal({
  visible,
  onClose,
  isBikerOrCoppia,
  text,
  buttonText,
}: GarageReminderModalProps) {
  const colors = useColors();
  const router = useRouter();

  if (!visible) return null;

  return (
    <View style={[StyleSheet.absoluteFill, styles.overlay]}>
      <View style={[styles.card, { backgroundColor: colors.surface }]}>
        <Ionicons
          name={isBikerOrCoppia ? "build" : "heart"}
          size={36}
          color={colors.accent}
          style={{ marginBottom: 12 }}
        />
        <Text style={[styles.text, { color: colors.text }]}>{text}</Text>
        <Pressable
          style={[styles.btn, { backgroundColor: colors.accent }]}
          onPress={() => {
            onClose();
            router.push("/garage" as Href);
          }}
        >
          <Text style={styles.btnText}>{buttonText}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
    zIndex: 9999,
  },
  card: {
    width: "100%",
    borderRadius: 20,
    padding: 24,
    alignItems: "center",
    elevation: 5,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  text: {
    fontFamily: "Inter_500Medium",
    fontSize: 16,
    textAlign: "center",
    marginBottom: 20,
    lineHeight: 24,
  },
  btn: {
    width: "100%",
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
  },
  btnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 16,
    color: "#fff",
  },
});
