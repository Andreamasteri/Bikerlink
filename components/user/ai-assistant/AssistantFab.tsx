// Task #2698 — FAB AI Assistant utente. Posizione DI DEFAULT bottom-LEFT (admin FAB
// arancione è bottom-right), colore primary, icona sparkles. TRASCINABILE (drag) +
// tap apre la chat; la posizione è persistita in AsyncStorage.
// Visibile solo se admin enabled + utente non disabilitato + modes.fab on.
//
// FIX gesture conflict: usa GestureDetector + gesti RNGH (Pan/Tap) sullo stesso layer
// nativo del FloatingWidget. I gesti sono MEMOIZZATI (useMemo): un gesto creato inline
// verrebbe ricreato a ogni render e GestureDetector ri-registrerebbe l'handler nativo
// (update asincrono), perdendo i touch caduti nella finestra di update. Inoltre il pan
// chiama setIsDragging → re-render: senza memoizzazione il gesto sarebbe ricreato a
// metà trascinamento e il drag verrebbe interrotto (stesso bug della pallina).
// Vedi memoria ai-assistant-config-contract: "RNGH gesture objects must be memoized".
import React, { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { StyleSheet, Platform, Dimensions, useWindowDimensions } from "react-native";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  runOnJS,
  withTiming,
} from "react-native-reanimated";
import { useColors } from "@/hooks/useColors";
import { useAssistantEnabled } from "@/hooks/useAssistantEnabled";
import AssistantChatSheet from "./AssistantChatSheet";

const FAB_SIZE = 56;
const POSITION_KEY = "assistant_fab_position";
export const ASSISTANT_FAB_TAB_BAR_HEIGHT = 60;
export const ASSISTANT_FAB_BOTTOM_MARGIN = 16;
export const ASSISTANT_FAB_WEB_INSET = 34;
export const ASSISTANT_FAB_LEFT_MARGIN = 16;
export const ASSISTANT_FAB_TAP_THRESHOLD = 5;

/**
 * Calcola la posizione `bottom` del FAB (distanza dal fondo schermo).
 * Exported per consentire test unitari senza montare il componente.
 */
export function computeAssistantFabBottom(insetsBottom: number, isWeb: boolean): number {
  const base = isWeb ? ASSISTANT_FAB_WEB_INSET : insetsBottom;
  return base + ASSISTANT_FAB_TAB_BAR_HEIGHT + ASSISTANT_FAB_BOTTOM_MARGIN;
}

/**
 * Clampa la posizione (x, y) del FAB dentro i bordi schermo, rispettando i
 * safe-area inset. Pura → testabile senza montare il componente. Replica la
 * stessa logica usata nel worklet del pan e nel loader di posizione.
 */
export function clampAssistantFabPosition(
  x: number,
  y: number,
  screenW: number,
  screenH: number,
  insetTop: number,
  insetBottom: number,
): { x: number; y: number } {
  return {
    x: Math.max(0, Math.min(x, screenW - FAB_SIZE)),
    y: Math.max(insetTop + 8, Math.min(y, screenH - FAB_SIZE - 8 - insetBottom)),
  };
}

