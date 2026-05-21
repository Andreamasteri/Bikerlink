import React from "react";
import { View, Text, StyleSheet } from "react-native";
import Colors from "@/constants/colors";

interface SchemaCheck {
  status: string;
  message: string;
  previousSnapshotAt?: string;
  diff?: {
    addedTables: string[];
    removedTables: string[];
    modifiedTables: string[];
  } | null;
}

interface Props {
  schema: SchemaCheck;
  formatDate: (iso: string) => string;
}

export const SchemaSection = ({ schema, formatDate }: Props) => {
  return (
    <>
      <Text style={styles.infoText}>{schema.message}</Text>
      {schema.previousSnapshotAt && (
        <Text style={styles.infoMuted}>Snapshot precedente: {formatDate(schema.previousSnapshotAt)}</Text>
      )}
      {schema.diff && (
        <View style={styles.diffBox}>
          {schema.diff.addedTables.length > 0 && (
            <View style={styles.diffRow}>
              <Text style={[styles.diffLabel, { color: Colors.success }]}>+ Aggiunte</Text>
              <Text style={styles.diffValue}>{schema.diff.addedTables.join(", ")}</Text>
            </View>
          )}
          {schema.diff.removedTables.length > 0 && (
            <View style={styles.diffRow}>
              <Text style={[styles.diffLabel, { color: Colors.error }]}>− Rimosse</Text>
              <Text style={styles.diffValue}>{schema.diff.removedTables.join(", ")}</Text>
            </View>
          )}
          {schema.diff.modifiedTables.length > 0 && (
            <View style={styles.diffRow}>
              <Text style={[styles.diffLabel, { color: Colors.warning }]}>~ Modificate</Text>
              <Text style={styles.diffValue}>{schema.diff.modifiedTables.join(", ")}</Text>
            </View>
          )}
        </View>
      )}
    </>
  );
};

const styles = StyleSheet.create({
  infoText: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.text,
  },
  infoMuted: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
  },
  diffBox: {
    backgroundColor: Colors.background,
    borderRadius: 10,
    padding: 10,
    gap: 6,
    marginTop: 4,
  },
  diffRow: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },
  diffLabel: {
    fontFamily: "Inter_700Bold",
    fontSize: 12,
    minWidth: 70,
  },
  diffValue: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.text,
    flex: 1,
  },
});
