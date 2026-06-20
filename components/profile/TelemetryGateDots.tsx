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
    if (gate === 1) {
      if (toggle) {
        Alert.alert(
          "Telemetria sempre attiva ✓",
          "Il toggle è attivo: l'app raccoglie automaticamente i dati quando riconosce che sei in moto. Tutto ok."
        );
      } else {
        Alert.alert(
          "Telemetria sempre attiva",
          "Stato: spento. Attiva 'Telemetria sempre attiva' per abilitare la raccolta automatica senza avviare il tracking a mano."
        );
      }
    } else if (gate === 2) {
      if (calibrated) {
        Alert.alert(
          "Supporto calibrato ✓",
          "La calibrazione del supporto è completata: il rilevamento automatico può riconoscere che il telefono è montato sulla moto. Tutto ok."
        );
      } else {
        Alert.alert(
          "Supporto calibrato",
          "Stato: da calibrare. Esegui la calibrazione supporto così il rilevamento automatico può riconoscere che il telefono è montato sulla moto.",
          [
            { text: "Annulla", style: "cancel" },
            { text: "Calibra ora", onPress: onCalibratePress },
          ]
        );
      }
    } else {
      if (riding) {
        Alert.alert(
          "Moto rilevata ✓",
          "L'app ha riconosciuto che sei in moto: la raccolta automatica della telemetria è in corso. Tutto ok."
        );
      } else {
        Alert.alert(
          "Moto rilevata",
          "Stato: non rilevata. Monta il telefono e supera i 20 km/h per almeno 3 secondi, oppure attiva la modalità rilassata ('Non uso un supporto fisso') per ignorare il check orientamento."
        );
      }
    }
  };

  return (
    <View style={styles.row}>
      <TouchableOpacity onPress={() => handleDotPress(1)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
        <View style={[styles.dot, { backgroundColor: dot1Color }]} />
      </TouchableOpacity>
      <TouchableOpacity onPress={() => handleDotPress(2)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
        <View style={[styles.dot, { backgroundColor: dot2Color }]} />
      </TouchableOpacity>
      <TouchableOpacity onPress={() => handleDotPress(3)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
        <View style={[styles.dot, { backgroundColor: dot3Color }]} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
});
