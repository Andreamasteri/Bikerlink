import React, { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, ActivityIndicator, Animated, Platform } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { useColors } from "@/hooks/useColors";
import { Ionicons } from "@expo/vector-icons";

const DEFAULT_WAIT_SECONDS = 10;

export default function OtaGateScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const [secondsLeft, setSecondsLeft] = useState<number>(DEFAULT_WAIT_SECONDS);
  const navigated = useRef(false);
  const dotAnim = useRef(new Animated.Value(0)).current;

  const { data: waitData } = useQuery<{ seconds: number }>({
    queryKey: ["/api/settings/ota-wait-seconds"],
  });

  const { data: gateData, error: gateError } = useQuery<{ enabled: boolean }>({
    queryKey: ["/api/settings/ota-gate-enabled"],
    refetchInterval: 3000,
    retry: 1,
  });

  useEffect(() => {
    if (waitData?.seconds !== undefined) {
      setSecondsLeft(Math.max(0, waitData.seconds));
    }
  }, [waitData?.seconds]);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const timer = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [secondsLeft]);

  useEffect(() => {
    if (navigated.current) return;
    const countdownDone = secondsLeft <= 0;
    const adminDisabled = gateData?.enabled === false;
    const endpointUnavailable = !!gateError;
    if (countdownDone || adminDisabled || endpointUnavailable) {
      navigated.current = true;
      router.replace("/(tabs)");
    }
  }, [secondsLeft, gateData?.enabled, gateError]);

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
      <Text style={[styles.title, { color: colors.text }]}>Controllo aggiornamenti...</Text>
      <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
        {secondsLeft > 0 ? `Attendere ${secondsLeft}s` : "Applicazione aggiornamento..."}
      </Text>
      <ActivityIndicator size="large" color={colors.accent} style={{ marginTop: 24 }} />
      <Text style={[styles.hint, { color: colors.textSecondary }]}>
        L'app si aggiornerà automaticamente
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
  subtitle: {
    fontSize: 16,
    textAlign: "center",
  },
  hint: {
    fontSize: 13,
    marginTop: 16,
    textAlign: "center",
  },
});
