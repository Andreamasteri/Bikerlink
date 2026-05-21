import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, Switch } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

const styles = StyleSheet.create({
  accordionPanel: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    marginBottom: 12,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  accordionPanelHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 14,
    backgroundColor: "rgba(0,0,0,0.02)",
  },
  accordionPanelTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
    color: Colors.text,
  },
  accordionPanelContent: {
    padding: 14,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  synecoHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  synecoInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  synecoLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: Colors.text,
  },
  synecoDesc: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
    lineHeight: 16,
  },
});

interface MusicSystemSectionProps {
  expanded: boolean;
  onToggle: () => void;
  exportEnabled: boolean;
  onExportToggle: (val: boolean) => void;
  exportPending: boolean;
  importEnabled: boolean;
  onImportToggle: (val: boolean) => void;
  importPending: boolean;
}

export function MusicSystemSection({
  expanded,
  onToggle,
  exportEnabled,
  onExportToggle,
  exportPending,
  importEnabled,
  onImportToggle,
  importPending,
}: MusicSystemSectionProps) {
  return (
    <View style={styles.accordionPanel}>
      <TouchableOpacity style={styles.accordionPanelHeader} onPress={onToggle}>
        <View style={styles.synecoInfo}>
          <Ionicons name="musical-notes" size={20} color="#1DB954" />
          <Text style={styles.accordionPanelTitle}>Music System</Text>
        </View>
        <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={18} color={Colors.textSecondary} />
      </TouchableOpacity>
      {expanded && (
        <View style={styles.accordionPanelContent}>
          <View style={styles.synecoHeader}>
            <View style={styles.synecoInfo}>
              <Ionicons name="share-outline" size={20} color="#1DB954" />
              <Text style={styles.synecoLabel}>Consenti export playlist</Text>
            </View>
            <Switch
              value={exportEnabled}
              onValueChange={onExportToggle}
              trackColor={{ false: Colors.border, true: "#1DB954" }}
              thumbColor={exportEnabled ? Colors.text : Colors.textSecondary}
              disabled={exportPending}
            />
          </View>
          <Text style={styles.synecoDesc}>
            {exportEnabled ? "Gli utenti possono esportare la propria playlist" : "Export playlist disabilitato"}
          </Text>
          <View style={[styles.synecoHeader, { marginTop: 12 }]}>
            <View style={styles.synecoInfo}>
              <Ionicons name="download-outline" size={20} color="#1DB954" />
              <Text style={styles.synecoLabel}>Consenti import playlist</Text>
            </View>
            <Switch
              value={importEnabled}
              onValueChange={onImportToggle}
              trackColor={{ false: Colors.border, true: "#1DB954" }}
              thumbColor={importEnabled ? Colors.text : Colors.textSecondary}
              disabled={importPending}
            />
          </View>
          <Text style={styles.synecoDesc}>
            {importEnabled ? "Gli utenti possono importare playlist" : "Import playlist disabilitato"}
          </Text>
        </View>
      )}
    </View>
  );
}