export default function AssistantFab() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { fabEnabled } = useAssistantEnabled();
  const [open, setOpen] = useState(false);
  const [positionLoaded, setPositionLoaded] = useState(false);

  const { width, height } = useWindowDimensions();
  const bottom = computeAssistantFabBottom(insets.bottom, Platform.OS === "web");
  const defaultX = ASSISTANT_FAB_LEFT_MARGIN;
  const defaultY = height - FAB_SIZE - bottom;

  const pressed = useSharedValue(0);
  const posX = useSharedValue(defaultX);
  const posY = useSharedValue(defaultY);
  const startX = useSharedValue(defaultX);
  const startY = useSharedValue(defaultY);

  // Shared mirrors di dimensioni schermo e inset (aggiornate da effetti JS),
  // così i worklet del pan leggono valori freschi senza chiusure stantie.
  const screenW = useSharedValue(width);
  const screenH = useSharedValue(height);
  const insetsTop = useSharedValue(insets.top);
  const insetsBottom = useSharedValue(insets.bottom);

  useEffect(() => {
    insetsTop.value = insets.top;
    insetsBottom.value = insets.bottom;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [insets.top, insets.bottom]);

  useEffect(() => {
    const sub = Dimensions.addEventListener("change", ({ window }) => {
      screenW.value = window.width;
      screenH.value = window.height;
    });
    return () => sub.remove();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-clamp dopo cambi di dimensione/orientamento o inset: una posizione salvata
  // valida potrebbe finire fuori schermo dopo una rotazione. Salta il primo mount
  // (il loader iniziale clampa già la posizione caricata).
  const isMountedRef = useRef(false);
  useEffect(() => {
    if (!isMountedRef.current) {
      isMountedRef.current = true;
      return;
    }
    const clamped = clampAssistantFabPosition(posX.value, posY.value, width, height, insets.top, insets.bottom);
    if (clamped.x !== posX.value) posX.value = withTiming(clamped.x, { duration: 250 });
    if (clamped.y !== posY.value) posY.value = withTiming(clamped.y, { duration: 250 });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, height, insets.top, insets.bottom]);

  // Carica la posizione salvata; default bottom-left se assente o malformata.
  useEffect(() => {
    AsyncStorage.getItem(POSITION_KEY)
      .then((val) => {
        if (val) {
          try {
            const { x, y } = JSON.parse(val);
            const clamped = clampAssistantFabPosition(x, y, width, height, insets.top, insets.bottom);
            posX.value = clamped.x;
            posY.value = clamped.y;
          } catch {
            // no-op: mantiene la posizione di default
          }
        }
      })
      .catch(() => {
        // no-op: se la lettura fallisce mantiene la posizione di default
      })
      .finally(() => {
        // garantisce che la FAB diventi visibile anche se getItem va in rejection
        setPositionLoaded(true);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const triggerDragHaptic = useCallback(() => {
    if (Platform.OS !== "web") {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
  }, []);

  const savePositionJS = useCallback((x: number, y: number) => {
    AsyncStorage.setItem(POSITION_KEY, JSON.stringify({ x, y }));
  }, []);

  // useMemo con dep [handleOpen, pressed]: handleOpen è stabile, quindi tapGesture
  // NON viene ricreato a ogni render. Evita che GestureDetector riceva di continuo
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
        }),
    [handleOpen, pressed],
  );

  // Pan gesture per il drag — sull'UI thread per fluidità; minDistance > soglia tap
  // così un tap puro non attiva mai il pan. MEMOIZED (vedi commento in testa).
  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .minDistance(ASSISTANT_FAB_TAP_THRESHOLD + 1)
        .onStart(() => {
          "worklet";
          startX.value = posX.value;
          startY.value = posY.value;
          runOnJS(triggerDragHaptic)();
        })
        .onUpdate((e) => {
          "worklet";
          const rawX = startX.value + e.translationX;
          const rawY = startY.value + e.translationY;
          posX.value = Math.max(0, Math.min(rawX, screenW.value - FAB_SIZE));
          posY.value = Math.max(
            insetsTop.value + 8,
            Math.min(rawY, screenH.value - FAB_SIZE - 8 - insetsBottom.value),
          );
        })
        .onEnd(() => {
          "worklet";
          runOnJS(savePositionJS)(posX.value, posY.value);
        }),
    [posX, posY, startX, startY, screenW, screenH, insetsTop, insetsBottom, triggerDragHaptic, savePositionJS],
  );

  // Exclusive: pan ha priorità; il tap parte solo se la soglia di pan non è raggiunta.
  const composedGesture = useMemo(
    () => Gesture.Exclusive(panGesture, tapGesture),
    [panGesture, tapGesture],
  );

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: 1 - pressed.value * 0.15,
    transform: [{ translateX: posX.value }, { translateY: posY.value }],
  }));

  if (!fabEnabled || !positionLoaded) return null;

  return (
    <>
      <GestureDetector gesture={composedGesture}>
        <Animated.View
          accessibilityRole="button"
          accessibilityLabel="AI Assistant"
          testID="assistant-fab"
          style={[
            styles.fab,
            {
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
    top: 0,
    left: 0,
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
