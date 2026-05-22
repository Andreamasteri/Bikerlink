import React, { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, ActivityIndicator, Animated } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { useColors } from "@/hooks/useColors";
import { Ionicons } from "@expo/vector-icons";
import { subscribeOtaResult } from "@/lib/ota-check";
import { t } from "@/lib/i18n";
import { sendStartupBeacon } from "@/lib/startup-beacon";

const SAFETY_TIMEOUT_MS = 15_000;

export default function OtaGateScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const navigated = useRef(false);
  const dotAnim = useRef(new Animated.Value(0)).current;
  const [status, setStatus] = useState<string>(t("ota.checkingUpdates"));

  const { data: gateData, error: gateError } = useQuery<{ enabled: boolean }>({
    queryKey: ["/api/settings/ota-gate-enabled"],
    refetchInterval: 3000,
    retry: 1,
  });

  const navigate = (reason: string) => {
    if (navigated.current) return;
    navigated.current = true;
    sendStartupBeacon("ota_gate_navigate", { reason });
    router.replace("/(tabs)");
  };

  useEffect(() => {
    sendStartupBeacon("ota_gate_mount");
  }, []);

  useEffect(() => {
    if (gateData !== undefined) {
      sendStartupBeacon("ota_gate_gate_data", { enabled: gateData?.enabled ?? null, hasError: !!gateError });
    }
    if (gateData?.enabled === false || !!gateError) {
      navigate("gate_disabled_or_error");
    }
  }, [gateData?.enabled, gateError]);

  useEffect(() => {
    // In DEV mode o su web non ci sono OTA reali: triggerOtaCheck ritorna
    // immediatamente con phase "skipped" e l'emit avviene tipicamente prima
    // che questa schermata sia montata. Per non far attendere l'utente i
    // 15s del safety timeout, navighiamo subito.
    if (__DEV__) {
      navigate("dev_mode");
      return;
    }

    const safetyTimer = setTimeout(() => {
      setStatus("Timeout — continuando...");
      sendStartupBeacon("ota_gate_timeout");
      navigate("safety_timeout");
    }, SAFETY_TIMEOUT_MS);

    const unsub = subscribeOtaResult((result) => {
      clearTimeout(safetyTimer);
      sendStartupBeacon("ota_gate_ota_result", { phase: result.phase });
      if (result.phase === "reload") {
        setStatus(t("ota.updating"));
        // fallback: reloadAsync non ritorna normalmente, ma se lo facesse navighiamo dopo 3s
        setTimeout(() => navigate("reload_fallback"), 3_000);
      } else {
        navigate("ota_result");
      }
    });

    return () => {
      clearTimeout(safetyTimer);
      unsub();
    };
  }, []);

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(dotAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
        Animated.timing(dotAnim, { toValue: 0, duration: 600, useNativeDriver: true }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, []);

  const topPad = insets.top;
  const botPad = insets.bottom;

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: topPad, paddingBottom: botPad }]}>
      <Animated.View style={[styles.iconWrap, { opacity: dotAnim.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }]}>
        <Ionicons name="cloud-download-outline" size={64} color={colors.accent} />
      </Animated.View>
      <Text style={[styles.title, { color: colors.text }]}>{status}</Text>
      <ActivityIndicator size="large" color={colors.accent} style={{ marginTop: 24 }} />
      <Text style={[styles.hint, { color: colors.textSecondary }]}>
        {t("ota.autoUpdate")}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  iconWrap: {
    marginBottom: 8,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    textAlign: "center",
  },
  hint: {
    fontSize: 13,
    marginTop: 16,
    textAlign: "center",
  },
});
