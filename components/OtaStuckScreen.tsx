// Task #1587 — OTA Stuck Recovery: full-screen non-dismissible reinstall prompt.
//
// Shown when isOtaStuck() is true (≥3 rollbacks or ≥3 stale sessions).
// Admin/tester escape hatch: long-press (3s) on the version label calls
// clearOtaStuckState() and reloads the app without reinstalling.

import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Linking,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/lib/theme-context";
import { clearOtaStuckState, getOtaStuckCounters } from "@/lib/ota-stuck";
import * as Updates from "expo-updates";
import { reloadAppAsync } from "expo";
import { getStableDeviceId } from "@/lib/device-id";
import { apiRequest } from "@/lib/query-client";

import otaUpdates from "@/ota-updates.json";

const PRODUCTION_FALLBACK_URL =
  "https://" + (process.env.EXPO_PUBLIC_DOMAIN ?? "biker-link.replit.app");

function getApkUrl(): string {
  if (Array.isArray(otaUpdates) && otaUpdates.length > 0) {
    const last = otaUpdates[otaUpdates.length - 1] as { apkUrl?: string | null };
    if (last.apkUrl && typeof last.apkUrl === "string") {
      return last.apkUrl;
    }
  }
  return PRODUCTION_FALLBACK_URL;
}

const LONG_PRESS_DURATION_MS = 3000;

interface OtaStuckScreenProps {
  onCleared: () => void;
}

export default function OtaStuckScreen({ onCleared }: OtaStuckScreenProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pressing, setPressing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [deviceId, counters] = await Promise.all([
          getStableDeviceId(),
          getOtaStuckCounters(),
        ]);
        if (cancelled) return;
        await apiRequest("POST", "/api/ota/stuck-event", {
          deviceId,
          rollbackCount: counters.rollbackCount,
          stuckSessions: counters.stuckSessions,
          runtimeVersion: Updates.runtimeVersion ?? null,
        });
      } catch {
        // fire-and-forget: telemetry errors must not affect the UX
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const apkUrl = getApkUrl();
  const versionLabel =
    Updates.runtimeVersion
      ? `rv${Updates.runtimeVersion}`
      : "BikerLink";

  function handleReinstall() {
    Linking.openURL(apkUrl).catch(() => {});
  }

  function handleLongPressIn() {
    setPressing(true);
    longPressTimer.current = setTimeout(async () => {
      setPressing(false);
      await clearOtaStuckState();
      try {
        await reloadAppAsync();
      } catch {
        onCleared();
      }
    }, LONG_PRESS_DURATION_MS);
  }

  function handleLongPressOut() {
    setPressing(false);
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.background,
          paddingTop: insets.top + (Platform.OS === "web" ? 67 : 0),
          paddingBottom: insets.bottom + (Platform.OS === "web" ? 34 : 0),
        },
      ]}
    >
      <View style={styles.content}>
        <View style={[styles.iconCircle, { backgroundColor: colors.surfaceLight }]}>
          <Ionicons name="build-outline" size={48} color={colors.warning} />
        </View>

        <Text style={[styles.title, { color: colors.text }]}>
          Aggiornamento bloccato
        </Text>

        <Text style={[styles.body, { color: colors.textSecondary }]}>
          L&apos;app non riesce ad installarsi automaticamente. Reinstalla
          BikerLink per ricevere l&apos;ultima versione e tornare online.
        </Text>

        <TouchableOpacity
          style={[styles.primaryBtn, { backgroundColor: colors.accent }]}
          onPress={handleReinstall}
          activeOpacity={0.8}
          testID="ota-stuck-reinstall-btn"
        >
          <Ionicons name="download-outline" size={20} color="#FFFFFF" style={styles.btnIcon} />
          <Text style={styles.primaryBtnText}>Reinstalla BikerLink</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPressIn={handleLongPressIn}
          onPressOut={handleLongPressOut}
          activeOpacity={0.6}
          testID="ota-stuck-version-label"
        >
          <Text
            style={[
              styles.versionLabel,
              { color: pressing ? colors.textSecondary : colors.border },
            ]}
          >
            {pressing ? "Rilascia per annullare…" : versionLabel}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    width: "100%",
    maxWidth: 360,
    alignItems: "center",
    paddingHorizontal: 32,
  },
  iconCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 28,
  },
  title: {
    fontSize: 24,
    fontWeight: "700" as const,
    textAlign: "center",
    marginBottom: 16,
  },
  body: {
    fontSize: 15,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 36,
  },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 28,
    marginBottom: 32,
  },
  btnIcon: {
    marginRight: 8,
  },
  primaryBtnText: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "600" as const,
  },
  versionLabel: {
    fontSize: 12,
    textAlign: "center",
  },
});
