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

interface WaypointsSectionProps {
  waypoints: Waypoint[];
  wpInputs: string[];
  wpSuggestions: { index: number; results: GeoResult[]; error?: boolean } | null;
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

  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const [fallbackVisible, setFallbackVisible] = useState(false);
  const [fallbackForIndex, setFallbackForIndex] = useState<number | null>(null);

  const handleFocus = useCallback((index: number) => {
    if (blurTimer.current) clearTimeout(blurTimer.current);
    setFocusedIndex(index);
  }, []);

  const handleBlur = useCallback(() => {
    blurTimer.current = setTimeout(() => {
      setFocusedIndex(null);
    }, 200);
  }, []);

  const handleSelect = useCallback((index: number, geo: GeoResult) => {
    if (blurTimer.current) clearTimeout(blurTimer.current);
    onSelectSuggestion(index, geo);
    setFocusedIndex(null);
    setFallbackVisible(false);
    setFallbackForIndex(null);
  }, [onSelectSuggestion]);

  const openSuggestionsFor = useCallback((index: number, inputText: string) => {
    if (blurTimer.current) clearTimeout(blurTimer.current);
    setFallbackForIndex(index);
    onWpInputChange(inputText, index);
    setFallbackVisible(true);
  }, [onWpInputChange]);

  return (
    <View style={s.section}>
      <Text style={s.sectionLabel}>Percorso</Text>

      {waypoints.map((wp, i) => {
        const inputValue = wpInputs[i] ?? "";
        const isFocused = focusedIndex === i;
        const showHint = isFocused && inputValue.length < 3;
        const hasSuggestions = wpSuggestions !== null && wpSuggestions.index === i && wpSuggestions.results.length > 0;
        const isLoading = wpLoading && isFocused;
        const showInlinePanel = isFocused && (isLoading || (wpSuggestions !== null && wpSuggestions.index === i));

        return (
          <View key={i} style={s.wpBlock}>
            <View style={s.wpRow}>
              <View style={s.wpDot}>
                <View style={[s.wpDotInner, {
                  backgroundColor: i === 0 ? "#22c55e" : i === waypoints.length - 1 ? colors.accentRed : colors.accent,
                }]} />
              </View>
              <View style={{ flex: 1 }}>
                <View style={s.inputWrapper}>
                  <TextInput
                    style={[s.input, wp.lat !== 0 && { borderColor: "#22c55e55" }]}
                    value={inputValue}
                    onChangeText={(t) => onWpInputChange(t, i)}
                    placeholder={i === 0 ? "Partenza..." : i === waypoints.length - 1 ? "Arrivo..." : `Tappa ${i}...`}
                    placeholderTextColor={colors.textSecondary}
                    onFocus={() => handleFocus(i)}
                    onBlur={handleBlur}
                  />
                  {isLoading && (
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

            {wpInputs[i]?.length >= 3 && waypoints[i].lat === 0 && (
              <Pressable
                style={s.persistentSuggestBtn}
                onPress={() => openSuggestionsFor(i, wpInputs[i])}
              >
                <Text style={s.persistentSuggestBtnText}>📍 Suggerimenti</Text>
              </Pressable>
            )}

            {showInlinePanel && (
              <View style={s.inlinePanel}>
                {isLoading && (
                  <View style={s.panelRow}>
                    <ActivityIndicator size="small" color={colors.accent} />
                    <Text style={s.panelHintText}>Ricerca in corso…</Text>
                  </View>
                )}
                {!isLoading && wpSuggestions && wpSuggestions.index === i && wpSuggestions.results.length === 0 && (
                  <View style={s.panelRow}>
                    <Ionicons
                      name={wpSuggestions.error ? "cloud-offline-outline" : "search-outline"}
                      size={14}
                      color={wpSuggestions.error ? colors.accentRed : colors.textSecondary}
                    />
                    <Text style={[s.panelHintText, wpSuggestions.error && { color: colors.accentRed }]}>
                      {wpSuggestions.error ? "Impossibile raggiungere il server, controlla la connessione" : "Nessun risultato trovato"}
                    </Text>
                  </View>
                )}
                {!isLoading && hasSuggestions && wpSuggestions && (
                  <>
                    {wpSuggestions.results.slice(0, 5).map((geo, gi) => (
                      <Pressable
                        key={gi}
                        style={[s.suggestion, gi === Math.min(wpSuggestions.results.length, 5) - 1 && wpSuggestions.results.length <= 5 && { borderBottomWidth: 0 }]}
                        onPress={() => handleSelect(wpSuggestions.index, geo)}
                      >
                        <Ionicons name="location-outline" size={14} color={colors.accent} />
                        <Text style={s.suggestionText} numberOfLines={2}>{geo.name}</Text>
                      </Pressable>
                    ))}
                    <Pressable
                      style={s.fallbackInlineBtn}
                      onPress={() => {
                        if (blurTimer.current) clearTimeout(blurTimer.current);
                        setFallbackForIndex(i);
                        setFallbackVisible(true);
                      }}
                    >
                      <Ionicons name="location" size={13} color={colors.accent} />
                      <Text style={s.fallbackInlineBtnText}>
                        {wpSuggestions.results.length > 5
                          ? `Vedi tutti i suggerimenti (${wpSuggestions.results.length})`
                          : "📍 Non vedi i risultati? Apri lista"}
                      </Text>
                    </Pressable>
                  </>
                )}
              </View>
            )}
          </View>
        );
      })}

      <Modal
        transparent
        animationType="slide"
        visible={fallbackVisible}
        onRequestClose={() => { setFallbackVisible(false); setFallbackForIndex(null); }}
        statusBarTranslucent
      >
        <Pressable style={s.modalBackdrop} onPress={() => { setFallbackVisible(false); setFallbackForIndex(null); }} />
        <View style={s.modalSheet}>
          <View style={s.modalHandle} />
          <Text style={s.modalTitle}>Seleziona un luogo</Text>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            bounces={false}
            showsVerticalScrollIndicator={false}
          >
            {wpLoading && fallbackForIndex !== null && (
              <View style={s.panelRow}>
                <ActivityIndicator size="small" color={colors.accent} />
                <Text style={s.panelHintText}>Ricerca in corso…</Text>
              </View>
            )}
            {wpSuggestions && (fallbackForIndex === null || wpSuggestions.index === fallbackForIndex) && wpSuggestions.results.map((geo, gi) => (
              <Pressable
                key={gi}
                style={[s.suggestion, gi === (wpSuggestions?.results.length ?? 0) - 1 && { borderBottomWidth: 0 }]}
                onPress={() => handleSelect(wpSuggestions.index, geo)}
              >
                <Ionicons name="location-outline" size={16} color={colors.accent} />
                <Text style={s.suggestionText} numberOfLines={2}>{geo.name}</Text>
              </Pressable>
            ))}
            {wpSuggestions && (fallbackForIndex === null || wpSuggestions.index === fallbackForIndex) && !wpLoading && wpSuggestions.results.length === 0 && (
              <View style={s.panelRow}>
                <Ionicons
                  name={wpSuggestions.error ? "cloud-offline-outline" : "search-outline"}
                  size={14}
                  color={wpSuggestions.error ? colors.accentRed : colors.textSecondary}
                />
                <Text style={[s.panelHintText, wpSuggestions.error && { color: colors.accentRed }]}>
                  {wpSuggestions.error ? "Impossibile raggiungere il server, controlla la connessione" : "Nessun risultato trovato"}
                </Text>
              </View>
            )}
          </ScrollView>
        </View>
      </Modal>

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
  wpBlock: { marginBottom: 4 },
  wpRow: { flexDirection: "row", alignItems: "flex-start", gap: 8, marginBottom: 0 },
  wpDot: { width: 12, alignItems: "center", paddingTop: 14 },
  wpDotInner: { width: 8, height: 8, borderRadius: 4 },
  inputWrapper: { position: "relative", flexDirection: "row", alignItems: "center" },
  input: { flex: 1, backgroundColor: colors.surface, borderRadius: 10, padding: 12, paddingRight: 40, fontFamily: "Inter_400Regular", fontSize: 15, color: colors.text, borderWidth: 1, borderColor: colors.border },
  inputSpinner: { position: "absolute", right: 12 },
  hint: { fontFamily: "Inter_400Regular", fontSize: 12, color: colors.textSecondary, marginTop: 4, paddingLeft: 2 },
  inlinePanel: {
    marginLeft: 20,
    marginTop: 4,
    marginBottom: 4,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12 },
      android: { elevation: 4 },
    }),
  },
  panelRow: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12 },
  panelHintText: { fontFamily: "Inter_400Regular", fontSize: 13, color: colors.textSecondary },
  suggestion: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  suggestionText: { fontFamily: "Inter_400Regular", fontSize: 13, color: colors.text, flex: 1 },
  fallbackInlineBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  fallbackInlineBtnText: { fontFamily: "Inter_400Regular", fontSize: 12, color: colors.accent, flex: 1 },
  persistentSuggestBtn: {
    marginLeft: 20,
    marginTop: 4,
    marginBottom: 4,
    alignSelf: "flex-start",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.accent,
    backgroundColor: colors.surface,
  },
  persistentSuggestBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 12, color: colors.accent },
  addWpBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 10, paddingHorizontal: 12 },
  addWpText: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: colors.accent },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)" },
  modalSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "70%",
    paddingTop: 12,
    paddingBottom: Platform.OS === "ios" ? 34 : 20,
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.12, shadowRadius: 16 },
      android: { elevation: 12 },
    }),
  },
  modalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: "center", marginBottom: 12 },
  modalTitle: { fontFamily: "Inter_600SemiBold", fontSize: 16, color: colors.text, marginBottom: 8, paddingHorizontal: 16 },
});
