import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  StyleSheet,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { onlineManager } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { retryConnection } from "@/lib/online-focus-manager";

// ──────────────────────────────────────────────────────────────────────
// Dedicated offline banner with manual retry (Task #4596)
//
// When `onlineManager` reports offline, React Query pauses every fetch and the
// data on screen silently goes stale. This banner makes that state explicit and
// gives the user a "Riprova" affordance that forces a fresh connectivity probe
// (NetInfo) + a targeted refetch of the keys that must be fresh on reconnect
// (profile, online/biker/zavorrine counts & lists) — without waiting for the
// OS to emit the next connectivity event.
//
// Non-intrusive: a slim top banner, dismissible while still offline. Dismissing
// only hides it for the current offline episode — it re-appears on the next
// online→offline transition. Degrades cleanly on web (NetInfo + onlineManager
// both work; retry falls back to optimistic-online if the probe is unavailable).
// ──────────────────────────────────────────────────────────────────────

function useOnline(): boolean {
  const [online, setOnline] = useState(onlineManager.isOnline());
  useEffect(() => {
    const unsub = onlineManager.subscribe(() => setOnline(onlineManager.isOnline()));
    return unsub;
  }, []);
  return online;
}

export function OfflineBanner() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const online = useOnline();

  const [dismissed, setDismissed] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Reset the per-episode dismissal whenever the connection comes back, so the
  // banner is allowed to surface again on the next offline transition.
  useEffect(() => {
    if (online) setDismissed(false);
  }, [online]);

  const onRetry = async () => {
    if (retrying) return;
    setRetrying(true);
    try {
      await retryConnection();
    } finally {
      if (mounted.current) setRetrying(false);
    }
  };

  if (online || dismissed) return null;

  const topInset = Platform.OS === "web" ? Math.max(insets.top, 67) : insets.top;

  return (
    <View style={[styles.wrap, { top: topInset }]} pointerEvents="box-none">
      <View style={[styles.banner, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Ionicons name="cloud-offline-outline" size={18} color={colors.textSecondary as string} />
        <Text style={[styles.label, { color: colors.text as string }]} numberOfLines={1}>
          Nessuna connessione
        </Text>

        <Pressable
          testID="offline-retry"
          accessibilityRole="button"
          accessibilityLabel="Riprova la connessione"
          onPress={onRetry}
          disabled={retrying}
          hitSlop={8}
          style={({ pressed }) => [
            styles.retryBtn,
            { backgroundColor: colors.accent as string, opacity: pressed || retrying ? 0.7 : 1 },
          ]}
        >
          {retrying ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={styles.retryText}>Riprova</Text>
          )}
        </Pressable>

        <Pressable
          testID="offline-dismiss"
          accessibilityRole="button"
          accessibilityLabel="Nascondi avviso offline"
          onPress={() => setDismissed(true)}
          hitSlop={8}
          style={styles.dismissBtn}
        >
          <Ionicons name="close" size={18} color={colors.textSecondary as string} />
        </Pressable>
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
    paddingHorizontal: 12,
    zIndex: 9999,
  },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingLeft: 14,
    paddingRight: 8,
    paddingVertical: 8,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
    maxWidth: 520,
    width: "100%",
  },
  label: {
    flex: 1,
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
  },
  retryBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 10,
    minWidth: 78,
    alignItems: "center",
    justifyContent: "center",
  },
  retryText: {
    color: "#FFFFFF",
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
  },
  dismissBtn: {
    padding: 6,
  },
});
