import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ImageBackground,
  Platform,
  Animated,
  Easing,
  Pressable,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { useLanguage, useT } from "@/lib/language-context";
import { type AppLanguage } from "@/lib/i18n";
import { pickSplashMessage } from "@/lib/splash-utils";

const AnimatedImageBackground = Animated.createAnimatedComponent(ImageBackground);

const LANGUAGES: { code: AppLanguage; flag: string; label: string }[] = [
  { code: "it", flag: "🇮🇹", label: "Italiano" },
  { code: "en", flag: "🇬🇧", label: "English" },
  { code: "de", flag: "🇩🇪", label: "Deutsch" },
  { code: "es", flag: "🇪🇸", label: "Español" },
  { code: "fr", flag: "🇫🇷", label: "Français" },
  { code: "el", flag: "🇬🇷", label: "Ελληνικά" },
  { code: "tr", flag: "🇹🇷", label: "Türkçe" },
];

export default function SplashAnimatedScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { language, setLanguage } = useLanguage();
  const t = useT();
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
    const MESSAGE_TIMEOUT = 1500;

    const startTaglineAnimation = () => {
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
      ]).start();
    };

    const messagePromise = pickSplashMessage();
    const timeoutPromise = new Promise<null>(resolve =>
      setTimeout(() => resolve(null), MESSAGE_TIMEOUT)
    );

    Promise.race([messagePromise, timeoutPromise]).then(msg => {
      setSplashMessage(msg);
      startTaglineAnimation();
    });

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const displayMessage = splashMessage || t("app.tagline");

  const bottomInset = insets.bottom;

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

        <View style={[styles.langBar, { paddingBottom: bottomInset + 16 }]}>
          {LANGUAGES.map((lang) => {
            const isActive = language === lang.code;
            return (
              <Pressable
                key={lang.code}
                style={[styles.langBtn, isActive && styles.langBtnActive]}
                onPress={() => setLanguage(lang.code)}
                accessibilityLabel={lang.label}
              >
                <Text style={styles.langFlag}>{lang.flag}</Text>
                <Text style={[styles.langLabel, isActive && styles.langLabelActive]}>{lang.label}</Text>
              </Pressable>
            );
          })}
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
    ...StyleSheet.absoluteFill,
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
    ...Platform.select({
      ios: { textShadowColor: "rgba(212, 160, 23, 0.5)", textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 20 },
      android: { textShadowColor: "rgba(212, 160, 23, 0.5)", textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 20 },
      web: { textShadow: "0px 0px 20px rgba(212, 160, 23, 0.5)" },
    }),
  },
  tagline: {
    fontSize: 18,
    fontWeight: "700" as const,
    fontStyle: "italic" as const,
    color: Colors.text,
    marginTop: 16,
    letterSpacing: 1.5,
    textAlign: "center",
    ...Platform.select({
      ios: { textShadowColor: "rgba(0, 0, 0, 0.8)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 6 },
      android: { textShadowColor: "rgba(0, 0, 0, 0.8)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 6 },
      web: { textShadow: "0px 1px 6px rgba(0, 0, 0, 0.8)" },
    }),
  },
  lineAccent: {
    width: 60,
    height: 3,
    backgroundColor: Colors.accent,
    borderRadius: 2,
    marginTop: 20,
    opacity: 0.7,
  },
  langBar: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
    paddingHorizontal: 16,
  },
  langBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.35)",
    borderWidth: 1.5,
    borderColor: "transparent",
  },
  langBtnActive: {
    backgroundColor: "rgba(0,0,0,0.55)",
    borderColor: Colors.accent,
  },
  langFlag: {
    fontSize: 18,
  },
  langLabel: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    color: "rgba(255,255,255,0.75)",
  },
  langLabelActive: {
    color: Colors.accent,
    fontFamily: "Inter_600SemiBold",
  },
});
