import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Pressable,
  Platform,
  ImageBackground,
  StatusBar,
} from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "@/lib/auth-context";
import { useSynecoVisible } from "@/lib/syneco-context";
import Colors from "@/constants/colors";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { pickSplashMessage } from "@/lib/splash-utils";
import { useLanguage } from "@/lib/language-context";
import { type AppLanguage } from "@/lib/i18n";

const LANGUAGES: { code: AppLanguage; flag: string; label: string }[] = [
  { code: "it", flag: "🇮🇹", label: "Italiano" },
  { code: "en", flag: "🇬🇧", label: "English" },
  { code: "de", flag: "🇩🇪", label: "Deutsch" },
  { code: "es", flag: "🇪🇸", label: "Español" },
  { code: "fr", flag: "🇫🇷", label: "Français" },
];

const loginBg = require("@/assets/images/splash-bg.jpg");

export default function WelcomeScreen() {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuth();
  const synecoVisible = useSynecoVisible();
  const insets = useSafeAreaInsets();
  const [dynamicTagline, setDynamicTagline] = useState<string | null>(null);
  const { language, setLanguage } = useLanguage();

  const isWeb = Platform.OS === "web";
  const titleOpacity = useRef(new Animated.Value(isWeb ? 1 : 0)).current;
  const taglineOpacity = useRef(new Animated.Value(isWeb ? 1 : 0)).current;
  const buttonsTranslateY = useRef(new Animated.Value(isWeb ? 0 : 100)).current;
  const buttonsOpacity = useRef(new Animated.Value(isWeb ? 1 : 0)).current;

  useEffect(() => {
    if (isLoading || isAuthenticated) return;
    let cancelled = false;
    pickSplashMessage().then((msg) => {
      if (!cancelled && msg) setDynamicTagline(msg);
    });
    return () => { cancelled = true; };
  }, [isLoading, isAuthenticated]);

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.replace("/(tabs)");
      return;
    }

    if (isWeb) return;

    Animated.sequence([
      Animated.timing(titleOpacity, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
      Animated.timing(taglineOpacity, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
      Animated.delay(400),
      Animated.parallel([
        Animated.timing(buttonsTranslateY, {
          toValue: 0,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.timing(buttonsOpacity, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  }, [isLoading, isAuthenticated]);

  if (isLoading) {
    return (
      <View style={[styles.container, { paddingTop: Platform.OS === "web" ? 67 : insets.top }]}>
        <StatusBar barStyle="light-content" />
      </View>
    );
  }

  return (
    <ImageBackground source={loginBg} style={styles.container} resizeMode="cover">
      <StatusBar barStyle="light-content" />
      <View style={[styles.overlay, { paddingTop: Platform.OS === "web" ? 67 : insets.top, paddingBottom: Platform.OS === "web" ? 34 : insets.bottom }]}>
        <View style={styles.content}>
          <Animated.Text style={[styles.title, { opacity: titleOpacity }]}>
            BikerLink
          </Animated.Text>
          <Animated.Text style={[styles.tagline, { opacity: taglineOpacity }]}>
            {dynamicTagline ?? "U'll never ride alone"}
          </Animated.Text>
        </View>

        <Animated.View
          style={[
            styles.buttons,
            {
              opacity: buttonsOpacity,
              transform: [{ translateY: buttonsTranslateY }],
            },
          ]}
        >
          <Pressable
            style={styles.loginButton}
            onPress={() => router.push("/(auth)/login")}
          >
            <Text style={styles.loginText}>Accedi</Text>
          </Pressable>
          <Pressable
            style={styles.registerButton}
            onPress={() => router.push("/(auth)/register")}
          >
            <Text style={styles.registerText}>Registrati</Text>
          </Pressable>
          {synecoVisible && (
            <Text style={styles.sponsorText}>powered by Syneco Lubrificanti</Text>
          )}

          <View style={styles.langBar}>
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

          <Pressable onPress={() => router.push("/privacy-policy")}>
            <Text style={styles.privacyLink}>Privacy Policy</Text>
          </Pressable>
        </Animated.View>
      </View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(13, 13, 13, 0.6)",
    justifyContent: "center",
    alignItems: "center",
  },
  content: {
    flex: 1,
    justifyContent: "flex-start",
    alignItems: "center",
    paddingTop: 5,
  },
  title: {
    fontSize: 48,
    fontFamily: "Inter_700Bold",
    fontStyle: "italic",
    color: Colors.accent,
    textAlign: "center",
    transform: [{ rotate: "-5deg" }],
    ...Platform.select({
      ios: { textShadowColor: "rgba(0,0,0,0.8)", textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 8 },
      android: { textShadowColor: "rgba(0,0,0,0.8)", textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 8 },
      web: { textShadow: "0px 2px 8px rgba(0,0,0,0.8)" },
    }),
  },
  tagline: {
    fontSize: 18,
    fontFamily: "Inter_600SemiBold",
    fontStyle: "italic",
    color: Colors.text,
    marginTop: 8,
    textAlign: "center",
    ...Platform.select({
      ios: { textShadowColor: "rgba(0,0,0,0.8)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 },
      android: { textShadowColor: "rgba(0,0,0,0.8)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 },
      web: { textShadow: "0px 1px 4px rgba(0,0,0,0.8)" },
    }),
  },
  buttons: {
    width: "100%",
    paddingHorizontal: 32,
    paddingBottom: 24,
  },
  loginButton: {
    backgroundColor: Colors.accent,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
    marginBottom: 12,
  },
  loginText: {
    fontSize: 18,
    fontFamily: "Inter_600SemiBold",
    color: Colors.background,
  },
  registerButton: {
    backgroundColor: "rgba(0,0,0,0.5)",
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
    borderWidth: 2,
    borderColor: Colors.accent,
  },
  registerText: {
    fontSize: 18,
    fontFamily: "Inter_600SemiBold",
    color: Colors.accent,
  },
  sponsorText: {
    marginTop: 20,
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    textAlign: "center",
  },
  privacyLink: {
    marginTop: 12,
    fontSize: 12,
    color: Colors.textSecondary,
    textAlign: "center",
    textDecorationLine: "underline" as const,
  },
  langBar: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
    paddingHorizontal: 16,
    marginTop: 20,
    marginBottom: 4,
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
