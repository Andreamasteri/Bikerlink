import React, { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, ActivityIndicator, Animated, Platform } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { useColors } from "@/hooks/useColors";
import { Ionicons } from "@expo/vector-icons";
import { subscribeOtaResult } from "@/lib/ota-check";
import { t } from "@/lib/i18n";

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

  const navigate = () => {
    if (navigated.current) return;
    navigated.current = true;
    router.replace("/(tabs)");
  };

  useEffect(() => {
    if (gateData?.enabled === false || !!gateError) {
      navigate();
    }
  }, [gateData?.enabled, gateError]);

  useEffect(() => {
    // In DEV mode o su web non ci sono OTA reali: triggerOtaCheck ritorna
    // immediatamente con phase "skipped" e l'emit avviene tipicamente prima
    // che questa schermata sia montata. Per non far attendere l'utente i
    // 15s del safety timeout, navighiamo subito.
    if (__DEV__ || Platform.OS === "web") {
      navigate();
      return;
    }

    const safetyTimer = setTimeout(() => {
      setStatus("Timeout — continuando...");
      navigate();
    }, SAFETY_TIMEOUT_MS);

    const unsub = subscribeOtaResult((result) => {
      clearTimeout(safetyTimer);
      if (result.phase === "reload") {
        setStatus(t("ota.updating"));
        // fallback: reloadAsync non ritorna normalmente, ma se lo facesse navighiamo dopo 3s
        setTimeout(() => navigate(), 3_000);
      } else {
        navigate();
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

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const botPad = Platform.OS === "web" ? 34 : insets.bottom;

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
