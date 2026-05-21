import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { usePlayer } from "@/lib/player-context";

export function SleepTimerButton() {
  const { sleepTimer, sleepTimerEnd, setSleepTimer } = usePlayer();
  const OPTIONS = [null, 15, 30, 60] as const;

  const minutesLeft = sleepTimerEnd
    ? Math.max(0, Math.ceil((sleepTimerEnd - Date.now()) / 60000))
    : null;

  const cycleTimer = () => {
    const idx = OPTIONS.indexOf(sleepTimer as (typeof OPTIONS)[number]);
    const next = OPTIONS[(idx + 1) % OPTIONS.length];
    setSleepTimer(next);
  };

  return (
    <TouchableOpacity style={styles.iconBtn} onPress={cycleTimer}>
      <Ionicons
        name="moon"
        size={20}
        color={sleepTimerEnd ? Colors.accent : Colors.textSecondary}
      />
      {minutesLeft !== null && (
        <Text style={styles.sleepLabel}>{minutesLeft}m</Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  iconBtn: {
    padding: 8,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 36,
  },
  sleepLabel: {
    fontSize: 9,
    color: Colors.accent,
    fontFamily: "Inter_600SemiBold",
    marginTop: 2,
  },
});
