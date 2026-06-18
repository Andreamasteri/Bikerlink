import React, { useRef, useEffect } from "react";
import { View, Text, StyleSheet, Animated, PanResponder } from "react-native";
import { useColors } from "@/hooks/useColors";
import type { ThemeColors } from "@/constants/colors";

type Style = "direct" | "fast" | "balanced" | "curvy" | "extra_curvy";

interface RouteStyleSectionProps {
  style: Style;
  setStyle: (v: Style) => void;
  STYLE_LEVELS: { key: Style; label: string; shortLabel: string }[];
}

const NOTCH = 18;
const TRACK_H = 44;

/**
 * Converte la posizione X del touch (px) nell'indice di stile [0, n-1].
 * Esportata per i test di regressione: se la formula cambia, i test si rompono.
 */
export function resolveRouteStyleIndex(x: number, trackWidth: number, n: number): number {
  return Math.round(Math.max(0, Math.min(n - 1, (x / Math.max(trackWidth, 1)) * (n - 1))));
}

/**
 * Factory che restituisce i due handler PanResponder del drag handle del
 * route-planner slider. Esportata per i test di regressione: se la logica
 * grant/move cambia, i test che importano questa factory si rompono.
 *
 * @param styleKeys  Array ordinato delle chiavi di stile (es. ["direct", …, "extra_curvy"])
 * @param getTrackWidth  Getter che restituisce la larghezza corrente della track
 * @param setStyle  Callback chiamata quando cambia lo stile selezionato
 */
export function createRouteStylePanHandlers<K extends string>(
  styleKeys: readonly K[],
  getTrackWidth: () => number,
  setStyle: (key: K) => void
): {
  onStartShouldSetPanResponder: () => boolean;
  onMoveShouldSetPanResponder: () => boolean;
  onGrant: (locationX: number) => void;
  onMove: (locationX: number) => void;
} {
  const n = styleKeys.length;
  const lastIdxRef = { current: 0 };

  function resolve(x: number): number {
    return resolveRouteStyleIndex(x, getTrackWidth(), n);
  }

  return {
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onGrant(locationX: number) {
      const idx = resolve(locationX);
      lastIdxRef.current = idx;
      setStyle(styleKeys[idx]);
    },
    onMove(locationX: number) {
      const idx = resolve(locationX);
      if (idx !== lastIdxRef.current) {
        lastIdxRef.current = idx;
        setStyle(styleKeys[idx]);
      }
    },
  };
}

export const RouteStyleSection: React.FC<RouteStyleSectionProps> = ({
  style,
  setStyle,
  STYLE_LEVELS,
}) => {
  const colors = useColors();
  const n = STYLE_LEVELS.length;

  const activeIndex = Math.max(
    0,
    Math.min(n - 1, STYLE_LEVELS.findIndex((sl) => sl.key === style))
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

  const trackWidthRef = useRef(0);

  const panHandlers = useRef(
    createRouteStylePanHandlers(
      STYLE_LEVELS.map((sl) => sl.key),
      () => trackWidthRef.current,
      setStyle
    )
  ).current;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: panHandlers.onStartShouldSetPanResponder,
      onMoveShouldSetPanResponder: panHandlers.onMoveShouldSetPanResponder,
      onPanResponderGrant: (evt) => { panHandlers.onGrant(evt.nativeEvent.locationX); },
      onPanResponderMove: (evt) => { panHandlers.onMove(evt.nativeEvent.locationX); },
    })
  ).current;

  const s = styles(colors);
  const fillFlex = activeIndex;
  const emptyFlex = Math.max(0, n - 1 - activeIndex);

  const descMap: Record<Style, string> = {
    direct: "Percorso più breve possibile, predilige grandi arterie",
    fast: "Percorso veloce, rettilineo con poche deviazioni",
    balanced: "Buon mix di curve e rettilineo",
    curvy: "Strade curve e panoramiche — ideale per i bikers",
    extra_curvy: "Massimizza le curve: strade secondarie e tortuose",
  };

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

      <View
        style={s.trackRow}
        onLayout={(e) => { trackWidthRef.current = e.nativeEvent.layout.width; }}
        {...panResponder.panHandlers}
      >
        <View style={s.trackBg}>
          {fillFlex > 0 && <View style={[s.trackFill, { flex: fillFlex }]} />}
          {emptyFlex > 0 && <View style={{ flex: emptyFlex }} />}
        </View>
        {STYLE_LEVELS.map((sl, i) => (
          <View key={sl.key} style={s.cell}>
            <Animated.View
              style={[
                s.notchDot,
                i === activeIndex ? s.notchActive : s.notchInactive,
                { transform: [{ scale: scaleAnims[i] }] },
              ]}
            />
          </View>
        ))}
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

      <Text style={s.curvinessDesc}>{descMap[style]}</Text>
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
