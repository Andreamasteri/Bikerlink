// Task #2641 — FAB flottante AI Console: tap=drawer, long-press=console intera.
// Task #2692 — FAB trascinabile con persistenza posizione (AsyncStorage) e clamp ai bordi.
// Task #4540 — Migrazione PanResponder → RNGH Gesture.Pan() + reanimated shared values:
//   Expo Router usa RNGH a livello nativo e reclamava i gesti prima del PanResponder JS,
//   rendendo il FAB né cliccabile né trascinabile. tap/long-press restano discriminati
//   via Date.now() (onBegin/onEnd), il drag via translation. Haptics conditional.
import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Platform,
  useWindowDimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { useSharedValue, useAnimatedStyle, withSpring, runOnJS } from "react-native-reanimated";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useColors } from "@/hooks/useColors";
import { useAiActionQueue } from "@/hooks/admin/ai-console/useAiActionQueue";
import { useAiAlertsState, useAiAlertsSubscriber } from "@/hooks/admin/ai-console/useAiAlerts";
import { useExplainPending } from "@/hooks/admin/ai-console/useAiExplain";
import { useBugReport } from "@/hooks/admin/ai-console/useBugReport";
import FabDrawer from "./FabDrawer";

import * as Haptics from "expo-haptics";

function triggerHaptic(style: "light" | "medium" = "light") {
  if (Platform.OS === "web") return;
  try {
    Haptics.impactAsync(
      style === "medium" ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light,
    );
  } catch { /* skip */ }
}

const FAB_SIZE = 56;
const EDGE_MARGIN = 8;
const DRAG_THRESHOLD = 5;
const LONG_PRESS_MS = 500;
const STORAGE_KEY = "admin:ai-fab:pos";

