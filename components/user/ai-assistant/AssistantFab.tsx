// Task #2698 — FAB AI Assistant utente. Posizionato bottom-LEFT (admin FAB
// arancione è bottom-right), colore primary, icona sparkles, NON draggable.
// Visibile solo se admin enabled + utente non disabilitato + modes.fab on.
//
// FIX gesture conflict: usa GestureDetector + Gesture.Tap() invece di Pressable
// per operare sullo stesso layer nativo di RNGH del FloatingWidget, eliminando
// il conflitto di touch routing su Android tra Pressable e GestureDetector.
import React, { useState, useCallback, useMemo } from "react";
import { StyleSheet, Platform } from "react-native";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  runOnJS,
  withTiming,
} from "react-native-reanimated";
import { useColors } from "@/hooks/useColors";
import { useAssistantEnabled } from "@/hooks/useAssistantEnabled";
import { useAssistantFabGestureRef } from "@/lib/assistant-fab-gesture-context";
import AssistantChatSheet from "./AssistantChatSheet";

const FAB_SIZE = 56;
export const ASSISTANT_FAB_TAB_BAR_HEIGHT = 60;
export const ASSISTANT_FAB_BOTTOM_MARGIN = 16;
export const ASSISTANT_FAB_WEB_INSET = 34;

/**
 * Calcola la posizione `bottom` del FAB.
 * Exported per consentire test unitari senza montare il componente.
 */
export function computeAssistantFabBottom(insetsBottom: number, isWeb: boolean): number {
  const base = isWeb ? ASSISTANT_FAB_WEB_INSET : insetsBottom;
  return base + ASSISTANT_FAB_TAB_BAR_HEIGHT + ASSISTANT_FAB_BOTTOM_MARGIN;
}

export default function AssistantFab() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { fabEnabled } = useAssistantEnabled();
  // Ref condiviso col FloatingWidget: il suo backdrop fullscreen (quando il menu
  // è aperto) dichiara simultaneousWithExternalGesture(fabGestureRef) così il tap
  // sul FAB non viene mai "rubato" dal backdrop su Android.
  const fabGestureRef = useAssistantFabGestureRef();
  const [open, setOpen] = useState(false);

  const pressed = useSharedValue(0);

  // useCallback con deps vuote: setOpen è stabile (React garantisce la stabilità
  // dei setter useState), quindi handleOpen mantiene la stessa ref tra i render.
  // Necessario perché runOnJS(handleOpen) cattura il ref alla creazione del
  // worklet — una ref instabile causa stale closure in Reanimated+Hermes.
  const handleOpen = useCallback(() => {
    if (Platform.OS !== "web") {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setOpen(true);
  }, []);

  // useMemo con dep [handleOpen]: handleOpen è stabile, quindi tapGesture NON
  // viene ricreato a ogni render. Evita che GestureDetector riceva di continuo
  // un nuovo gesture prop (RNGH aggiorna il native handler in modo asincrono:
  // durante la finestra di update il tap può andare perso).
  const tapGesture = useMemo(
    () =>
      Gesture.Tap()
        .onBegin(() => {
          "worklet";
          pressed.value = withTiming(1, { duration: 80 });
        })
        .onFinalize(() => {
          "worklet";
          pressed.value = withTiming(0, { duration: 120 });
        })
        .onEnd((_e, success) => {
          "worklet";
          if (success) runOnJS(handleOpen)();
        })
        // Espone questo gesture al backdrop del FloatingWidget via ref condiviso.
        .withRef(fabGestureRef),
    [handleOpen, pressed, fabGestureRef],
  );

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: 1 - pressed.value * 0.15,
  }));

  if (!fabEnabled) return null;

  const bottom = computeAssistantFabBottom(insets.bottom, Platform.OS === "web");

  return (
    <>
      <GestureDetector gesture={tapGesture}>
        <Animated.View
          accessibilityRole="button"
          accessibilityLabel="AI Assistant"
          testID="assistant-fab"
          style={[
            styles.fab,
            {
              bottom,
              backgroundColor: colors.primary,
              shadowColor: colors.text,
            },
            animatedStyle,
          ]}
        >
          <Ionicons name="sparkles" size={26} color="#FFFFFF" />
        </Animated.View>
      </GestureDetector>
      <AssistantChatSheet visible={open} onClose={() => setOpen(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: "absolute",
    left: 16,
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: FAB_SIZE / 2,
    alignItems: "center",
    justifyContent: "center",
    shadowOpacity: 0.25,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 21,
    // zIndex above the FloatingWidget container (9999) and its full-screen
    // backdrop so the FAB stays tappable while the FloatingWidget menu is open.
    zIndex: 10000,
  },
});
