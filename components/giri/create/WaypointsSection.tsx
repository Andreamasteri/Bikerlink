import React from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";

interface Waypoint { lat: number; lng: number; name: string; }
interface GeoResult { name: string; lat: number; lng: number; }

interface WaypointsSectionProps {
  waypoints: Waypoint[];
  wpInputs: string[];
  wpSuggestions: { index: number; results: GeoResult[] } | null;
  isImportingGpx: boolean;
  onWpInputChange: (text: string, index: number) => void;
  onSelectSuggestion: (index: number, geo: GeoResult) => void;
  onRemoveWaypoint: (index: number) => void;
  onAddWaypoint: () => void;
  onImportGpx: () => void;
}

export const WaypointsSection: React.FC<WaypointsSectionProps> = ({
  waypoints,
  wpInputs,
  wpSuggestions,
  isImportingGpx,
  onWpInputChange,
  onSelectSuggestion,
  onRemoveWaypoint,
  onAddWaypoint,
  onImportGpx,
}) => {
  const colors = useColors();
  const s = styles(colors);

  return (
    <View style={s.section}>
      <Text style={s.sectionLabel}>Percorso</Text>
      {waypoints.map((wp, i) => (
        <View key={i} style={s.wpRow}>
          <View style={s.wpDot}>
            <View style={[s.wpDotInner, {
              backgroundColor: i === 0 ? "#22c55e" : i === waypoints.length - 1 ? colors.accentRed : colors.accent,
            }]} />
          </View>
          <View style={{ flex: 1 }}>
            <TextInput
              style={[s.input, wp.lat !== 0 && { borderColor: "#22c55e55" }]}
              value={wpInputs[i] ?? ""}
              onChangeText={(t) => onWpInputChange(t, i)}
              placeholder={i === 0 ? "Partenza..." : i === waypoints.length - 1 ? "Arrivo..." : `Tappa ${i}...`}
              placeholderTextColor={colors.textSecondary}
            />
            {wpSuggestions?.index === i && wpSuggestions.results.length > 0 && (
              <View style={s.suggestions}>
                {wpSuggestions.results.map((geo, gi) => (
                  <Pressable key={gi} style={s.suggestion} onPress={() => onSelectSuggestion(i, geo)}>
                    <Ionicons name="location-outline" size={14} color={colors.accent} />
                    <Text style={s.suggestionText} numberOfLines={2}>{geo.name}</Text>
                  </Pressable>
                ))}
              </View>
            )}
          </View>
          {waypoints.length > 2 && i > 0 && i < waypoints.length - 1 && (
            <Pressable onPress={() => onRemoveWaypoint(i)} hitSlop={10} style={{ padding: 4 }}>
              <Ionicons name="close-circle" size={20} color={colors.accentRed} />
            </Pressable>
          )}
        </View>
      ))}
      <View style={{ flexDirection: "row", gap: 8, marginTop: 4 }}>
        <Pressable style={[s.addWpBtn, { flex: 1 }]} onPress={onAddWaypoint}>
          <Ionicons name="add-circle-outline" size={18} color={colors.accent} />
          <Text style={s.addWpText}>Aggiungi tappa</Text>
        </Pressable>
        <Pressable
          style={[s.addWpBtn, { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 10, justifyContent: "center", opacity: isImportingGpx ? 0.6 : 1 }]}
          onPress={onImportGpx}
          disabled={isImportingGpx}
        >
          {isImportingGpx
            ? <ActivityIndicator size="small" color={colors.accent} />
            : <Ionicons name="cloud-upload-outline" size={18} color={colors.accent} />
          }
          <Text style={s.addWpText}>Importa GPX</Text>
        </Pressable>
      </View>
    </View>
  );
};

const styles = (colors: any) => StyleSheet.create({
  section: { marginBottom: 20 },
  sectionLabel: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: colors.textSecondary, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 },
  wpRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  wpDot: { width: 12, alignItems: "center" },
  wpDotInner: { width: 8, height: 8, borderRadius: 4 },
  input: { backgroundColor: colors.surface, borderRadius: 10, padding: 12, fontFamily: "Inter_400Regular", fontSize: 15, color: colors.text, borderWidth: 1, borderColor: colors.border },
  suggestions: { backgroundColor: colors.surface, borderRadius: 10, marginTop: 4, borderWidth: 1, borderColor: colors.border, overflow: "hidden" },
  suggestion: { flexDirection: "row", alignItems: "center", gap: 8, padding: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  suggestionText: { fontFamily: "Inter_400Regular", fontSize: 13, color: colors.text, flex: 1 },
  addWpBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 10, paddingHorizontal: 12 },
  addWpText: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: colors.accent },
});
