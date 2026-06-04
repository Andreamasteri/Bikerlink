import React from "react";
import { View, Text, Switch, StyleSheet } from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import Slider from "@react-native-community/slider";
import { useColors } from "@/hooks/useColors";
import type { ThemeColors } from "@/constants/colors";

interface RouteOptionsSectionProps {
  isRoundTrip: boolean;
  setIsRoundTrip: (v: boolean) => void;
  roundTripHours: number;
  setRoundTripHours: (v: number) => void;
  headingDeg: number | null;
  setHeadingDeg: (v: number | null) => void;
  isMultiDay: boolean;
  setIsMultiDay: (v: boolean) => void;
  daysCount: number;
  setDaysCount: (v: number) => void;
  maxHoursPerDay: number;
  setMaxHoursPerDay: (v: number) => void;
  avoidHighways: boolean;
  setAvoidHighways: (v: boolean) => void;
  avoidTolls: boolean;
  setAvoidTolls: (v: boolean) => void;
  avoidFerries: boolean;
  setAvoidFerries: (v: boolean) => void;
  avoidUnpaved: boolean;
  setAvoidUnpaved: (v: boolean) => void;
  avoidWeather: boolean;
  setAvoidWeather: (v: boolean) => void;
  visibility: "public" | "private";
  setVisibility: (v: "public" | "private") => void;
  COMPASS_DIRECTIONS: { label: string; deg: number }[];
}

