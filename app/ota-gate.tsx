import React, { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, ActivityIndicator, Animated, Platform } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import Colors from "@/constants/colors";
import { Ionicons } from "@expo/vector-icons";

export default function OtaGateScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [done, setDone] = useState(false);
  const dotAnim = useRef(new Animated.Value(0)).current;

  const { data: waitData } = useQuery<{ seconds: number }>({
    queryKey: ["/api/settings/ota-wait-seconds"],
  });

  const { data: gateData, refetch: refetchGate } = useQuery<{ enabled: boolean }>({
    queryKey: ["/api/settings/ota-gate-enabled"],
    refetchInterval: 3000,
  });

  useEffect(() => {
    if (waitData?.seconds !== undefined && secondsLeft === null) {
      setSecondsLeft(waitData.seconds);
    }
  }, [waitData?.seconds]);

  useEffect(() => {
    if (secondsLeft === null || secondsLeft <= 0) return;
    const timer = setTimeout(() => setSecondsLeft((s) => (s !== null ? s - 1 : 0)), 1000);
    return () => clearTimeout(timer);
  }, [secondsLeft]);

  useEffect(() => {
    if (secondsLeft !== null && secondsLeft <= 0 && !done) {
      setDone(true);
    }
  }, [secondsLeft]);

  useEffect(() => {
    if (!done) return;
    if (gateData?.enabled === false) {
      router.replace("/(tabs)");
    }
  }, [done, gateData?.enabled]);

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
    <View style={[styles.container, { paddingTop: topPad, paddingBottom: botPad }]}>
      <Animated.View style={[styles.iconWrap, { opacity: dotAnim.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }]}>
        <Ionicons name="cloud-download-outline" size={64} color={Colors.accent} />
      </Animated.View>
      <Text style={styles.title}>Aggiornamento in corso</Text>
      <Text style={styles.subtitle}>
        {done
          ? "In attesa che l'aggiornamento sia pronto..."
          : secondsLeft !== null
          ? `Attendere ${secondsLeft}s...`
          : "Caricamento..."}
      </Text>
      <ActivityIndicator size="large" color={Colors.accent} style={{ marginTop: 24 }} />
      {done && (
        <Text style={styles.hint}>L'app si aggiornerà automaticamente</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
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
    color: Colors.text,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 16,
    color: Colors.textSecondary,
    textAlign: "center",
  },
  hint: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 16,
    textAlign: "center",
  },
});
