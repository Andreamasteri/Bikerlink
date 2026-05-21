import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

interface GroupHeaderProps {
  baseName: string;
  count: number;
  allActive: boolean;
  someActive: boolean;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onEdit: () => void;
  onToggleStatus: () => void;
}

export function AdGroupHeader({
  baseName,
  count,
  allActive,
  someActive,
  isCollapsed,
  onToggleCollapse,
  onEdit,
  onToggleStatus,
}: GroupHeaderProps) {
  const dotColor = allActive ? Colors.success : someActive ? Colors.warning : Colors.error;
  const statusLabel = allActive ? "Attivo" : someActive ? "Parziale" : "In pausa";

  return (
    <View style={styles.groupSectionHeader}>
      <TouchableOpacity style={styles.groupSectionLeft} onPress={onToggleCollapse} activeOpacity={0.7}>
        <MaterialIcons
          name={isCollapsed ? "chevron-right" : "expand-more"}
          size={20}
          color={Colors.textSecondary}
        />
        <View style={[styles.groupSectionDot, { backgroundColor: dotColor }]} />
        <Text style={styles.groupSectionName} numberOfLines={1}>{baseName}</Text>
        <Text style={styles.groupSectionCount}> · {count} immagini</Text>
        <TouchableOpacity
          onPress={onToggleStatus}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          activeOpacity={0.7}
          style={[styles.groupStatusBadge, { backgroundColor: dotColor + "22" }]}
        >
          <Text style={[styles.groupStatusText, { color: dotColor }]}>{statusLabel}</Text>
        </TouchableOpacity>
      </TouchableOpacity>
      <TouchableOpacity style={styles.groupSectionEdit} onPress={onEdit} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <MaterialIcons name="folder-special" size={18} color={Colors.accent} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  groupSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: 20,
    paddingBottom: 6,
    paddingHorizontal: 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.surface,
    marginBottom: 4,
  },
  groupSectionLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    gap: 6,
  },
  groupSectionDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  groupSectionName: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    color: Colors.text,
    flex: 1,
  },
  groupSectionCount: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.textSecondary,
  },
  groupStatusBadge: {
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginLeft: 6,
  },
  groupStatusText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
  },
  groupSectionEdit: {
    padding: 4,
  },
});
