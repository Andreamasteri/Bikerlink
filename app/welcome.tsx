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
  Linking,
  ActivityIndicator,
} from "react-native";
import { useRouter, type Href } from "expo-router";
import { useAuth } from "@/lib/auth-context";
import { getApiUrl } from "@/lib/query-client";
import { useSynecoVisible } from "@/lib/syneco-context";
import Colors from "@/constants/colors";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { pickSplashMessage } from "@/lib/splash-utils";
import { useLanguage } from "@/lib/language-context";
import { t, type AppLanguage } from "@/lib/i18n";

const LANGUAGES: { code: AppLanguage; flag: string; label: string }[] = [
  { code: "it", flag: "🇮🇹", label: "Italiano" },
  { code: "en", flag: "🇬🇧", label: "English" },
  { code: "de", flag: "🇩🇪", label: "Deutsch" },
  { code: "es", flag: "🇪🇸", label: "Español" },
  { code: "fr", flag: "🇫🇷", label: "Français" },
  { code: "el", flag: "🇬🇷", label: "Ελληνικά" },
  { code: "tr", flag: "🇹🇷", label: "Türkçe" },
];

const loginBg = require("@/assets/images/splash-bg.jpg");

export default function WelcomeScreen() {
  const router = useRouter();
  const { isAuthenticated, isLoading, sessionExpired, isReconnecting } = useAuth();
  const synecoVisible = useSynecoVisible();
  const insets = useSafeAreaInsets();
  const [dynamicTagline, setDynamicTagline] = useState<string | null>(null);
  const { language, setLanguage } = useLanguage();

  const titleOpacity = useRef(new Animated.Value(0)).current;
  const taglineOpacity = useRef(new Animated.Value(0)).current;
  const buttonsTranslateY = useRef(new Animated.Value(100)).current;
  const buttonsOpacity = useRef(new Animated.Value(0)).current;

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
      router.replace("/(tabs)" as Href);
      return;
    }

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, isAuthenticated]);

  const handlePrivacyPress = async () => {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const ctrl = new AbortController();
      timeout = setTimeout(() => ctrl.abort(), 3000);
      const res = await fetch(new URL("/api/privacy-policy/exists", getApiUrl()).toString(), { signal: ctrl.signal });
      if (res.ok) {
        const data = await res.json();
        if (data?.exists) {
          const pdfUrl = new URL("/api/privacy-policy/download", getApiUrl()).toString();
          Linking.openURL(pdfUrl);
          return;
        }
      }
    } catch {
      // no-op: privacy policy loading best-effort
    } finally {
      if (timeout !== undefined) clearTimeout(timeout);
    }
    router.push("/privacy-policy");
  };

  if (isLoading) {
    return (
      <View style={[styles.container, styles.loadingContainer, { paddingTop: insets.top }]}>
        <StatusBar barStyle="light-content" />
        {isReconnecting && (
          <View style={styles.reconnectBox}>
            <ActivityIndicator size="small" color={Colors.accent} style={{ marginBottom: 8 }} />
            <Text style={styles.reconnectText}>Connessione in corso...</Text>
          </View>
        )}
      </View>
    );
  }

  return (
    <ImageBackground source={loginBg} style={styles.container} resizeMode="cover">
      <StatusBar barStyle="light-content" />
      <View style={[styles.overlay, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        {sessionExpired && (
          <View style={styles.sessionExpiredBanner}>
            <Text style={styles.sessionExpiredText}>
              Sessione scaduta — accedi di nuovo
            </Text>
          </View>
        )}
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
            <Text style={styles.loginText}>{t("auth.login")}</Text>
          </Pressable>
          <Pressable
            style={styles.registerButton}
            onPress={() => router.push("/(auth)/register")}
          >
            <Text style={styles.registerText}>{t("auth.register")}</Text>
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

          <View style={styles.legalLinks}>
            <Pressable onPress={handlePrivacyPress}>
              <Text style={styles.privacyLink}>{t("welcome.privacyLink")}</Text>
            </Pressable>
            <Text style={styles.legalSeparator}> · </Text>
            <Pressable onPress={() => Linking.openURL(new URL("/terms", getApiUrl()).toString())}>
              <Text style={styles.privacyLink}>{t("welcome.tosLink")}</Text>
            </Pressable>
          </View>
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
    fontSize: 23,
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
  legalLinks: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    marginTop: 12,
    flexWrap: "wrap" as const,
  },
  legalSeparator: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  privacyLink: {
    fontSize: 12,
    color: Colors.textSecondary,
    textAlign: "center" as const,
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
  loadingContainer: {
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: Colors.background,
  },
  reconnectBox: {
    alignItems: "center",
    paddingHorizontal: 24,
  },
  reconnectText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.7)",
    textAlign: "center",
  },
  sessionExpiredBanner: {
    width: "100%",
    backgroundColor: "rgba(255, 160, 0, 0.85)",
    paddingVertical: 10,
    paddingHorizontal: 20,
    alignItems: "center",
  },
  sessionExpiredText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: "#1a1a1a",
    textAlign: "center",
  },
});
