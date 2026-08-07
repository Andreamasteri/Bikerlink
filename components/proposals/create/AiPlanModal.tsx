import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
  Alert,
  Platform,
  StyleSheet,
} from "react-native";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { getApiUrl } from "@/lib/query-client";
import { useWhisperRecorder } from "@/hooks/useWhisperRecorder";
import { t } from "@/lib/i18n";

type RouteStyle = "curvy" | "balanced" | "fast";
type GeoCandidate = { lat: number; lng: number; name: string };
type PlanLocation = {
  role: "departure" | "stop" | "destination";
  query: string;
  candidates: GeoCandidate[];
  selectedIndex: number | null;
};

export interface AiRouteResult {
  departure: GeoCandidate;
  stops: string[];
  destination: GeoCandidate | null;
  schedule?: {
    departureDate?: string | null;
    departureTime?: string | null;
    returnDate?: string | null;
    returnTime?: string | null;
  } | null;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  onRouteReady: (result: AiRouteResult) => void;
}

const STYLES: { key: RouteStyle; label: string }[] = [
  { key: "curvy", label: "Curvy" },
  { key: "balanced", label: "Bilanciato" },
  { key: "fast", label: "Veloce" },
];

async function geocodeViaServer(q: string): Promise<GeoCandidate[]> {
  try {
    const url = new URL("/api/planned-routes/geocode", getApiUrl());
    url.searchParams.set("q", q);
    const res = await fetch(url.toString(), { credentials: "include" });
    if (!res.ok) return [];
    const data = await res.json() as Array<{ lat?: string | number; lng?: string | number; lon?: string | number; name?: string }>;
    if (!Array.isArray(data)) return [];
    return data
      .map((item) => ({
        lat: Number.parseFloat(String(item.lat)),
        lng: Number.parseFloat(String(item.lng ?? item.lon)),
        name: item.name || q,
      }))
      .filter((item) => Number.isFinite(item.lat) && Number.isFinite(item.lng));
  } catch {
    return [];
  }
}

