import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

interface RouteWaypointsInputProps {
  waypoints: any[];
  t: (key: string) => string;
  handleImportGpx: () => void;
  isImporting: boolean;
  openMapForNewWaypoint: () => void;
  getWaypointMeta: (type: string) => any;
  moveWaypoint: (index: number, direction: "up" | "down") => void;
  removeWaypoint: (index: number) => void;
}

export const RouteWaypointsInput: React.FC<RouteWaypointsInputProps> = ({
  waypoints,
  t,
  handleImportGpx,
  isImporting,
  openMapForNewWaypoint,
  getWaypointMeta,
  moveWaypoint,
  removeWaypoint,
}) => {
  return (
    <>
      <View style={styles.waypointHeader}>
        <Text style={styles.sectionTitle}>Tappe ({waypoints.length})</Text>
        <View style={styles.waypointHeaderBtns}>
          <TouchableOpacity
            style={[styles.addBtn, styles.importBtn]}
            onPress={handleImportGpx}
            disabled={isImporting}
          >
            {isImporting ? (
              <ActivityIndicator size="small" color="#FF6600" />
            ) : (
              <>
                <Ionicons name="cloud-upload-outline" size={18} color="#FF6600" />
                <Text style={styles.importBtnText}>Importa GPX</Text>
              </>
            )}
          </TouchableOpacity>
          <TouchableOpacity style={styles.addBtn} onPress={openMapForNewWaypoint}>
            <Ionicons name="add" size={20} color="#fff" />
            <Text style={styles.addBtnText}>Aggiungi</Text>
          </TouchableOpacity>
        </View>
      </View>

      {waypoints.length === 0 && (
        <View style={styles.emptyState}>
          <Ionicons name="navigate-outline" size={36} color={Colors.textSecondary} />
          <Text style={styles.emptyText}>
            {t("routes.noStops")}
          </Text>
        </View>
      )}

      {waypoints.map((wp, index) => {
        const meta = getWaypointMeta(wp.waypointType);
        return (
          <View key={wp.localId} style={styles.waypointCard}>
            <View style={styles.waypointCardLeft}>
              <View style={[styles.waypointIconWrap, { backgroundColor: meta.color + "22" }]}>
                <MaterialCommunityIcons name={meta.icon} size={18} color={meta.color} />
              </View>
              <View style={styles.waypointInfo}>
                <Text style={styles.waypointName} numberOfLines={1}>{wp.name}</Text>
                <Text style={styles.waypointMeta}>
                  {meta.label} - {wp.latitude.toFixed(4)}, {wp.longitude.toFixed(4)}
                </Text>
                {wp.description ? (
                  <Text style={styles.waypointDescText} numberOfLines={1}>{wp.description}</Text>
                ) : null}
              </View>
            </View>
            <View style={styles.waypointActions}>
              <TouchableOpacity
                onPress={() => moveWaypoint(index, "up")}
                disabled={index === 0}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons
                  name="chevron-up"
                  size={20}
                  color={index === 0 ? Colors.border : Colors.textSecondary}
                />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => moveWaypoint(index, "down")}
                disabled={index === waypoints.length - 1}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons
                  name="chevron-down"
                  size={20}
                  color={index === waypoints.length - 1 ? Colors.border : Colors.textSecondary}
                />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => removeWaypoint(index)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="trash-outline" size={18} color={Colors.error} />
              </TouchableOpacity>
            </View>
          </View>
        );
      })}

      {waypoints.length > 0 && waypoints.length < 2 && (
        <Text style={styles.hint}>Aggiungi almeno 2 tappe per salvare il percorso.</Text>
      )}
    </>
  );
};

const styles = StyleSheet.create({
  waypointHeader: {
    flexDirection: "row" as const,
    justifyContent: "space-between" as const,
    alignItems: "center" as const,
    marginBottom: 12,
  },
  sectionTitle: { fontSize: 17, fontWeight: "700" as const, color: Colors.text },
  addBtn: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    backgroundColor: Colors.accent,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    gap: 4,
  },
  addBtnText: { color: "#fff", fontSize: 14, fontWeight: "600" as const },
  waypointHeaderBtns: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
  },
  importBtn: {
    backgroundColor: "transparent",
    borderWidth: 1.5,
    borderColor: "#FF6600",
  },
  importBtnText: { color: "#FF6600", fontSize: 14, fontWeight: "600" as const },
  emptyState: {
    alignItems: "center" as const,
    padding: 32,
    gap: 12,
  },
  emptyText: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: "center" as const,
    lineHeight: 22,
  },
  waypointCard: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  waypointCardLeft: { flex: 1, flexDirection: "row" as const, alignItems: "center" as const, gap: 10 },
  waypointIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center" as const,
    alignItems: "center" as const,
  },
  waypointInfo: { flex: 1 },
  waypointName: { fontSize: 15, fontWeight: "600" as const, color: Colors.text },
  waypointMeta: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  waypointDescText: { fontSize: 12, color: Colors.textSecondary, marginTop: 1, fontStyle: "italic" as const },
  waypointActions: {
    flexDirection: "column" as const,
    alignItems: "center" as const,
    gap: 4,
    marginLeft: 8,
  },
  hint: {
    fontSize: 13,
    color: Colors.warning,
    textAlign: "center" as const,
    marginTop: 8,
  },
});
