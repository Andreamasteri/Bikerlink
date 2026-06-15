// Task #2641 — FAB flottante AI Console: tap=drawer, long-press=console intera.
// Task #2692 — FAB trascinabile con persistenza posizione (AsyncStorage) e clamp ai bordi.
// Task #4080 — Fix drag: onStartShouldSetPanResponder true + tap/long-press via release timing.
// Haptics conditional; reanimated per fade/scale.
import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Platform,
  PanResponder,
  useWindowDimensions,
  GestureResponderEvent,
  PanResponderGestureState,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from "react-native-reanimated";
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

  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const { unseenCount: bugUnseen } = useBugReport();
  // Badge principale: alert AI + coda azioni (separato da bug)
  const total = (queue?.items?.length ?? 0) + alerts.unread;
  const hasExplain = !!explain;

  const bottomInset = Math.max(insets.bottom, Platform.OS === "web" ? 34 : 12);
  const topInset = Math.max(insets.top, Platform.OS === "web" ? 67 : 0);

  // Refs aggiornati ad ogni render per evitare stale closure nel PanResponder
  const hasExplainRef = useRef(hasExplain);
  hasExplainRef.current = hasExplain;
  const routerRef = useRef(router);
  routerRef.current = router;

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

  const [pos, setPos] = useState<{ x: number; y: number }>(() => defaultPos());
  const [loaded, setLoaded] = useState(false);
  const posRef = useRef(pos);
  posRef.current = pos;
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const didDragRef = useRef(false);
  const pressStartRef = useRef<number>(0);

  // refs per handlers che cambiano con lo state
  const setDrawerOpenRef = useRef(setDrawerOpen);
  setDrawerOpenRef.current = setDrawerOpen;

  // Load persisted position
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (typeof parsed?.x === "number" && typeof parsed?.y === "number") {
            setPos(clampRef.current(parsed.x, parsed.y));
          }
        }
      } catch { /* skip */ }
      setLoaded(true);
    })();
  }, []);

  // Re-clamp on window resize / inset change
  useEffect(() => {
    if (!loaded) return;
    setPos((prev) => clampRef.current(prev.x, prev.y));
  }, [winW, winH, insets.top, insets.bottom, insets.left, insets.right, loaded]);

  const panResponder = useRef(
    PanResponder.create({
      // Task #4080: true per catturare subito il gesto; tap/long-press
      // vengono distinti in onPanResponderRelease tramite distanza e tempo.
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        dragStartRef.current = { x: posRef.current.x, y: posRef.current.y };
        didDragRef.current = false;
        pressStartRef.current = Date.now();
        scale.value = withSpring(0.92);
      },
      onPanResponderMove: (_e: GestureResponderEvent, g: PanResponderGestureState) => {
        const start = dragStartRef.current;
        if (!start) return;
        // Attiva il drag solo dopo aver superato la soglia
        if (Math.abs(g.dx) > DRAG_THRESHOLD || Math.abs(g.dy) > DRAG_THRESHOLD) {
          didDragRef.current = true;
        }
        if (didDragRef.current) {
          const next = clampRef.current(start.x + g.dx, start.y + g.dy);
          setPos(next);
        }
      },
      onPanResponderRelease: (_e: GestureResponderEvent, _g: PanResponderGestureState) => {
        scale.value = withSpring(1);
        dragStartRef.current = null;
        if (didDragRef.current) {
          // Era un drag: salva posizione
          const final = posRef.current;
          AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(final)).catch(() => { /* skip */ });
        } else {
          // Era un tap o long-press: distingui per durata
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
        }
        didDragRef.current = false;
      },
      onPanResponderTerminate: () => {
        scale.value = withSpring(1);
        dragStartRef.current = null;
        didDragRef.current = false;
      },
    }),
  ).current;

  return (
    <>
      <Animated.View
        pointerEvents="box-none"
        style={[styles.wrap, { left: pos.x, top: pos.y }, animStyle]}
        {...panResponder.panHandlers}
        accessibilityRole="button"
        accessibilityLabel="AI Console"
        testID="ai-console-fab"
      >
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
      </Animated.View>
      <FabDrawer visible={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "absolute", zIndex: 999, width: FAB_SIZE, height: FAB_SIZE },
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
