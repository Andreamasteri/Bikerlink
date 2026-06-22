import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
export function CollapseChevron({ collapsed }: { collapsed: boolean }) {
  return (
    <Ionicons name={collapsed ? "chevron-down" : "chevron-up"} size={16} color={Colors.textSecondary} />
  );
}

export function Section({
  title,
  icon,
  open,
  onToggle,
  children,
}: {
  title: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <TouchableOpacity style={styles.sectionHeader} onPress={onToggle} activeOpacity={0.7}>
        <MaterialCommunityIcons name={icon} size={15} color={Colors.textSecondary} />
        <Text style={styles.sectionTitle}>{title}</Text>
        <View style={styles.sectionChevron}>
          <CollapseChevron collapsed={!open} />
        </View>
      </TouchableOpacity>
      {open && <View style={styles.sectionBody}>{children}</View>}
    </View>
  );
}

import { TouchableOpacity } from "react-native";

const styles = StyleSheet.create({
  section: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: 8,
  },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 6 },
  sectionTitle: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: Colors.text },
  sectionChevron: { marginLeft: "auto" },
  sectionBody: { marginTop: 8, gap: 6 },
});
