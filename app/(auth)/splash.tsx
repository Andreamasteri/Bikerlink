import React, { useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ImageBackground,
  Dimensions,
  Platform,
} from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  withSequence,
  Easing,
  interpolate,
} from "react-native-reanimated";
import { useRouter } from "expo-router";
import Colors from "@/constants/colors";
import { t } from "@/lib/i18n";

const { width, height } = Dimensions.get("window");
const AnimatedImageBackground = Animated.createAnimatedComponent(ImageBackground);

export default function SplashAnimatedScreen() {
  const router = useRouter();

  const bgOpacity = useSharedValue(0);
  const overlayOpacity = useSharedValue(1);
  const titleTranslateY = useSharedValue(30);
  const titleOpacity = useSharedValue(0);
  const titleScale = useSharedValue(0.8);
  const taglineOpacity = useSharedValue(0);
  const taglineTranslateY = useSharedValue(20);
  const glowOpacity = useSharedValue(0);

  useEffect(() => {
    bgOpacity.value = withTiming(1, { duration: 1200, easing: Easing.out(Easing.cubic) });
    overlayOpacity.value = withTiming(0.55, { duration: 1400, easing: Easing.out(Easing.cubic) });

    titleOpacity.value = withDelay(400, withTiming(1, { duration: 800, easing: Easing.out(Easing.cubic) }));
    titleTranslateY.value = withDelay(400, withTiming(0, { duration: 900, easing: Easing.out(Easing.back(1.2)) }));
    titleScale.value = withDelay(400, withTiming(1, { duration: 900, easing: Easing.out(Easing.back(1.1)) }));

    taglineOpacity.value = withDelay(1000, withTiming(1, { duration: 700, easing: Easing.out(Easing.cubic) }));
    taglineTranslateY.value = withDelay(1000, withTiming(0, { duration: 700, easing: Easing.out(Easing.cubic) }));

    glowOpacity.value = withDelay(1200, withSequence(
      withTiming(0.6, { duration: 800, easing: Easing.inOut(Easing.sin) }),
      withTiming(0.3, { duration: 800, easing: Easing.inOut(Easing.sin) }),
      withTiming(0.5, { duration: 800, easing: Easing.inOut(Easing.sin) })
    ));

    const timeout = setTimeout(() => {
      router.replace("/(auth)/login");
    }, 3000);

    return () => clearTimeout(timeout);
  }, []);

  const bgAnimatedStyle = useAnimatedStyle(() => ({
    opacity: bgOpacity.value,
  }));

  const overlayAnimatedStyle = useAnimatedStyle(() => ({
    opacity: overlayOpacity.value,
  }));

  const titleAnimatedStyle = useAnimatedStyle(() => ({
    opacity: titleOpacity.value,
    transform: [
      { translateY: titleTranslateY.value },
      { scale: titleScale.value },
    ],
  }));

  const taglineAnimatedStyle = useAnimatedStyle(() => ({
    opacity: taglineOpacity.value,
    transform: [{ translateY: taglineTranslateY.value }],
  }));

  const glowAnimatedStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
  }));

  return (
    <View style={styles.container}>
      <AnimatedImageBackground
        source={require("@/assets/images/splash-bg.jpg")}
        style={[styles.background, bgAnimatedStyle]}
        resizeMode="cover"
      >
        <Animated.View style={[styles.overlay, overlayAnimatedStyle]} />

        <View style={styles.content}>
          <Animated.View style={[styles.glowContainer, glowAnimatedStyle]}>
            <View style={styles.glowCircle} />
          </Animated.View>

          <Animated.View style={titleAnimatedStyle}>
            <Text style={styles.title}>{t("app.name")}</Text>
          </Animated.View>

          <Animated.View style={taglineAnimatedStyle}>
            <Text style={styles.tagline}>{t("app.tagline")}</Text>
          </Animated.View>

          <Animated.View style={[styles.lineAccent, taglineAnimatedStyle]} />
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
