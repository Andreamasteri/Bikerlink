import React from "react";
import { View, Text, StyleSheet } from "react-native";
import Colors from "@/constants/colors";

interface RawRowProps {
  label: string;
  value: string;
  isLast?: boolean;
}

function RawRow({ label, value, isLast }: RawRowProps) {
  return (
    <View style={[styles.rawRow, !isLast && styles.rawRowBorder]}>
      <Text style={styles.rawLabel}>{label}</Text>
      <Text style={styles.rawValue}>{value}</Text>
    </View>
  );
}

interface SensorDataCardProps {
  isRunning: boolean;
  rawRows: { label: string; value: string }[];
}

export function SensorDataCard({ isRunning, rawRows }: SensorDataCardProps) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Valori Grezzi DeviceMotion</Text>
      {!isRunning && (
        <Text style={styles.rawHint}>
          Attiva almeno una metrica qui sotto per avviare il flusso dati
        </Text>
      )}
      <View style={styles.rawPanel}>
        {rawRows.map((row, i) => (
          <RawRow
            key={row.label}
            label={row.label}
            value={row.value}
            isLast={i === rawRows.length - 1}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: 10,
  },
  sectionTitle: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
    color: Colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  rawHint: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    fontStyle: "italic",
  },
  rawPanel: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: "hidden",
  },
  rawRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  rawRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  rawLabel: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
  },
  rawValue: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
    minWidth: 90,
    textAlign: "right",
  },
});
