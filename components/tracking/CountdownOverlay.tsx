import React from "react";
import { View, Text, Animated, TouchableOpacity, StyleSheet } from "react-native";

interface CountdownOverlayProps {
  countdownValue: number;
  countdownColor: string;
  countdownFontSize: number;
  countdownAnim: Animated.Value;
  is0100Enabled: boolean;
  discardSprintAttempt: () => void;
}

export function CountdownOverlay({
  countdownValue,
  countdownColor,
  countdownFontSize,
  countdownAnim,
  is0100Enabled,
  discardSprintAttempt,
}: CountdownOverlayProps) {
  return (
    <View style={styles.countdownContainer}>
      <Animated.Text
        style={[
          styles.countdownNumber,
          {
            color: countdownColor,
            fontSize: countdownFontSize,
            transform: [{ scale: countdownAnim }],
          },
        ]}
      >
        {countdownValue === 0 ? "GO!" : countdownValue.toString()}
      </Animated.Text>
      {countdownValue > 0 && (
        <Text style={styles.countdownSub}>Preparati...</Text>
      )}
      {is0100Enabled && (
        <TouchableOpacity
          style={styles.countdownCancelBtn}
          onPress={discardSprintAttempt}
          activeOpacity={0.8}
        >
          <Text style={styles.countdownCancelText}>Annulla</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  countdownContainer: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(0,0,0,0.85)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
  },
  countdownNumber: {
    fontFamily: "Inter_700Bold",
    textAlign: "center",
  },
  countdownSub: {
    color: "#ffffff",
    fontSize: 20,
    fontFamily: "Inter_600SemiBold",
    marginTop: 20,
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  countdownCancelBtn: {
    marginTop: 60,
    paddingVertical: 12,
    paddingHorizontal: 30,
    borderRadius: 25,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
  },
  countdownCancelText: {
    color: "#ffffff",
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
});
