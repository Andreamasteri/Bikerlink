import React, { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Switch, Modal } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { useT } from "@/lib/language-context";

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
  dropdownButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 4,
  },
  dropdownButtonText: {
    fontFamily: "Inter_500Medium",
    fontSize: 14,
    color: Colors.text,
  },
  dropdownOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  dropdownMenu: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    width: "100%",
    maxWidth: 300,
    paddingVertical: 8,
    elevation: 5,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  dropdownMenuItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  dropdownMenuItemActive: {
    backgroundColor: Colors.accent + "10",
  },
  dropdownMenuItemText: {
    fontFamily: "Inter_500Medium",
    fontSize: 14,
    color: Colors.text,
  },
});

interface MapStyleSectionProps {
  expanded: boolean;
  onToggle: () => void;
  mapsEnabled: boolean;
  onMapsEnabledToggle: (val: boolean) => void;
  mapsEnabledPending: boolean;
  mapsProvider: "esri_gray" | "carto_light" | "carto_dark";
  onMapsProviderChange: (val: "esri_gray" | "carto_light" | "carto_dark") => void;
  mapsProviderPending: boolean;
}

export function MapStyleSection({
  expanded,
  onToggle,
  mapsEnabled,
  onMapsEnabledToggle,
  mapsEnabledPending,
  mapsProvider,
  onMapsProviderChange,
  mapsProviderPending,
}: MapStyleSectionProps) {
  const t = useT();
  const [showProviderDropdown, setShowProviderDropdown] = useState(false);

  const providerLabels: Record<string, string> = {
    esri_gray: "Base Map",
    carto_light: "Mappa Dettagliata Light & Dark",
    carto_dark: "FullMap",
  };

  return (
    <View style={styles.accordionPanel}>
      <TouchableOpacity style={styles.accordionPanelHeader} onPress={onToggle}>
        <View style={styles.synecoInfo}>
          <Ionicons name="map" size={20} color={Colors.accent} />
          <Text style={styles.accordionPanelTitle}>Stile Mappa</Text>
        </View>
        <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={18} color={Colors.textSecondary} />
      </TouchableOpacity>
      {expanded && (
        <View style={styles.accordionPanelContent}>
          <View style={styles.synecoHeader}>
            <View style={styles.synecoInfo}>
              <Ionicons name="map-outline" size={20} color={Colors.accent} />
              <Text style={styles.synecoLabel}>Sistema Mappe</Text>
            </View>
            <Switch
              value={mapsEnabled}
              onValueChange={onMapsEnabledToggle}
              trackColor={{ false: Colors.border, true: Colors.accent }}
              thumbColor={mapsEnabled ? Colors.text : Colors.textSecondary}
              disabled={mapsEnabledPending}
            />
          </View>
          <Text style={styles.synecoDesc}>
            {mapsEnabled ? t("admin.tileMapActive") : t("admin.tileMapInactive")}
          </Text>
          {mapsEnabled && (
            <View style={{ marginTop: 12 }}>
              <Text style={[styles.synecoDesc, { marginBottom: 6 }]}>Provider tile default (globale):</Text>
              <TouchableOpacity
                style={styles.dropdownButton}
                onPress={() => setShowProviderDropdown(true)}
                disabled={mapsProviderPending}
                activeOpacity={0.7}
              >
                <Text style={styles.dropdownButtonText}>
                  {providerLabels[mapsProvider] ?? mapsProvider}
                </Text>
                <Ionicons name="chevron-down" size={16} color={Colors.textSecondary} />
              </TouchableOpacity>
              <Modal
                visible={showProviderDropdown}
                transparent
                animationType="fade"
                onRequestClose={() => setShowProviderDropdown(false)}
              >
                <TouchableOpacity
                  style={styles.dropdownOverlay}
                  activeOpacity={1}
                  onPress={() => setShowProviderDropdown(false)}
                >
                  <View style={styles.dropdownMenu}>
                    {(["esri_gray", "carto_light", "carto_dark"] as const).map((p) => (
                      <TouchableOpacity
                        key={p}
                        style={[
                          styles.dropdownMenuItem,
                          mapsProvider === p && styles.dropdownMenuItemActive,
                        ]}
                        onPress={() => {
                          setShowProviderDropdown(false);
                          onMapsProviderChange(p);
                        }}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.dropdownMenuItemText, mapsProvider === p && { color: Colors.accent }]}>
                          {providerLabels[p]}
                        </Text>
                        {mapsProvider === p && (
                          <Ionicons name="checkmark" size={16} color={Colors.accent} />
                        )}
                      </TouchableOpacity>
                    ))}
                  </View>
                </TouchableOpacity>
              </Modal>
            </View>
          )}
        </View>
      )}
    </View>
  );
}
