import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { useT } from "@/lib/language-context";
import type { ThemeColors } from "@/constants/colors";

interface NavigationFinishedProps {
  route: {
    title: string;
    distanceKm: number;
    durationMinutes: number;
  };
  topPad: number;
  bottomPad: number;
  formatDuration: (mins: number) => string;
  onSave: () => void;
  onClose: () => void;
}

export function NavigationFinished({
  route,
  topPad,
  bottomPad,
  formatDuration,
  onSave,
  onClose,
}: NavigationFinishedProps) {
  const colors = useColors();
  const t = useT();
  const s = styles(colors);

  return (
    <View style={[s.container, { paddingTop: topPad, paddingBottom: bottomPad }]}>
      <View style={s.finishedContainer}>
        <MaterialCommunityIcons name="flag-checkered" size={72} color={colors.accent} />
        <Text style={s.finishedTitle}>{t("nav.arrived")}</Text>
        <Text style={s.finishedSub}>{route.title}</Text>
        <Text style={s.finishedStats}>{route.distanceKm} km · {formatDuration(route.durationMinutes)}</Text>
        <View style={s.finishedActions}>
          <Pressable
            style={[s.finishedBtn, { backgroundColor: colors.accent }]}
            onPress={onSave}
          >
            <MaterialCommunityIcons name="record-circle" size={18} color="#fff" />
            <Text style={s.finishedBtnText}>{t("nav.save_ride")}</Text>
          </Pressable>
          <Pressable style={[s.finishedBtn, { backgroundColor: colors.surface }]} onPress={onClose}>
            <Ionicons name="close" size={18} color={colors.text} />
            <Text style={[s.finishedBtnText, { color: colors.text }]}>{t("nav.close")}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    finishedContainer: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      padding: 32,
      gap: 12,
    },
    finishedTitle: { fontFamily: "Inter_700Bold", fontSize: 32, color: colors.text },
    finishedSub: { fontFamily: "Inter_500Medium", fontSize: 16, color: colors.textSecondary, textAlign: "center" },
    finishedStats: { fontFamily: "Inter_400Regular", fontSize: 14, color: colors.textSecondary },
    finishedActions: { flexDirection: "row", gap: 12, marginTop: 16 },
    finishedBtn: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      borderRadius: 14,
      paddingVertical: 14,
      paddingHorizontal: 18,
    },
    finishedBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: "#fff" },
  });