export default function FabWidget() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { width: winW, height: winH } = useWindowDimensions();
  const [drawerOpen, setDrawerOpen] = useState(false);
  useAiAlertsSubscriber({ enabled: true });
  const alerts = useAiAlertsState();
  const explain = useExplainPending();
  const { data: queue } = useAiActionQueue();

  const { unseenCount: bugUnseen } = useBugReport();
  // Badge principale: alert AI + coda azioni (separato da bug)
  const total = (queue?.items?.length ?? 0) + alerts.unread;
  const hasExplain = !!explain;

  const bottomInset = Math.max(insets.bottom, Platform.OS === "web" ? 34 : 12);
  const topInset = Math.max(insets.top, Platform.OS === "web" ? 67 : 0);

  // Refs aggiornati ad ogni render per evitare stale closure nei callback JS
  // invocati da runOnJS (tap/long-press dipendono da hasExplain e router).
  const hasExplainRef = useRef(hasExplain);
  hasExplainRef.current = hasExplain;
  const routerRef = useRef(router);
  routerRef.current = router;
  const setDrawerOpenRef = useRef(setDrawerOpen);
  setDrawerOpenRef.current = setDrawerOpen;

  const clamp = (x: number, y: number) => {
    const minX = EDGE_MARGIN + insets.left;
    const maxX = winW - FAB_SIZE - EDGE_MARGIN - insets.right;
    const minY = EDGE_MARGIN + topInset;
    const maxY = winH - FAB_SIZE - EDGE_MARGIN - bottomInset;
    return {
      x: Math.min(Math.max(x, minX), Math.max(minX, maxX)),
      y: Math.min(Math.max(y, minY), Math.max(minY, maxY)),
    };
  };
  const clampRef = useRef(clamp);
  clampRef.current = clamp;

  const defaultPos = () => ({
    x: winW - FAB_SIZE - 16 - insets.right,
    y: winH - FAB_SIZE - 16 - bottomInset,
  });
  const initialPos = defaultPos();

  // Posizione e scala come shared values reanimated (thread UI). Lo stesso stack
  // (RNGH + reanimated) usato da Expo Router, quindi i gesti del FAB non vengono
  // surclassati dai gesture handler nativi come col vecchio PanResponder JS.
  const posX = useSharedValue(initialPos.x);
  const posY = useSharedValue(initialPos.y);
  const startX = useSharedValue(initialPos.x);
  const startY = useSharedValue(initialPos.y);
  const scale = useSharedValue(1);

  const [loaded, setLoaded] = useState(false);
  // Timing del press (thread JS) per distinguere tap da long-press in onEnd.
  const pressStartRef = useRef<number>(0);

  // Load persisted position
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (typeof parsed?.x === "number" && typeof parsed?.y === "number") {
            const c = clampRef.current(parsed.x, parsed.y);
            posX.value = c.x;
            posY.value = c.y;
          }
        }
      } catch { /* skip */ }
      setLoaded(true);
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-clamp on window resize / inset change
  useEffect(() => {
    if (!loaded) return;
    const c = clampRef.current(posX.value, posY.value);
    posX.value = c.x;
    posY.value = c.y;
  }, [winW, winH, insets.top, insets.bottom, insets.left, insets.right, loaded]); // eslint-disable-line react-hooks/exhaustive-deps

  // Avvio del press: registra il timestamp (thread JS) per il long-press.
  const onPressStart = () => {
    pressStartRef.current = Date.now();
  };

  // Fine del gesto (thread JS). dragged=true → solo persistenza; altrimenti
  // distingue tap da long-press via durata, replicando la logica originale.
  const handleRelease = (finalX: number, finalY: number, dragged: boolean) => {
    if (dragged) {
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ x: finalX, y: finalY })).catch(() => { /* skip */ });
      return;
    }
    const elapsed = Date.now() - pressStartRef.current;
    if (elapsed >= LONG_PRESS_MS) {
      triggerHaptic("medium");
      routerRef.current.push("/admin/ai-console" as never);
    } else {
      triggerHaptic("light");
      if (hasExplainRef.current) {
        routerRef.current.push("/admin/ai-console" as never);
      } else {
        setDrawerOpenRef.current(true);
      }
    }
  };

  const panGesture = Gesture.Pan()
    // minDistance(0): attiva la Pan al touch-down così onEnd scatta anche su un
    // tap puro senza movimento (altrimenti tap/long-press non verrebbero mai
    // gestiti perché il gesto non raggiungerebbe lo stato ACTIVE).
    .minDistance(0)
    .onBegin(() => {
      "worklet";
      startX.value = posX.value;
      startY.value = posY.value;
      scale.value = withSpring(0.92);
      runOnJS(onPressStart)();
    })
    .onUpdate((e) => {
      "worklet";
      const minX = EDGE_MARGIN + insets.left;
      const maxX = winW - FAB_SIZE - EDGE_MARGIN - insets.right;
      const minY = EDGE_MARGIN + topInset;
      const maxY = winH - FAB_SIZE - EDGE_MARGIN - bottomInset;
      const rawX = startX.value + e.translationX;
      const rawY = startY.value + e.translationY;
      posX.value = Math.min(Math.max(rawX, minX), Math.max(minX, maxX));
      posY.value = Math.min(Math.max(rawY, minY), Math.max(minY, maxY));
    })
    .onEnd((e) => {
      "worklet";
      scale.value = withSpring(1);
      const dragged =
        Math.abs(e.translationX) > DRAG_THRESHOLD || Math.abs(e.translationY) > DRAG_THRESHOLD;
      runOnJS(handleRelease)(posX.value, posY.value, dragged);
    })
    .onFinalize(() => {
      "worklet";
      scale.value = withSpring(1);
    });

  const animStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: posX.value },
      { translateY: posY.value },
      { scale: scale.value },
    ],
  }));

  return (
    <>
      <Animated.View
        style={[styles.wrap, animStyle]}
        accessibilityRole="button"
        accessibilityLabel="AI Console"
        testID="ai-console-fab"
      >
        <GestureDetector gesture={panGesture}>
          <View
            style={[
              styles.btn,
              { backgroundColor: colors.accent, shadowColor: colors.accent },
            ]}
          >
            <Ionicons name={hasExplain ? "help-circle" : "sparkles"} size={24} color="#fff" />
            {total > 0 ? (
              <View style={[styles.badge, { backgroundColor: colors.error, borderColor: colors.background }]}>
                <Text style={styles.badgeText}>{total > 99 ? "99+" : total}</Text>
              </View>
            ) : hasExplain ? (
              <View style={[styles.dot, { backgroundColor: colors.warning ?? "#FFB300", borderColor: colors.background }]} />
            ) : null}
            {/* Badge bug separato — angolo in basso a sinistra, distinto dagli alert AI */}
            {bugUnseen > 0 && (
              <View style={[styles.bugBadge, { backgroundColor: colors.error ?? "#E53E3E", borderColor: colors.background }]}>
                <Text style={styles.bugBadgeText}>{bugUnseen > 9 ? "9+" : bugUnseen}</Text>
              </View>
            )}
          </View>
        </GestureDetector>
      </Animated.View>
      <FabDrawer visible={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  // left:0/top:0 fissi: la posizione effettiva è data dal transform dell'animStyle.
  wrap: { position: "absolute", left: 0, top: 0, zIndex: 999, width: FAB_SIZE, height: FAB_SIZE },
  btn: {
    width: FAB_SIZE, height: FAB_SIZE, borderRadius: FAB_SIZE / 2,
    alignItems: "center", justifyContent: "center",
    shadowOpacity: 0.35, shadowOffset: { width: 0, height: 4 }, shadowRadius: 8, elevation: 6,
  },
  badge: {
    position: "absolute", top: -4, right: -4,
    minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 5,
    alignItems: "center", justifyContent: "center", borderWidth: 2,
  },
  badgeText: { color: "#fff", fontFamily: "Inter_700Bold", fontSize: 10 },
  dot: { position: "absolute", top: -2, right: -2, width: 12, height: 12, borderRadius: 6, borderWidth: 2 },
  bugBadge: {
    position: "absolute", bottom: -4, left: -4,
    minWidth: 16, height: 16, borderRadius: 8, paddingHorizontal: 3,
    alignItems: "center", justifyContent: "center", borderWidth: 2,
  },
  bugBadgeText: { color: "#fff", fontFamily: "Inter_700Bold", fontSize: 8 },
});
