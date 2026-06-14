import React from "react";
import { View, TouchableOpacity, Alert, StyleSheet } from "react-native";
import Colors from "@/constants/colors";

export function GateDots({
  toggle,
  calibrated,
  riding,
  onCalibratePress,
}: {
  toggle: boolean;
  calibrated: boolean;
  riding: boolean;
  onCalibratePress: () => void;
}) {
  const dot1Color = toggle ? "#27ae60" : Colors.textSecondary;
  const dot2Color = calibrated ? "#27ae60" : "#e67e22";
  const dot3Color = riding ? "#27ae60" : "#e74c3c";

  const handleDotPress = (gate: 1 | 2 | 3) => {
    if (gate === 1 && toggle) return;
    if (gate === 2 && calibrated) return;
    if (gate === 3 && riding) return;
    if (gate === 1) {
      Alert.alert("Toggle spento", "Attiva 'Telemetria sempre attiva' per abilitare la raccolta automatica.");
    } else if (gate === 2) {
      Alert.alert(
        "Non calibrato",
        "Esegui la calibrazione supporto per permettere al rilevamento automatico di riconoscere che il telefono è montato sulla moto.",
        [
          { text: "Annulla", style: "cancel" },
          { text: "Calibra ora", onPress: onCalibratePress },
        ]
      );
    } else {
      Alert.alert(
        "Moto non rilevata",
        "Monta il telefono e supera i 20 km/h per almeno 3 secondi, oppure attiva la modalità rilassata ('Non uso un supporto fisso') per ignorare il check orientamento."
      );
    }
  };

  return (
    <View style={styles.row}>
      <TouchableOpacity onPress={() => handleDotPress(1)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <View style={[styles.dot, { backgroundColor: dot1Color }]} />
      </TouchableOpacity>
      <TouchableOpacity onPress={() => handleDotPress(2)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <View style={[styles.dot, { backgroundColor: dot2Color }]} />
      </TouchableOpacity>
      <TouchableOpacity onPress={() => handleDotPress(3)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <View style={[styles.dot, { backgroundColor: dot3Color }]} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});
