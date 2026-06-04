import React, { useRef, useEffect } from "react";
import { View, Text, Pressable, StyleSheet, Animated } from "react-native";
import { useColors } from "@/hooks/useColors";
import type { ThemeColors } from "@/constants/colors";

type Style = "direct" | "fast" | "balanced" | "curvy" | "extra_curvy";

interface RouteStyleSectionProps {
  style: Style;
  setStyle: (v: Style) => void;
  STYLE_LEVELS: { key: Style; label: string; shortLabel: string }[];
}

const NOTCH = 18;
const TRACK_H = 40;

export const RouteStyleSection: React.FC<RouteStyleSectionProps> = ({
  style,
  setStyle,
  STYLE_LEVELS,
}) => {
  const colors = useColors();
  const activeIndex = Math.max(
    0,
    Math.min(STYLE_LEVELS.length - 1, STYLE_LEVELS.findIndex((sl) => sl.key === style))
  );

  const scaleAnims = useRef(
    STYLE_LEVELS.map((_, i) => new Animated.Value(i === activeIndex ? 1.3 : 1))
  ).current;

  useEffect(() => {
    scaleAnims.forEach((anim, i) => {
      Animated.spring(anim, {
        toValue: i === activeIndex ? 1.3 : 1,
        useNativeDriver: true,
        tension: 160,
        friction: 10,
      }).start();
    });
  }, [activeIndex, scaleAnims]);

  const s = styles(colors);

  const fillFlex = activeIndex;
  const emptyFlex = Math.max(0, STYLE_LEVELS.length - 1 - activeIndex);

  return (
    <View style={s.section}>
      <Text style={s.sectionLabel}>Stile percorso</Text>

      <View style={s.numberRow}>
        {STYLE_LEVELS.map((_, i) => (
          <View key={i} style={s.cell}>
            <Text style={[s.levelNum, i === activeIndex && s.levelNumActive]}>
              {i + 1}
            </Text>
          </View>
        ))}
      </View>

      <View style={s.trackRow}>
        <View style={s.trackBg}>
          <View style={[s.trackFill, { flex: fillFlex }]} />
          <View style={{ flex: emptyFlex }} />
        </View>
        {STYLE_LEVELS.map((sl, i) => {
          const isActive = i === activeIndex;
          return (
            <Pressable
              key={sl.key}
              style={s.cell}
              onPress={() => setStyle(sl.key)}
              hitSlop={{ top: 10, bottom: 10, left: 4, right: 4 }}
            >
              <Animated.View
                style={[
                  s.notchDot,
                  isActive ? s.notchActive : s.notchInactive,
                  { transform: [{ scale: scaleAnims[i] }] },
                ]}
              />
            </Pressable>
          );
        })}
      </View>

      <View style={s.labelRow}>
        {STYLE_LEVELS.map((sl, i) => (
          <View key={sl.key} style={s.cell}>
            <Text
              style={[s.shortLabel, i === activeIndex && s.shortLabelActive]}
              numberOfLines={1}
            >
              {sl.shortLabel}
            </Text>
          </View>
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
      marginBottom: 4,
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
    numberRow: { flexDirection: "row" },
    trackRow: {
      flexDirection: "row",
      height: TRACK_H,
      alignItems: "center",
      position: "relative",
    },
    labelRow: { flexDirection: "row", marginTop: 2 },
    cell: { flex: 1, alignItems: "center", justifyContent: "center" },
    trackBg: {
      position: "absolute",
      left: "10%",
      right: "10%",
      height: 3,
      borderRadius: 2,
      backgroundColor: colors.border,
      flexDirection: "row",
      overflow: "hidden",
    },
    trackFill: {
      height: 3,
      backgroundColor: colors.accent,
    },
    notchDot: {
      width: NOTCH,
      height: NOTCH,
      borderRadius: NOTCH / 2,
      borderWidth: 2,
      zIndex: 1,
    },
    notchInactive: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
    },
    notchActive: {
      backgroundColor: colors.accent,
      borderColor: colors.accent,
    },
    levelNum: {
      fontFamily: "Inter_500Medium",
      fontSize: 11,
      color: colors.textSecondary,
    },
    levelNumActive: {
      color: colors.accent,
      fontFamily: "Inter_700Bold",
    },
    shortLabel: {
      fontFamily: "Inter_400Regular",
      fontSize: 10,
      color: colors.textSecondary,
      textAlign: "center",
    },
    shortLabelActive: {
      color: colors.accent,
      fontFamily: "Inter_600SemiBold",
    },
    curvinessDesc: {
      fontFamily: "Inter_400Regular",
      fontSize: 12,
      color: colors.textSecondary,
      textAlign: "center",
      marginTop: 6,
    },
  });
