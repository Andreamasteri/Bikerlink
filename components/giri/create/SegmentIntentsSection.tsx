import React from "react";
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
  optionsRow: { gap: 7, paddingRight: 10 },
  option: { flexDirection: "row", alignItems: "center", gap: 5, borderWidth: 1, borderColor: colors.border, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 7 },
  optionText: { fontFamily: "Inter_500Medium", fontSize: 12, color: colors.textSecondary },
});
