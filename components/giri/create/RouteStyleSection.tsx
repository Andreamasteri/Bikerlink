import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { useColors } from "@/hooks/useColors";
import type { ThemeColors } from "@/constants/colors";

type Style = "direct" | "fast" | "balanced" | "curvy" | "extra_curvy";

interface RouteStyleSectionProps {
  style: Style;
  setStyle: (v: Style) => void;
  STYLE_LEVELS: { key: Style; label: string; shortLabel: string }[];
}

export const RouteStyleSection: React.FC<RouteStyleSectionProps> = ({
  style,
  setStyle,
  STYLE_LEVELS,
}) => {
  const colors = useColors();
  const s = styles(colors);

  return (
    <View style={s.section}>
      <Text style={s.sectionLabel}>Stile percorso</Text>
      <View style={s.curvinessRow}>
        {STYLE_LEVELS.map((sl) => (
          <Pressable
            key={sl.key}
            style={[s.curvinessBtn, style === sl.key && { backgroundColor: colors.accent }]}
            onPress={() => setStyle(sl.key)}
          >
            <Text style={[s.curvinessBtnText, style === sl.key && { color: "#000" }]} numberOfLines={1}>
              {sl.shortLabel}
            </Text>
          </Pressable>
        ))}
      </View>
      <Text style={s.curvinessDesc}>
        {style === "direct" && "Percorso più breve possibile, predilige grandi arterie"}
        {style === "fast" && "Percorso veloce, rettilineo con poche deviazioni"}
        {style === "balanced" && "Buon mix di curve e rettilineo"}
        {style === "curvy" && "Strade curve e panoramiche — ideale per i bikers"}
        {style === "extra_curvy" && "Massimizza le curve: strade secondarie e tortuose"}
      </Text>
    </View>
  );
};

const styles = (colors: ThemeColors) =>
  StyleSheet.create({
    section: { marginBottom: 20 },
    sectionLabel: {
      fontFamily: "Inter_600SemiBold",
      fontSize: 13,
      color: colors.textSecondary,
      marginBottom: 8,
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
    curvinessRow: { flexDirection: "row", gap: 6, marginBottom: 8 },
    curvinessBtn: {
      flex: 1,
      alignItems: "center",
      paddingVertical: 10,
      borderRadius: 10,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    curvinessBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 11, color: colors.textSecondary },
    curvinessDesc: { fontFamily: "Inter_400Regular", fontSize: 12, color: colors.textSecondary, textAlign: "center" },
  });
