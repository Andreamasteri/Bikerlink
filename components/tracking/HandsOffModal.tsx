import React from "react";
import { View, Text, Modal, Animated, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SpeedUnit } from "@/lib/units-context";
import { convertSpeed, speedUnitLabel } from "./tracking-utils";

interface HandsOffModalProps {
  handsOffActive: boolean;
  handsOffAnim: Animated.Value;
  currentSpeed: number;
  speedUnit: SpeedUnit;
  handsOffSpeedStr: string;
}

export function HandsOffModal({
  handsOffActive,
  handsOffAnim,
  currentSpeed,
  speedUnit,
  handsOffSpeedStr,
}: HandsOffModalProps) {
  return (
    <Modal
      visible={handsOffActive}
      transparent
      statusBarTranslucent
      animationType="fade"
    >
      <View style={styles.handsOffBg} pointerEvents="box-only">
        <Animated.View style={[styles.handsOffContent, { opacity: handsOffAnim }]}>
          <Ionicons name="hand-left" size={72} color="#ef4444" />
          <Text style={styles.handsOffTitle}>⚠ ATTENZIONE!</Text>
          <Text style={styles.handsOffMsg}>VELOCITÀ HANDS OFF RAGGIUNTA!</Text>
        </Animated.View>
        <View style={styles.handsOffInfo}>
          <Text style={styles.handsOffSpeed}>{convertSpeed(currentSpeed, speedUnit).toFixed(0)}</Text>
          <Text style={styles.handsOffUnit}>{speedUnitLabel(speedUnit)}</Text>
          <Text style={styles.handsOffSub}>
            Tocchi bloccati sopra {convertSpeed(parseFloat(handsOffSpeedStr || "50") || 50, speedUnit).toFixed(0)} {speedUnitLabel(speedUnit)}
          </Text>
          <Text style={styles.handsOffSub}>
            Si riattivano quando rallenti
          </Text>
          <Text style={styles.handsOffHint}>
            Abbassa 5 volte velocemente il volume per disattivare
          </Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  handsOffBg: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.92)",
    alignItems: "center",
    justifyContent: "center",
    padding: 30,
  },
  handsOffContent: {
    alignItems: "center",
  },
  handsOffTitle: {
    color: "#ef4444",
    fontSize: 32,
    fontFamily: "Inter_700Bold",
    marginTop: 20,
    textAlign: "center",
  },
  handsOffMsg: {
    color: "#ffffff",
    fontSize: 18,
    fontFamily: "Inter_600SemiBold",
    marginTop: 10,
    textAlign: "center",
    letterSpacing: 1,
  },
  handsOffInfo: {
    marginTop: 60,
    alignItems: "center",
  },
  handsOffSpeed: {
    color: "#ffffff",
    fontSize: 80,
    fontFamily: "Inter_700Bold",
  },
  handsOffUnit: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 24,
    fontFamily: "Inter_600SemiBold",
    marginTop: -10,
  },
  handsOffSub: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    marginTop: 20,
    textAlign: "center",
  },
  handsOffHint: {
    color: "#FFD700",
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    marginTop: 40,
    textAlign: "center",
    fontStyle: "italic",
    opacity: 0.8,
  },
});
