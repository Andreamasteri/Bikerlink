import React, { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import type { ThemeColors } from "@/constants/colors";
import { ROUTE_INTENT_OPTIONS, type SegmentRouteIntent } from "./types";

interface Props {
  waypoints: Array<{ name: string }>;
  segmentIntents: SegmentRouteIntent[] | null;
  onEnable: () => void;
  onDisable: () => void;
  onChange: (index: number, intent: SegmentRouteIntent) => void;
  disabled?: boolean;
}

const waypointLabel = (waypoints: Array<{ name: string }>, index: number) => {
  const start = index === 0 ? "Partenza" : waypoints[index].name || `Tappa ${index}`;
  const endIndex = index + 1;
  const end = endIndex === waypoints.length - 1 ? "Arrivo" : waypoints[endIndex].name || `Tappa ${endIndex}`;
  return `${start} → ${end}`;
};

const LOCAL_CONSTRAINTS = [
  { key: "avoidHighways", label: "Autostrade", icon: "car-outline" },
  { key: "avoidTolls", label: "Pedaggi", icon: "card-outline" },
  { key: "avoidFerries", label: "Traghetti", icon: "boat-outline" },
  { key: "avoidUnpaved", label: "Sterrato", icon: "trail-sign-outline" },
  { key: "avoidWeather", label: "Meteo avverso", icon: "rainy-outline" },
] as const;

function nextConstraintValue(value: boolean | undefined): boolean | undefined {
  // Il ciclo esplicito mantiene anche il caso "eredita dal giro":
  // eredita → evita → consenti → eredita.
  if (value === undefined) return true;
  if (value) return false;
  return undefined;
}

function constraintStateLabel(value: boolean | undefined): string {
  if (value === true) return "Evita";
  if (value === false) return "Consenti";
  return "Come il giro";
}

export function SegmentIntentsSection({
  waypoints,
  segmentIntents,
  onEnable,
  onDisable,
  onChange,
  disabled = false,
}: Props) {
  const colors = useColors();
  const s = styles(colors);
  const [openConstraints, setOpenConstraints] = useState<Set<number>>(() => new Set());
  if (waypoints.length < 3) return null;

  const active = segmentIntents !== null;
  return (
    <View style={[s.section, disabled && { opacity: 0.55 }]}>
      <View style={s.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={s.sectionLabel}>Stile per tratta</Text>
          <Text style={s.hint}>
            {disabled
              ? "Disponibile per i percorsi con partenza e arrivo distinti"
              : active
                ? "Ogni tratta conserva o sostituisce lo stile del giro"
                : "Il giro usa un solo stile finché non personalizzi una tratta"}
          </Text>
        </View>
        <Pressable
          onPress={active ? onDisable : onEnable}
          disabled={disabled}
          style={[s.toggle, active && { backgroundColor: colors.accent, borderColor: colors.accent }]}
        >
          <Ionicons name={active ? "close-outline" : "options-outline"} size={16} color={active ? "#fff" : colors.accent} />
          <Text style={[s.toggleText, active && { color: "#fff" }]}>{active ? "Chiudi" : "Personalizza"}</Text>
        </Pressable>
      </View>

      {active && segmentIntents?.map((intent, index) => (
        <View key={index} style={s.segmentCard}>
          <Text style={s.segmentTitle} numberOfLines={1}>{waypointLabel(waypoints, index)}</Text>
          {index + 1 < waypoints.length - 1 && (
            <Text style={s.anchorHint} numberOfLines={1}>
              Ancora: {waypoints[index + 1].name || `Tappa ${index + 1}`}
            </Text>
          )}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.optionsRow}>
            {ROUTE_INTENT_OPTIONS.map((option) => {
              const selected = (intent.kind ?? "inherit") === option.key;
              return (
                <Pressable
                  key={option.key}
                  onPress={() => onChange(index, { ...intent, kind: option.key })}
                  style={[s.option, selected && { borderColor: colors.accent, backgroundColor: colors.accent + "18" }]}
                >
                  <Ionicons name={option.icon as keyof typeof Ionicons.glyphMap} size={14} color={selected ? colors.accent : colors.textSecondary} />
                  <Text style={[s.optionText, selected && { color: colors.accent }]}>{option.label}</Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <Pressable
            style={s.constraintsToggle}
            onPress={() => setOpenConstraints((current) => {
              const next = new Set(current);
              if (next.has(index)) next.delete(index);
              else next.add(index);
              return next;
            })}
          >
            <Ionicons name="shield-checkmark-outline" size={15} color={colors.textSecondary} />
            <Text style={s.constraintsToggleText}>Vincoli locali</Text>
            <Ionicons
              name={openConstraints.has(index) ? "chevron-up-outline" : "chevron-down-outline"}
              size={15}
              color={colors.textSecondary}
            />
          </Pressable>

          {openConstraints.has(index) && (
            <View style={s.constraintsGrid}>
              {LOCAL_CONSTRAINTS.map((constraint) => {
                const value = intent[constraint.key];
                const isOverride = value !== undefined;
                return (
                  <Pressable
                    key={constraint.key}
                    onPress={() => onChange(index, {
                      ...intent,
                      [constraint.key]: nextConstraintValue(value),
                    })}
                    style={[
                      s.constraint,
                      isOverride && {
                        borderColor: value ? colors.accent : colors.textSecondary,
                        backgroundColor: value ? colors.accent + "18" : colors.surface,
                      },
                    ]}
                  >
                    <Ionicons
                      name={constraint.icon as keyof typeof Ionicons.glyphMap}
                      size={14}
                      color={value ? colors.accent : colors.textSecondary}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={[s.constraintLabel, value && { color: colors.accent }]}>{constraint.label}</Text>
                      <Text style={s.constraintState}>{constraintStateLabel(value)}</Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>
      ))}
    </View>
  );
}

const styles = (colors: ThemeColors) => StyleSheet.create({
  section: { marginBottom: 20, backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 12 },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  sectionLabel: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: colors.text, textTransform: "uppercase", letterSpacing: 0.4 },
  hint: { marginTop: 3, fontFamily: "Inter_400Regular", fontSize: 12, color: colors.textSecondary, lineHeight: 17 },
  toggle: { flexDirection: "row", alignItems: "center", gap: 5, borderWidth: 1, borderColor: colors.accent, borderRadius: 8, paddingVertical: 7, paddingHorizontal: 9 },
  toggleText: { fontFamily: "Inter_600SemiBold", fontSize: 12, color: colors.accent },
  segmentCard: { marginTop: 12, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 10 },
  segmentTitle: { fontFamily: "Inter_600SemiBold", fontSize: 12, color: colors.text, marginBottom: 8 },
  anchorHint: { marginTop: -4, marginBottom: 8, fontFamily: "Inter_400Regular", fontSize: 11, color: colors.textSecondary },
  optionsRow: { gap: 7, paddingRight: 10 },
  option: { flexDirection: "row", alignItems: "center", gap: 5, borderWidth: 1, borderColor: colors.border, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 7 },
  optionText: { fontFamily: "Inter_500Medium", fontSize: 12, color: colors.textSecondary },
  constraintsToggle: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", marginTop: 10, paddingVertical: 4 },
  constraintsToggleText: { fontFamily: "Inter_500Medium", fontSize: 12, color: colors.textSecondary },
  constraintsGrid: { gap: 7, marginTop: 6 },
  constraint: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderColor: colors.border, borderRadius: 9, paddingHorizontal: 9, paddingVertical: 8 },
  constraintLabel: { fontFamily: "Inter_500Medium", fontSize: 12, color: colors.text },
  constraintState: { marginTop: 1, fontFamily: "Inter_400Regular", fontSize: 10, color: colors.textSecondary },
});
