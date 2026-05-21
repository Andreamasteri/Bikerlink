import React, { useState } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import Colors from "@/constants/colors";
import { useColors } from "@/hooks/useColors";
import { useUnits, type TimeFormat, type SpeedUnit, type DistanceUnit } from "@/lib/units-context";
import { useT } from "@/lib/language-context";

export default function UnitsPanel() {
  const colors = useColors();
  const t = useT();
  const { timeFormat, speedUnit, distanceUnit, setTimeFormat, setSpeedUnit, setDistanceUnit } = useUnits();
  const [unitsExpanded, setUnitsExpanded] = useState(false);

  const { data: allSettingsData } = useQuery<{ unitsPrefEnabled?: boolean }>({
    queryKey: ["/api/settings/all"],
    staleTime: 120000,
    retry: false,
  });
  const unitsPrefEnabled = allSettingsData?.unitsPrefEnabled === true;

  if (!unitsPrefEnabled) return null;

  return (
    <View style={styles.section}>
      <Pressable style={styles.accordionHeader} onPress={() => setUnitsExpanded(v => !v)}>
        <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>{t("profile.unitsPreferences")}</Text>
        <Ionicons name={unitsExpanded ? "chevron-up" : "chevron-down"} size={18} color={colors.textSecondary} />
      </Pressable>
      {unitsExpanded && (
        <View style={{ paddingTop: 12, gap: 16 }}>
          <View>
            <Text style={[styles.unitsGroupLabel, { color: colors.textSecondary }]}>Formato orario</Text>
            <View style={{ gap: 8 }}>
              {([
                { value: "24h" as TimeFormat, label: "24 ore", desc: "es. 14:30" },
                { value: "12h" as TimeFormat, label: "12 ore (AM/PM)", desc: "es. 2:30 PM" },
              ] as { value: TimeFormat; label: string; desc: string }[]).map((opt) => {
                const isSelected = timeFormat === opt.value;
                return (
                  <Pressable
                    key={opt.value}
                    style={[styles.unitsOption, isSelected && { backgroundColor: colors.accent + "14", borderColor: colors.accent }]}
                    onPress={() => setTimeFormat(opt.value)}
                  >
                    <View style={[styles.unitsRadio, { borderColor: isSelected ? colors.accent : colors.border }]}>
                      {isSelected && <View style={[styles.unitsRadioDot, { backgroundColor: colors.accent }]} />}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.unitsOptionLabel, isSelected && { color: colors.accent }]}>{opt.label}</Text>
                      <Text style={[styles.unitsOptionDesc, { color: colors.textSecondary }]}>{opt.desc}</Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View>
            <Text style={[styles.unitsGroupLabel, { color: colors.textSecondary }]}>{t("profile.speed")}</Text>
            <View style={{ gap: 8 }}>
              {([
                { value: "kmh" as SpeedUnit, label: "km/h", desc: "Chilometri all'ora" },
                { value: "mph" as SpeedUnit, label: "mph", desc: "Miglia all'ora" },
                { value: "knots" as SpeedUnit, label: "nodi (kn)", desc: "Miglia nautiche all'ora" },
              ] as { value: SpeedUnit; label: string; desc: string }[]).map((opt) => {
                const isSelected = speedUnit === opt.value;
                return (
                  <Pressable
                    key={opt.value}
                    style={[styles.unitsOption, isSelected && { backgroundColor: colors.accent + "14", borderColor: colors.accent }]}
                    onPress={() => setSpeedUnit(opt.value)}
                  >
                    <View style={[styles.unitsRadio, { borderColor: isSelected ? colors.accent : colors.border }]}>
                      {isSelected && <View style={[styles.unitsRadioDot, { backgroundColor: colors.accent }]} />}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.unitsOptionLabel, isSelected && { color: colors.accent }]}>{opt.label}</Text>
                      <Text style={[styles.unitsOptionDesc, { color: colors.textSecondary }]}>{opt.desc}</Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View>
            <Text style={[styles.unitsGroupLabel, { color: colors.textSecondary }]}>Distanza</Text>
            <View style={{ gap: 8 }}>
              {([
                { value: "km_m" as DistanceUnit, label: "km / m", desc: "Chilometri e metri" },
                { value: "mi_ft" as DistanceUnit, label: "mi / ft", desc: "Miglia e piedi" },
                { value: "mi_yd" as DistanceUnit, label: "mi / yd", desc: "Miglia e iarde" },
                { value: "nmi_ftm" as DistanceUnit, label: "nmi / ftm", desc: "Miglia nautiche e braccia" },
              ] as { value: DistanceUnit; label: string; desc: string }[]).map((opt) => {
                const isSelected = distanceUnit === opt.value;
                return (
                  <Pressable
                    key={opt.value}
                    style={[styles.unitsOption, isSelected && { backgroundColor: colors.accent + "14", borderColor: colors.accent }]}
                    onPress={() => setDistanceUnit(opt.value)}
                  >
                    <View style={[styles.unitsRadio, { borderColor: isSelected ? colors.accent : colors.border }]}>
                      {isSelected && <View style={[styles.unitsRadioDot, { backgroundColor: colors.accent }]} />}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.unitsOptionLabel, isSelected && { color: colors.accent }]}>{opt.label}</Text>
                      <Text style={[styles.unitsOptionDesc, { color: colors.textSecondary }]}>{opt.desc}</Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    paddingHorizontal: 16,
    marginTop: 4,
  },
  accordionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
    marginBottom: 12,
  },
  unitsGroupLabel: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    textTransform: "uppercase" as const,
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  unitsOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: Colors.surface,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  unitsRadio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  unitsRadioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  unitsOptionLabel: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
    marginBottom: 1,
  },
  unitsOptionDesc: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    lineHeight: 16,
  },
});