export const RouteOptionsSection: React.FC<RouteOptionsSectionProps> = ({
  isRoundTrip,
  setIsRoundTrip,
  roundTripHours,
  setRoundTripHours,
  headingDeg,
  setHeadingDeg,
  isMultiDay,
  setIsMultiDay,
  daysCount,
  setDaysCount,
  maxHoursPerDay,
  setMaxHoursPerDay,
  avoidHighways,
  setAvoidHighways,
  avoidTolls,
  setAvoidTolls,
  avoidFerries,
  setAvoidFerries,
  avoidUnpaved,
  setAvoidUnpaved,
  avoidWeather,
  setAvoidWeather,
  visibility,
  setVisibility,
  COMPASS_DIRECTIONS,
}) => {
  const colors = useColors();
  const s = styles(colors);

  return (
    <View style={s.section}>
      <Text style={s.sectionLabel}>Opzioni percorso</Text>

      <View style={s.toggleRow}>
        <View style={s.toggleInfo}>
          <Ionicons name="repeat-outline" size={18} color={colors.text} />
          <Text style={s.toggleLabel}>Andata e ritorno</Text>
        </View>
        <Switch value={isRoundTrip} onValueChange={(v) => { setIsRoundTrip(v); if (!v) setHeadingDeg(null); }}
          trackColor={{ false: colors.border, true: colors.accent }} thumbColor="#fff" />
      </View>

      {isRoundTrip && (
        <View style={s.sliderSection}>
          <View style={s.sliderLabelRow}>
            <Text style={s.sliderLabel}>Durata massima</Text>
            <Text style={s.sliderValue}>{roundTripHours}h</Text>
          </View>
          <Slider
            style={{ width: "100%", height: 36 }}
            minimumValue={1} maximumValue={12} step={1}
            value={roundTripHours} onValueChange={setRoundTripHours}
            minimumTrackTintColor={colors.accent}
            maximumTrackTintColor={colors.border}
            thumbTintColor={colors.accent}
          />
          <View style={s.sliderTicks}>
            {[1, 3, 6, 9, 12].map((h) => <Text key={h} style={s.sliderTick}>{h}h</Text>)}
          </View>

          <Text style={[s.sliderLabel, { marginTop: 12, marginBottom: 8 }]}>Direzione di partenza preferita</Text>
          <View style={s.compassGrid}>
            <Pressable
              style={[s.compassCenter, headingDeg === null && { backgroundColor: colors.accent }]}
              onPress={() => setHeadingDeg(null)}
            >
              <Text style={[s.compassDirText, headingDeg === null && { color: "#000" }]}>Qualsiasi</Text>
            </Pressable>
            <View style={s.compassRing}>
              {COMPASS_DIRECTIONS.map((dir) => (
                <Pressable
                  key={dir.label}
                  style={[s.compassDir, headingDeg === dir.deg && { backgroundColor: colors.accent }]}
                  onPress={() => setHeadingDeg(headingDeg === dir.deg ? null : dir.deg)}
                >
                  <Text style={[s.compassDirText, headingDeg === dir.deg && { color: "#000" }]}>{dir.label}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        </View>
      )}

      <View style={s.toggleRow}>
        <View style={s.toggleInfo}>
          <Ionicons name="calendar-outline" size={18} color={colors.text} />
          <Text style={s.toggleLabel}>Giro multi-giorno</Text>
        </View>
        <Switch value={isMultiDay} onValueChange={setIsMultiDay}
          trackColor={{ false: colors.border, true: colors.accent }} thumbColor="#fff" />
      </View>
      {isMultiDay && (
        <View style={s.sliderSection}>
          <View style={s.sliderLabelRow}>
            <Text style={s.sliderLabel}>Numero giorni</Text>
            <Text style={s.sliderValue}>{daysCount} giorni</Text>
          </View>
          <Slider
            style={{ width: "100%", height: 36 }}
            minimumValue={2} maximumValue={14} step={1}
            value={daysCount} onValueChange={setDaysCount}
            minimumTrackTintColor={colors.accent}
            maximumTrackTintColor={colors.border}
            thumbTintColor={colors.accent}
          />
          <View style={s.sliderLabelRow}>
            <Text style={s.sliderLabel}>Ore guida/giorno</Text>
            <Text style={s.sliderValue}>{maxHoursPerDay}h</Text>
          </View>
          <Slider
            style={{ width: "100%", height: 36 }}
            minimumValue={2} maximumValue={10} step={1}
            value={maxHoursPerDay} onValueChange={setMaxHoursPerDay}
            minimumTrackTintColor={colors.accent}
            maximumTrackTintColor={colors.border}
            thumbTintColor={colors.accent}
          />
        </View>
      )}

      <Text style={[s.sectionLabel, { marginTop: 8, marginBottom: 4 }]}>Evita</Text>
      {[
        { key: "avoidHighways" as const, label: "Autostrade", icon: "highway" as const, value: avoidHighways, set: setAvoidHighways },
        { key: "avoidTolls" as const, label: "Pedaggi", icon: "cash" as const, value: avoidTolls, set: setAvoidTolls },
        { key: "avoidFerries" as const, label: "Traghetti", icon: "ferry" as const, value: avoidFerries, set: setAvoidFerries },
        { key: "avoidUnpaved" as const, label: "Strade sterrate", icon: "terrain" as const, value: avoidUnpaved, set: setAvoidUnpaved },
        { key: "avoidWeather" as const, label: "Zone con maltempo", icon: "weather-lightning-rainy" as const, value: avoidWeather, set: setAvoidWeather },
      ].map((opt) => (
        <View key={opt.key} style={s.toggleRow}>
          <View style={s.toggleInfo}>
            <MaterialCommunityIcons name={opt.icon} size={18} color={colors.text} />
            <Text style={s.toggleLabel}>{opt.label}</Text>
          </View>
          <Switch value={opt.value} onValueChange={opt.set}
            trackColor={{ false: colors.border, true: colors.accent }} thumbColor="#fff" />
        </View>
      ))}

      <View style={s.toggleRow}>
        <View style={s.toggleInfo}>
          <Ionicons name="globe-outline" size={18} color={colors.text} />
          <Text style={s.toggleLabel}>Visibile alla community</Text>
        </View>
        <Switch value={visibility === "public"} onValueChange={(v) => setVisibility(v ? "public" : "private")}
          trackColor={{ false: colors.border, true: colors.accent }} thumbColor="#fff" />
      </View>
    </View>
  );
};

import { Pressable } from "react-native";

const styles = (colors: ThemeColors) => StyleSheet.create({
  section: { marginBottom: 20 },
  sectionLabel: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: colors.textSecondary, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 },
  toggleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 8 },
  toggleInfo: { flexDirection: "row", alignItems: "center", gap: 10 },
  toggleLabel: { fontFamily: "Inter_500Medium", fontSize: 15, color: colors.text },
  sliderSection: { marginTop: 8, paddingHorizontal: 4 },
  sliderLabelRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 },
  sliderLabel: { fontFamily: "Inter_500Medium", fontSize: 14, color: colors.textSecondary },
  sliderValue: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: colors.accent },
  sliderTicks: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 10 },
  sliderTick: { fontFamily: "Inter_400Regular", fontSize: 10, color: colors.textSecondary },
  compassGrid: { alignItems: "center", marginVertical: 10, height: 160, justifyContent: "center" },
  compassCenter: { width: 70, height: 70, borderRadius: 35, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center", zIndex: 2 },
  compassRing: { position: "absolute", width: 160, height: 160, alignItems: "center", justifyContent: "center" },
  compassDir: { position: "absolute", width: 34, height: 34, borderRadius: 17, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  compassDirText: { fontFamily: "Inter_700Bold", fontSize: 11, color: colors.text },
});
