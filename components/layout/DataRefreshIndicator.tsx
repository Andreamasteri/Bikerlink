import React, { useEffect, useRef, useState } from "react";
import { View, Text, ActivityIndicator, StyleSheet, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useIsFetching, onlineManager } from "@tanstack/react-query";
import { useColors } from "@/hooks/useColors";

// ──────────────────────────────────────────────────────────────────────
// Global "data updating" indicator (Task #4585)
//
// A lightweight, non-invasive pill shown when the app is refreshing data after
// a resume/reconnect on poor network — driven by React Query's `isFetching`
// counter plus the online state from `onlineManager`. With good network normal
// fetches resolve quickly and the pill never appears (a small show-delay filters
// them out); on degraded network the in-flight fetches linger and the pill
// surfaces, then disappears once data is fresh. A short hide-linger avoids
// flicker between back-to-back refetches.
// ──────────────────────────────────────────────────────────────────────

const SHOW_DELAY_MS = 700;
const HIDE_LINGER_MS = 400;

function useOnline(): boolean {
  const [online, setOnline] = useState(onlineManager.isOnline());
  useEffect(() => {
    const unsub = onlineManager.subscribe(() => setOnline(onlineManager.isOnline()));
    return unsub;
  }, []);
  return online;
}

export function DataRefreshIndicator() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const isFetching = useIsFetching();
  const online = useOnline();

  const [visible, setVisible] = useState(false);
  const showTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Show while offline (queries are paused, data may be stale) OR while a fetch
  // has been in flight long enough to indicate a slow network.
  const shouldShow = !online || isFetching > 0;

  useEffect(() => {
    if (shouldShow) {
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
      if (!visible && !showTimerRef.current) {
        // Offline is shown immediately; a slow fetch waits out the show-delay so
        // fast/normal fetches on good network never flash the indicator.
        const delay = !online ? 0 : SHOW_DELAY_MS;
        showTimerRef.current = setTimeout(() => {
          showTimerRef.current = null;
          setVisible(true);
        }, delay);
      }
    } else {
      if (showTimerRef.current) {
        clearTimeout(showTimerRef.current);
        showTimerRef.current = null;
      }
      if (visible && !hideTimerRef.current) {
        hideTimerRef.current = setTimeout(() => {
          hideTimerRef.current = null;
          setVisible(false);
        }, HIDE_LINGER_MS);
      }
    }
  }, [shouldShow, online, visible]);

  useEffect(() => {
    return () => {
      if (showTimerRef.current) clearTimeout(showTimerRef.current);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, []);

  if (!visible) return null;

  const topInset =
    Platform.OS === "web" ? Math.max(insets.top, 67) : insets.top;
  const label = !online ? "Offline — in attesa di rete" : "Aggiornamento dati…";

  return (
    <View pointerEvents="none" style={[styles.wrap, { top: topInset + 6 }]}>
      <View style={[styles.pill, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        {online ? (
          <ActivityIndicator size="small" color={colors.accent as string} />
        ) : (
          <View style={[styles.dot, { backgroundColor: colors.textSecondary as string }]} />
        )}
        <Text style={[styles.label, { color: colors.text as string }]} numberOfLines={1}>
          {label}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 9998,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  label: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
  },
});
