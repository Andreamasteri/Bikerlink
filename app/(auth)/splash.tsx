import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ImageBackground,
  Dimensions,
  Platform,
  Animated,
  Easing,
} from "react-native";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Colors from "@/constants/colors";
import { t } from "@/lib/i18n";
import { getApiUrl } from "@/lib/query-client";

const { width, height } = Dimensions.get("window");
const AnimatedImageBackground = Animated.createAnimatedComponent(ImageBackground);

const SPLASH_INDEX_KEY = "splash_cycle_index";

async function pickSplashMessage(): Promise<string | null> {
  try {
    const baseUrl = getApiUrl();
    const url = new URL("/api/settings/splash", baseUrl);
    const res = await fetch(url.toString(), { credentials: "include" });
    if (!res.ok) return null;
    const data = await res.json();
    const mode: string = data.mode || "single";
    if (mode === "cycle") {
      const list: string[] = Array.isArray(data.list) ? data.list.filter((m: string) => m && m.trim()) : [];
      if (list.length === 0) return data.message || null;
      const raw = await AsyncStorage.getItem(SPLASH_INDEX_KEY);
      const currentIndex = parseInt(raw || "0", 10);
      const idx = isNaN(currentIndex) ? 0 : currentIndex % list.length;
      await AsyncStorage.setItem(SPLASH_INDEX_KEY, String((idx + 1) % list.length));
      return list[idx];
    } else {
      return data.message || null;
    }
  } catch {
    return null;
  }
}

export default function SplashAnimatedScreen() {
  const router = useRouter();
  const [splashMessage, setSplashMessage] = useState<string | null>(null);

  const bgOpacity = useRef(new Animated.Value(0)).current;
  const overlayOpacity = useRef(new Animated.Value(1)).current;
  const titleTranslateY = useRef(new Animated.Value(30)).current;
  const titleOpacity = useRef(new Animated.Value(0)).current;
  const titleScale = useRef(new Animated.Value(0.8)).current;
  const taglineOpacity = useRef(new Animated.Value(0)).current;
  const taglineTranslateY = useRef(new Animated.Value(20)).current;
  const glowOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    pickSplashMessage().then(msg => setSplashMessage(msg));

    Animated.parallel([
      Animated.timing(bgOpacity, {
        toValue: 1,
        duration: 1200,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(overlayOpacity, {
        toValue: 0.55,
        duration: 1400,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.sequence([
        Animated.delay(400),
        Animated.parallel([
          Animated.timing(titleOpacity, {
            toValue: 1,
            duration: 800,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(titleTranslateY, {
            toValue: 0,
            duration: 900,
            easing: Easing.out(Easing.back(1.2)),
            useNativeDriver: true,
          }),
          Animated.timing(titleScale, {
            toValue: 1,
            duration: 900,
            easing: Easing.out(Easing.back(1.1)),
            useNativeDriver: true,
          }),
        ]),
      ]),
      Animated.sequence([
        Animated.delay(1000),
        Animated.parallel([
          Animated.timing(taglineOpacity, {
            toValue: 1,
            duration: 700,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(taglineTranslateY, {
            toValue: 0,
            duration: 700,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
        ]),
      ]),
      Animated.sequence([
        Animated.delay(1200),
        Animated.sequence([
          Animated.timing(glowOpacity, {
            toValue: 0.6,
            duration: 800,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(glowOpacity, {
            toValue: 0.3,
            duration: 800,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(glowOpacity, {
            toValue: 0.5,
            duration: 800,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
        ]),
      ]),
    ]).start();

    const timeout = setTimeout(() => {
      router.replace("/(auth)/login");
    }, 3000);

    return () => clearTimeout(timeout);
  }, []);

  const displayMessage = splashMessage || t("app.tagline");

  return (
    <View style={styles.container}>
      <AnimatedImageBackground
        source={require("@/assets/images/splash-bg.jpg")}
        style={[styles.background, { opacity: bgOpacity }]}
        resizeMode="cover"
      >
        <Animated.View style={[styles.overlay, { opacity: overlayOpacity }]} />

        <View style={styles.content}>
          <Animated.View style={[styles.glowContainer, { opacity: glowOpacity }]}>
            <View style={styles.glowCircle} />
          </Animated.View>

          <Animated.View
            style={{
              opacity: titleOpacity,
              transform: [
                { translateY: titleTranslateY },
                { scale: titleScale },
              ],
            }}
          >
            <Text style={styles.title}>{t("app.name")}</Text>
          </Animated.View>

          <Animated.View
            style={{
              opacity: taglineOpacity,
              transform: [{ translateY: taglineTranslateY }],
            }}
          >
            <Text style={styles.tagline}>{displayMessage}</Text>
          </Animated.View>

          <Animated.View
            style={[
              styles.lineAccent,
              {
                opacity: taglineOpacity,
                transform: [{ translateY: taglineTranslateY }],
              },
            ]}
          />
        </View>
      </AnimatedImageBackground>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  background: {
    flex: 1,
    width: "100%",
    height: "100%",
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.background,
  },
  content: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 40,
  },
  glowContainer: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
  },
  glowCircle: {
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: Colors.accent,
    opacity: 0.15,
  },
  title: {
    fontSize: 48,
    fontWeight: "bold" as const,
    color: Colors.accent,
    letterSpacing: 4,
    textAlign: "center",
    textShadowColor: "rgba(212, 160, 23, 0.5)",
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 20,
  },
  tagline: {
    fontSize: 18,
    fontWeight: "700" as const,
    fontStyle: "italic" as const,
    color: Colors.text,
    marginTop: 16,
    letterSpacing: 1.5,
    textAlign: "center",
    textShadowColor: "rgba(0, 0, 0, 0.8)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  lineAccent: {
    width: 60,
    height: 3,
    backgroundColor: Colors.accent,
    borderRadius: 2,
    marginTop: 20,
    opacity: 0.7,
  },
});
