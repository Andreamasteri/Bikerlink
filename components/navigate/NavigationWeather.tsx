import React from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import type { ThemeColors } from "@/constants/colors";

export interface NavWeatherZone {
  name: string;
  tempNow: number | null;
  precipProb: number;
  weatherDesc: string;
  isSuitable: boolean;
}

interface NavigationWeatherProps {
  topPad: number;
  loading: boolean;
  current: NavWeatherZone | null;
  ahead: NavWeatherZone | null;
  rerouting: boolean;
  onAvoidWeather: () => void;
}

function weatherIcon(suitable: boolean): keyof typeof Ionicons.glyphMap {
  return suitable ? "partly-sunny-outline" : "rainy-outline";
}

export const NavigationWeather: React.FC<NavigationWeatherProps> = ({
  topPad,
  loading,
  current,
  ahead,
  rerouting,
  onAvoidWeather,
}) => {
  const colors = useColors();
  const s = styles(colors);

  if (!current && !ahead && !loading) return null;

  const aheadUnfavorable = !!ahead && !ahead.isSuitable;

  return (
    <View style={[s.container, { top: topPad + 8 }]} pointerEvents="box-none">
      <View style={s.card}>
        {loading && !current ? (
          <View style={s.row}>
            <ActivityIndicator size="small" color={colors.accent} />
            <Text style={s.label}>Meteo…</Text>
          </View>
        ) : (
          <>
            {current && (
              <View style={s.row}>
                <Ionicons
                  name={weatherIcon(current.isSuitable)}
                  size={18}
                  color={current.isSuitable ? colors.accent : colors.accentRed}
                />
                <Text style={s.label} numberOfLines={1}>
                  {current.tempNow !== null ? `${Math.round(current.tempNow)}°C` : ""}
                  {current.precipProb > 30 ? ` · ${current.precipProb}%` : ""}
                  {" · "}{current.weatherDesc}
                </Text>
              </View>
            )}
            {ahead && (
              <View style={[s.row, s.aheadRow]}>
                <MaterialCommunityIcons
                  name="arrow-right-bold"
                  size={14}
                  color={colors.textSecondary}
                />
                <Ionicons
                  name={weatherIcon(ahead.isSuitable)}
                  size={16}
                  color={ahead.isSuitable ? colors.accent : colors.accentRed}
                />
                <Text style={s.aheadLabel} numberOfLines={1}>
                  {ahead.name || "Prossima zona"}
                  {" · "}{ahead.weatherDesc}
                </Text>
              </View>
            )}
          </>
        )}
      </View>

      {aheadUnfavorable && (
        <Pressable
          style={[s.rerouteBtn, rerouting && s.rerouteBtnDisabled]}
          onPress={onAvoidWeather}
          disabled={rerouting}
          testID="avoid-weather-btn"
        >
          {rerouting ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <MaterialCommunityIcons name="weather-lightning-rainy" size={16} color="#fff" />
          )}
          <Text style={s.rerouteBtnText}>
            {rerouting ? "Ricalcolo…" : "Ricalcola per evitare il maltempo"}
          </Text>
        </Pressable>
      )}
    </View>
  );
};

const styles = (colors: ThemeColors) => StyleSheet.create({
  container: { position: "absolute", left: 12, right: 12, zIndex: 20, gap: 8 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 4,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  aheadRow: { paddingLeft: 2 },
  label: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: colors.text, flex: 1 },
  aheadLabel: { fontFamily: "Inter_500Medium", fontSize: 12, color: colors.textSecondary, flex: 1 },
  rerouteBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.accentRed,
    borderRadius: 12,
    paddingVertical: 12,
  },
  rerouteBtnDisabled: { opacity: 0.6 },
  rerouteBtnText: { fontFamily: "Inter_700Bold", fontSize: 13, color: "#fff" },
});
