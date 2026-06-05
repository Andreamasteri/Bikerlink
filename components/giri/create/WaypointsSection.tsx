import React, { useRef, useState, useCallback } from "react";
import {
  View, Text, TextInput, Pressable, StyleSheet,
  ActivityIndicator, Modal, ScrollView, Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import type { ThemeColors } from "@/constants/colors";

interface Waypoint { lat: number; lng: number; name: string; }
interface GeoResult { name: string; lat: number; lng: number; }

interface InputMeasure { x: number; y: number; width: number; height: number; }

interface WaypointsSectionProps {
  waypoints: Waypoint[];
  wpInputs: string[];
  wpSuggestions: { index: number; results: GeoResult[] } | null;
  wpLoading: boolean;
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
  wpLoading,
  isImportingGpx,
  onWpInputChange,
  onSelectSuggestion,
  onRemoveWaypoint,
  onAddWaypoint,
  onImportGpx,
}) => {
  const colors = useColors();
  const s = styles(colors);

  const inputRefs = useRef<(TextInput | null)[]>([]);
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const [overlayMeasure, setOverlayMeasure] = useState<InputMeasure | null>(null);

  const measureInput = useCallback((index: number) => {
    const ref = inputRefs.current[index];
    if (ref) {
      if (Platform.OS === "web") {
        ref.measure((_x, _y, width, height, pageX, pageY) => {
          setOverlayMeasure({ x: pageX, y: pageY, width, height });
        });
      } else {
        ref.measureInWindow((x, y, width, height) => {
          setOverlayMeasure({ x, y, width, height });
        });
      }
    }
  }, []);

  const handleFocus = useCallback((index: number) => {
    setFocusedIndex(index);
    measureInput(index);
  }, [measureInput]);

  const dismissOverlay = useCallback(() => {
    setOverlayMeasure(null);
    setFocusedIndex(null);
  }, []);

  const showOverlay =
    overlayMeasure !== null &&
    focusedIndex !== null &&
    (wpLoading || (wpSuggestions !== null && wpSuggestions.index === focusedIndex));

  return (
    <View style={s.section}>
      <Text style={s.sectionLabel}>Percorso</Text>

      {waypoints.map((wp, i) => {
        const inputValue = wpInputs[i] ?? "";
        const isFocused = focusedIndex === i;
        const showHint = isFocused && inputValue.length < 3;

        return (
          <View key={i} style={s.wpRow}>
            <View style={s.wpDot}>
              <View style={[s.wpDotInner, {
                backgroundColor: i === 0 ? "#22c55e" : i === waypoints.length - 1 ? colors.accentRed : colors.accent,
              }]} />
            </View>
            <View style={{ flex: 1 }}>
              <View style={s.inputWrapper}>
                <TextInput
                  ref={(ref) => { inputRefs.current[i] = ref; }}
                  style={[s.input, wp.lat !== 0 && { borderColor: "#22c55e55" }]}
                  value={inputValue}
                  onChangeText={(t) => onWpInputChange(t, i)}
                  placeholder={i === 0 ? "Partenza..." : i === waypoints.length - 1 ? "Arrivo..." : `Tappa ${i}...`}
                  placeholderTextColor={colors.textSecondary}
                  onFocus={() => handleFocus(i)}
                />
                {wpLoading && focusedIndex === i && (
                  <ActivityIndicator size="small" color={colors.accent} style={s.inputSpinner} />
                )}
              </View>
              {showHint && (
                <Text style={s.hint}>Digita almeno 3 caratteri per cercare</Text>
              )}
            </View>
            {waypoints.length > 2 && i > 0 && i < waypoints.length - 1 && (
              <Pressable onPress={() => onRemoveWaypoint(i)} hitSlop={10} style={{ padding: 4 }}>
                <Ionicons name="close-circle" size={20} color={colors.accentRed} />
              </Pressable>
            )}
          </View>
        );
      })}

      {showOverlay && overlayMeasure && (
        <Modal transparent animationType="none" visible statusBarTranslucent>
          <Pressable style={StyleSheet.absoluteFill} onPress={dismissOverlay} />
          <View
            style={[
              s.overlayPanel,
              {
                top: overlayMeasure.y + overlayMeasure.height + 4,
                left: overlayMeasure.x,
                width: overlayMeasure.width,
              },
            ]}
            pointerEvents="box-none"
          >
            {wpLoading && (
              <View style={s.overlayRow}>
                <ActivityIndicator size="small" color={colors.accent} />
                <Text style={s.overlayHintText}>Ricerca in corso…</Text>
              </View>
            )}
            {!wpLoading && wpSuggestions && wpSuggestions.results.length === 0 && (
              <View style={s.overlayRow}>
                <Ionicons name="search-outline" size={14} color={colors.textSecondary} />
                <Text style={s.overlayHintText}>Nessun risultato trovato</Text>
              </View>
            )}
            {!wpLoading && wpSuggestions && wpSuggestions.results.length > 0 && (
              <ScrollView
                keyboardShouldPersistTaps="handled"
                bounces={false}
                style={{ maxHeight: 220 }}
                showsVerticalScrollIndicator={false}
              >
                {wpSuggestions.results.map((geo, gi) => (
                  <Pressable
                    key={gi}
                    style={[s.suggestion, gi === wpSuggestions.results.length - 1 && { borderBottomWidth: 0 }]}
                    onPress={() => {
                      onSelectSuggestion(wpSuggestions.index, geo);
                      dismissOverlay();
                    }}
                  >
                    <Ionicons name="location-outline" size={14} color={colors.accent} />
                    <Text style={s.suggestionText} numberOfLines={2}>{geo.name}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            )}
          </View>
        </Modal>
      )}

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

const styles = (colors: ThemeColors) => StyleSheet.create({
  section: { marginBottom: 20 },
  sectionLabel: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: colors.textSecondary, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 },
  wpRow: { flexDirection: "row", alignItems: "flex-start", gap: 8, marginBottom: 8 },
  wpDot: { width: 12, alignItems: "center", paddingTop: 14 },
  wpDotInner: { width: 8, height: 8, borderRadius: 4 },
  inputWrapper: { position: "relative", flexDirection: "row", alignItems: "center" },
  input: { flex: 1, backgroundColor: colors.surface, borderRadius: 10, padding: 12, paddingRight: 40, fontFamily: "Inter_400Regular", fontSize: 15, color: colors.text, borderWidth: 1, borderColor: colors.border },
  inputSpinner: { position: "absolute", right: 12 },
  hint: { fontFamily: "Inter_400Regular", fontSize: 12, color: colors.textSecondary, marginTop: 4, paddingLeft: 2 },
  overlayPanel: {
    position: "absolute",
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
    zIndex: 999,
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12 },
      android: { elevation: 8 },
    }),
  },
  overlayRow: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12 },
  overlayHintText: { fontFamily: "Inter_400Regular", fontSize: 13, color: colors.textSecondary },
  suggestion: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  suggestionText: { fontFamily: "Inter_400Regular", fontSize: 13, color: colors.text, flex: 1 },
  addWpBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 10, paddingHorizontal: 12 },
  addWpText: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: colors.accent },
});