export const AiPlanModal = ({ visible, onClose, onRouteReady }: Props) => {
  const insets = useSafeAreaInsets();
  const [prompt, setPrompt] = useState("");
  const [selectedStyle, setSelectedStyle] = useState<RouteStyle>("curvy");
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState("");
  const [plannedLocations, setPlannedLocations] = useState<PlanLocation[] | null>(null);
  const [plannedRoundTrip, setPlannedRoundTrip] = useState(false);
  const [plannedSchedule, setPlannedSchedule] = useState<AiRouteResult["schedule"]>(null);

  const whisper = useWhisperRecorder();
  const micAvailable = Platform.OS !== "web" && whisper.error !== "Permesso microfono negato";

  const closeModal = () => {
    if (loading) return;
    setPlannedLocations(null);
    setPlannedSchedule(null);
    onClose();
  };

  const handleMicPress = async () => {
    if (whisper.recording) {
      const text = await whisper.stopAndTranscribe();
      if (text === null) {
        Alert.alert(t("aiPlan.mic.errorMic"), whisper.error || t("aiPlan.mic.noAudio"));
      } else if (text.trim().length === 0) {
        Alert.alert(t("aiPlan.mic.noAudio"), "");
      } else {
        setPrompt((prev) => (prev.trim() ? prev.trim() + " " + text.trim() : text.trim()));
      }
    } else {
      await whisper.startRecording();
    }
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      Alert.alert("Errore", "Descrivi il giro che vuoi fare");
      return;
    }
    setLoading(true);
    try {
      setStep("Analisi AI in corso…");
      const aiUrl = new URL("/api/planned-routes/ai-parse", getApiUrl());
      const aiRes = await fetch(aiUrl.toString(), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: prompt.trim() + ". Stile preferito: " + selectedStyle + ".",
          clientDate: new Date().toISOString().slice(0, 10),
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Rome",
        }),
      });
      if (!aiRes.ok) {
        const err = await aiRes.json().catch(() => ({}));
        throw new Error((err as { message?: string }).message || "Servizio AI non disponibile");
      }
      const aiData = await aiRes.json();

      setStep("Geocoding delle tappe…");
      const sources: Array<{ role: PlanLocation["role"]; query: string }> = [];
      if (typeof aiData.startLocation === "string" && aiData.startLocation.trim()) {
        sources.push({ role: "departure", query: aiData.startLocation.trim() });
      }
      if (Array.isArray(aiData.waypoints)) {
        for (const waypoint of aiData.waypoints) {
          if (typeof waypoint === "string" && waypoint.trim()) {
            sources.push({ role: "stop", query: waypoint.trim() });
          }
        }
      }
      const startQuery = typeof aiData.startLocation === "string" ? aiData.startLocation.trim() : "";
      const endQuery = typeof aiData.endLocation === "string" ? aiData.endLocation.trim() : "";
      const hasDistinctDestination = !!endQuery && endQuery.toLowerCase() !== startQuery.toLowerCase();
      if (hasDistinctDestination) {
        sources.push({ role: "destination", query: endQuery });
      }

      const candidates = await Promise.all(sources.map((source) => geocodeViaServer(source.query)));
      if (sources.length === 0 || candidates.every((items) => items.length === 0)) {
        throw new Error("Non è stato possibile localizzare i luoghi. Prova con indirizzi più specifici.");
      }

      setPlannedLocations(sources.map((source, index) => ({
        ...source,
        candidates: candidates[index],
        selectedIndex: candidates[index].length === 1 ? 0 : null,
      })));
      setPlannedRoundTrip(aiData.isRoundTrip === true && !hasDistinctDestination);
      setPlannedSchedule(aiData.schedule ?? null);
    } catch (err: unknown) {
      Alert.alert("Errore pianificazione", err instanceof Error ? err.message : "Errore durante la pianificazione AI");
    } finally {
      setLoading(false);
      setStep("");
    }
  };

  const handleConfirm = () => {
    if (!plannedLocations) return;
    const missing = plannedLocations.find((location) => location.candidates.length === 0 || location.selectedIndex === null);
    if (missing) {
      Alert.alert("Selezione incompleta", "Seleziona un indirizzo per: " + missing.query);
      return;
    }
    const selected = plannedLocations.map((location) => location.candidates[location.selectedIndex!]);
    const departure = selected[0];
    const hasDestination = !plannedRoundTrip &&
      selected.length > 1 &&
      plannedLocations[plannedLocations.length - 1].role === "destination";
    const destination = hasDestination ? selected[selected.length - 1] : null;
    const stops = hasDestination
      ? selected.slice(1, -1).map((item) => item.name)
      : selected.slice(1).map((item) => item.name);
    onRouteReady({ departure, stops, destination, schedule: plannedSchedule });
    setPrompt("");
    setPlannedLocations(null);
    setPlannedSchedule(null);
    onClose();
  };

  const allLocationsSelected = plannedLocations?.every(
    (location) => location.candidates.length > 0 && location.selectedIndex !== null
  ) ?? false;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="formSheet"
      onRequestClose={closeModal}
    >
      <View style={[styles.container, { paddingTop: insets.top || 16 }]}>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <MaterialCommunityIcons name="robot" size={22} color={Colors.accent} />
            <Text style={styles.title}>Pianifica AI</Text>
          </View>
          <TouchableOpacity onPress={closeModal} disabled={loading} hitSlop={12}>
            <MaterialCommunityIcons name="close" size={24} color={Colors.text} />
          </TouchableOpacity>
        </View>

        <KeyboardAwareScrollViewCompat
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
          keyboardShouldPersistTaps="handled"
          bottomOffset={20}
        >
          <Text style={styles.label}>Descrivi il giro</Text>
          <View style={styles.inputRow}>
            <TextInput
              style={[styles.input, styles.textArea, styles.inputFlex]}
              value={prompt}
              onChangeText={setPrompt}
              placeholder={"Es: parti da Padova centro domani alle 10 e rientra a Mira alle 21"}
              placeholderTextColor={Colors.textSecondary}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
              editable={!loading && !whisper.transcribing && !plannedLocations}
            />
            {micAvailable && (
              <TouchableOpacity
                style={[styles.micBtn, whisper.recording && styles.micBtnActive]}
                onPress={handleMicPress}
                disabled={loading || whisper.transcribing || !!plannedLocations}
                hitSlop={8}
              >
                {whisper.transcribing ? (
                  <ActivityIndicator size="small" color={Colors.accent} />
                ) : (
                  <MaterialCommunityIcons
                    name={whisper.recording ? "microphone" : "microphone-outline"}
                    size={24}
                    color={whisper.recording ? Colors.accent : Colors.textSecondary}
                  />
                )}
              </TouchableOpacity>
            )}
          </View>
          {whisper.recording && <Text style={styles.micStatus}>{t("aiPlan.mic.recording")}</Text>}
          {whisper.transcribing && <Text style={styles.micStatus}>{t("aiPlan.mic.transcribing")}</Text>}

          <Text style={styles.label}>Stile di guida</Text>
          <View style={styles.styleRow}>
            {STYLES.map((style) => (
              <TouchableOpacity
                key={style.key}
                style={[styles.stylePill, selectedStyle === style.key && styles.stylePillActive]}
                onPress={() => setSelectedStyle(style.key)}
                disabled={loading || !!plannedLocations}
              >
                <Text style={[styles.stylePillText, selectedStyle === style.key && styles.stylePillTextActive]}>
                  {style.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {loading && (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color={Colors.accent} />
              <Text style={styles.loadingText}>{step}</Text>
            </View>
          )}

          {plannedLocations && (
            <View style={styles.preview}>
              <Text style={styles.previewTitle}>Scegli partenza, tappe e arrivo</Text>
              <Text style={styles.previewHint}>Se ci sono più corrispondenze, seleziona il punto corretto prima di continuare.</Text>
              {plannedLocations.map((location, locationIndex) => (
                <View key={location.role + "-" + locationIndex} style={styles.locationCard}>
                  <Text style={styles.locationLabel}>
                    {location.role === "departure"
                      ? "Partenza"
                      : location.role === "destination"
                        ? "Arrivo"
                        : "Tappa " + locationIndex}
                  </Text>
                  <Text style={styles.queryText}>{location.query}</Text>
                  {location.candidates.length === 0 ? (
                    <Text style={styles.noResult}>Nessun risultato: modifica la richiesta e riprova.</Text>
                  ) : (
                    location.candidates.map((candidate, candidateIndex) => (
                      <TouchableOpacity
                        key={candidate.name + "-" + candidate.lat + "-" + candidate.lng}
                        style={[
                          styles.candidate,
                          location.selectedIndex === candidateIndex && styles.candidateSelected,
                        ]}
                        onPress={() => setPlannedLocations((current) => current?.map((item, index) =>
                          index === locationIndex ? { ...item, selectedIndex: candidateIndex } : item
                        ) || null)}
                        disabled={loading}
                      >
                        <MaterialCommunityIcons
                          name={location.selectedIndex === candidateIndex ? "radiobox-marked" : "radiobox-blank"}
                          size={20}
                          color={location.selectedIndex === candidateIndex ? Colors.accent : Colors.textSecondary}
                        />
                        <Text style={styles.candidateText} numberOfLines={2}>{candidate.name}</Text>
                      </TouchableOpacity>
                    ))
                  )}
                </View>
              ))}
              <TouchableOpacity
                style={[styles.confirmBtn, !allLocationsSelected && styles.disabledBtn]}
                onPress={handleConfirm}
                disabled={!allLocationsSelected}
              >
                <MaterialCommunityIcons name="check" size={20} color={allLocationsSelected ? "#000" : Colors.textSecondary} />
                <Text style={[styles.confirmBtnText, !allLocationsSelected && styles.disabledText]}>
                  Usa questi punti
                </Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.retryBtn} onPress={() => setPlannedLocations(null)} disabled={loading}>
                <Text style={styles.retryText}>Modifica richiesta</Text>
              </TouchableOpacity>
            </View>
          )}

          {!plannedLocations && (
            <TouchableOpacity
              style={[styles.generateBtn, (loading || whisper.recording || whisper.transcribing) && styles.generateBtnDisabled]}
              onPress={handleGenerate}
              disabled={loading || whisper.recording || whisper.transcribing}
            >
              {loading ? <ActivityIndicator size="small" color="#000" /> : <MaterialCommunityIcons name="robot" size={20} color="#000" />}
              <Text style={styles.generateBtnText}>Genera percorso</Text>
            </TouchableOpacity>
          )}

          <Text style={styles.hint}>
            L'AI analizzerà richiesta, indirizzi e orari. Prima di caricare la proposta dovrai confermare i punti trovati.
          </Text>
        </KeyboardAwareScrollViewCompat>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
  title: { fontSize: 18, fontWeight: "700", color: Colors.text },
  content: { padding: 20, gap: 0 },
  label: { fontSize: 14, fontWeight: "600", color: Colors.text, marginTop: 16, marginBottom: 8 },
  input: { backgroundColor: Colors.surface, borderRadius: 12, padding: 14, color: Colors.text, fontSize: 15, borderWidth: 1, borderColor: Colors.border },
  textArea: { minHeight: 100, textAlignVertical: "top" },
  styleRow: { flexDirection: "row", gap: 10 },
  stylePill: { flex: 1, paddingVertical: 10, borderRadius: 10, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, alignItems: "center" },
  stylePillActive: { backgroundColor: Colors.accent + "25", borderColor: Colors.accent },
  stylePillText: { fontSize: 14, fontWeight: "600", color: Colors.textSecondary },
  stylePillTextActive: { color: Colors.accent },
  loadingRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 16, paddingVertical: 10 },
  loadingText: { fontSize: 14, color: Colors.textSecondary },
  preview: { marginTop: 20, gap: 10 },
  previewTitle: { fontSize: 16, fontWeight: "700", color: Colors.text },
  previewHint: { fontSize: 13, color: Colors.textSecondary, lineHeight: 18 },
  locationCard: { backgroundColor: Colors.surface, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: Colors.border, gap: 6 },
  locationLabel: { fontSize: 14, fontWeight: "700", color: Colors.accent },
  queryText: { fontSize: 13, color: Colors.textSecondary },
  candidate: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 9, paddingHorizontal: 8, borderRadius: 8, borderWidth: 1, borderColor: Colors.border },
  candidateSelected: { borderColor: Colors.accent, backgroundColor: Colors.accent + "18" },
  candidateText: { flex: 1, color: Colors.text, fontSize: 13 },
  noResult: { color: "#e57373", fontSize: 13, lineHeight: 18 },
  confirmBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: Colors.accent, borderRadius: 12, paddingVertical: 14, marginTop: 6 },
  disabledBtn: { backgroundColor: Colors.surface, opacity: 0.65 },
  confirmBtnText: { fontSize: 16, fontWeight: "700", color: "#000" },
  disabledText: { color: Colors.textSecondary },
  retryBtn: { alignItems: "center", paddingVertical: 10 },
  retryText: { color: Colors.accent, fontSize: 14, fontWeight: "600" },
  generateBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", backgroundColor: Colors.accent, borderRadius: 12, paddingVertical: 14, marginTop: 20, gap: 8 },
  generateBtnDisabled: { opacity: 0.6 },
  generateBtnText: { fontSize: 16, fontWeight: "700", color: "#000" },
  hint: { fontSize: 12, color: Colors.textSecondary, marginTop: 14, lineHeight: 18, textAlign: "center" },
  inputRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  inputFlex: { flex: 1 },
  micBtn: { width: 44, height: 44, borderRadius: 10, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, alignItems: "center", justifyContent: "center" },
  micBtnActive: { borderColor: Colors.accent, backgroundColor: Colors.accent + "18" },
  micStatus: { fontSize: 12, color: Colors.accent, marginTop: 6 },
});
