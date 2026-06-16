// Task #2698 — FAB AI Assistant utente. Posizionato bottom-LEFT (admin FAB
// arancione è bottom-right), colore primary, icona sparkles, NON draggable.
// Visibile solo se admin enabled + utente non disabilitato + modes.fab on.
import React, { useState } from "react";
import { Pressable, StyleSheet, View, Platform } from "react-native";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useAssistantEnabled } from "@/hooks/useAssistantEnabled";
import AssistantChatSheet from "./AssistantChatSheet";

const FAB_SIZE = 56;

export default function AssistantFab() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { fabEnabled } = useAssistantEnabled();
  const [open, setOpen] = useState(false);

  if (!fabEnabled) return null;

  const bottom = Platform.OS === "web" ? 34 + 16 : insets.bottom + 16;

  return (
    <>
      <View
        pointerEvents="box-none"
        style={[styles.layer, { paddingLeft: 16, paddingBottom: bottom }]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="AI Assistant"
          testID="assistant-fab"
          onPress={() => {
            if (Platform.OS !== "web") {
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }
            setOpen(true);
          }}
          style={({ pressed }) => [
            styles.fab,
            {
              backgroundColor: colors.primary,
              shadowColor: colors.text,
              opacity: pressed ? 0.85 : 1,
            },
          ]}
        >
          <Ionicons name="sparkles" size={26} color="#FFFFFF" />
        </Pressable>
      </View>
      <AssistantChatSheet visible={open} onClose={() => setOpen(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  layer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    top: 0,
    justifyContent: "flex-end",
    alignItems: "flex-start",
    zIndex: 9000,
  },
  fab: {
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: FAB_SIZE / 2,
    alignItems: "center",
    justifyContent: "center",
    shadowOpacity: 0.25,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 6,
  },
});
