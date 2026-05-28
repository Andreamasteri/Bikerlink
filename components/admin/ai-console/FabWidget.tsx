// Task #2641 — FAB flottante AI Console: tap=drawer, long-press=console intera.
// Haptics conditional; reanimated per fade/scale.
import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from "react-native-reanimated";
import { useColors } from "@/hooks/useColors";
import { useAiActionQueue } from "@/hooks/admin/ai-console/useAiActionQueue";
import { useAiAlertsState, useAiAlertsSubscriber } from "@/hooks/admin/ai-console/useAiAlerts";
import { useExplainPending } from "@/hooks/admin/ai-console/useAiExplain";
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

export default function FabWidget() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [drawerOpen, setDrawerOpen] = useState(false);
  useAiAlertsSubscriber({ enabled: true });
  const alerts = useAiAlertsState();
  const explain = useExplainPending();
  const { data: queue } = useAiActionQueue();

  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const total = (queue?.items?.length ?? 0) + alerts.unread;
  const hasExplain = !!explain;

  const bottomInset = Math.max(insets.bottom, Platform.OS === "web" ? 34 : 12);

  return (
    <>
      <Animated.View
        pointerEvents="box-none"
        style={[styles.wrap, { bottom: bottomInset + 16, right: 16 }, animStyle]}
      >
        <Pressable
          // Task #2645 — quando c'è un explain pendente, il tap apre direttamente
          // la Console (che consumerà il pending e auto-invierà il seed). Altrimenti
          // tap = drawer rapido, long-press = console intera (comportamento storico).
          onPress={() => {
            triggerHaptic("light");
            if (hasExplain) {
              router.push("/admin/ai-console" as never);
            } else {
              setDrawerOpen(true);
            }
          }}
          onLongPress={() => {
            triggerHaptic("medium");
            router.push("/admin/ai-console" as never);
          }}
          onPressIn={() => { scale.value = withSpring(0.92); }}
          onPressOut={() => { scale.value = withSpring(1); }}
          accessibilityRole="button"
          accessibilityLabel="AI Console"
          testID="ai-console-fab"
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
        </Pressable>
      </Animated.View>
      <FabDrawer visible={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "absolute", zIndex: 999 },
  btn: {
    width: 56, height: 56, borderRadius: 28,
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
});
