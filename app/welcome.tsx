import React, { useEffect, useRef } from "react";
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

const loginBg = require("@/assets/images/splash-bg.jpg");

export default function WelcomeScreen() {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuth();
  const synecoVisible = useSynecoVisible();
  const insets = useSafeAreaInsets();

  const titleOpacity = useRef(new Animated.Value(0)).current;
  const taglineOpacity = useRef(new Animated.Value(0)).current;
  const buttonsTranslateY = useRef(new Animated.Value(100)).current;
  const buttonsOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.replace("/(tabs)");
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
            U'll never ride alone
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
    color: Colors.accent,
    textAlign: "center",
    textShadowColor: "rgba(0,0,0,0.8)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  tagline: {
    fontSize: 18,
    fontFamily: "Inter_600SemiBold",
    fontStyle: "italic",
    color: Colors.text,
    marginTop: 8,
    textAlign: "center",
    textShadowColor: "rgba(0,0,0,0.8)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
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
});
