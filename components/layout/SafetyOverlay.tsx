import React from "react";
import { View, Text, StyleSheet, Animated } from "react-native";

interface OverlayProps {
  title: string;
  message: string;
  icon?: string;
  subMessage?: string;
  threshold?: number;
  blinkAnim?: Animated.Value;
  type: "sprint" | "handsoff";
}

export function SafetyOverlay({
  title,
  message,
  icon,
  subMessage,
  threshold,
  blinkAnim,
  type,
}: OverlayProps) {
  if (type === "sprint") {
    return (
      <View style={sprintStyles.overlay} pointerEvents="box-only">
        <Text style={sprintStyles.icon}>{icon}</Text>
        <Text style={sprintStyles.title}>{title}</Text>
        <Text style={sprintStyles.msg}>{message}</Text>
      </View>
    );
  }

  return (
    <View style={handsOffStyles.overlay} pointerEvents="box-only">
      <Animated.View style={{ opacity: blinkAnim, alignItems: "center" }}>
        <Text style={handsOffStyles.title}>{title}</Text>
        <Text style={handsOffStyles.msg}>
          SOPRA {threshold} km/h — {message}
        </Text>
        <Text style={handsOffStyles.sub}>{subMessage}</Text>
      </Animated.View>
    </View>
  );
}

const sprintStyles = StyleSheet.create({
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.55)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 9998,
  },
  icon: {
    fontSize: 48,
    marginBottom: 12,
  },
  title: {
    fontFamily: "Inter_700Bold",
    fontSize: 22,
    color: "#facc15",
    textAlign: "center",
    marginBottom: 8,
  },
  msg: {
    fontFamily: "Inter_400Regular",
    fontSize: 15,
    color: "#ffffff",
    textAlign: "center",
  },
});

const handsOffStyles = StyleSheet.create({
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(220, 38, 38, 0.18)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 9999,
  },
  title: {
    fontFamily: "Inter_700Bold",
    fontSize: 30,
    color: "#ef4444",
    textAlign: "center",
    marginBottom: 8,
  },
  msg: {
    fontFamily: "Inter_700Bold",
    fontSize: 20,
    color: "#ef4444",
    textAlign: "center",
    marginBottom: 12,
  },
  sub: {
    fontFamily: "Inter_400Regular",
    fontSize: 15,
    color: "#ef4444",
    textAlign: "center",
  },
});
