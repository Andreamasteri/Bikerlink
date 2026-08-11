import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
  Alert,
  StyleSheet,
} from "react-native";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { getApiUrl } from "@/lib/query-client";

type RouteStyle = "curvy" | "balanced" | "fast";

export interface AiRouteResult {
  departure: { lat: number; lng: number; name: string };
  stops: string[];
  destination: { lat: number; lng: number; name: string } | null;
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

async function geocodeViaServer(
  q: string
): Promise<{ lat: number; lng: number; name: string } | null> {
  try {
    const url = new URL("/api/planned-routes/geocode", getApiUrl());
    url.searchParams.set("q", q);
    const res = await fetch(url.toString(), { credentials: "include" });
    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) return null;
    const first = data[0];
    return {
      lat: parseFloat(first.lat),
      lng: parseFloat(first.lng ?? first.lon),
      name: first.name || q,
    };
  } catch {
    return null;
  }
}

export const AiPlanModal = ({ visible, onClose, onRouteReady }: Props) => {
  const insets = useSafeAreaInsets();
  const [prompt, setPrompt] = useState("");
  const [selectedStyle, setSelectedStyle] = useState<RouteStyle>("curvy");
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState("");

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
          prompt: `${prompt.trim()}. Stile preferito: ${selectedStyle}.`,
        }),
      });
      if (!aiRes.ok) {
        const err = await aiRes.json().catch(() => ({}));
        throw new Error(
          (err as { message?: string }).message || "Servizio AI non disponibile"
        );
      }
      const aiData = await aiRes.json();

      setStep("Geocoding delle tappe…");
      const locationsToGeocode: string[] = [
        aiData.startLocation,
        ...(Array.isArray(aiData.waypoints) ? aiData.waypoints : []),
        aiData.isRoundTrip ? null : aiData.endLocation,
      ].filter((l): l is string => typeof l === "string" && l.trim().length > 0);

      const geocoded = await Promise.all(
        locationsToGeocode.map((loc) => geocodeViaServer(loc))
      );
      const valid = geocoded.filter(
        (g): g is NonNullable<typeof g> => g !== null
      );

      if (valid.length < 1) {
        throw new Error(
          "Non è stato possibile localizzare nessun luogo. Prova con una descrizione più specifica."
        );
      }

      const departure = valid[0];
      const hasDestination = valid.length > 1 && !aiData.isRoundTrip;
      const destination = hasDestination ? valid[valid.length - 1] : null;
      const intermediates = hasDestination ? valid.slice(1, -1) : valid.slice(1);
      const stops = intermediates.map((g) => g.name);

      onRouteReady({ departure, stops, destination });
      setPrompt("");
      onClose();
    } catch (err: unknown) {
      Alert.alert(
        "Errore pianificazione",
        (err as Error).message || "Errore durante la pianificazione AI"
      );
    } finally {
      setLoading(false);
      setStep("");
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="formSheet"
      onRequestClose={() => !loading && onClose()}
    >
      <View style={[styles.container, { paddingTop: insets.top || 16 }]}>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <MaterialCommunityIcons name="robot" size={22} color={Colors.accent} />
            <Text style={styles.title}>Pianifica AI</Text>
          </View>
          <TouchableOpacity onPress={onClose} disabled={loading} hitSlop={12}>
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
              placeholder={"Es: strade curve nelle Dolomiti, circa 150 km,\nevita autostrade, voglio passare da Cortina"}
              placeholderTextColor={Colors.textSecondary}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
              editable={!loading}
            />
          </View>
          <Text style={styles.label}>Stile di guida</Text>
          <View style={styles.styleRow}>
            {STYLES.map((s) => (
              <TouchableOpacity
                key={s.key}
                style={[
                  styles.stylePill,
                  selectedStyle === s.key && styles.stylePillActive,
                ]}
                onPress={() => setSelectedStyle(s.key)}
                disabled={loading}
              >
                <Text
                  style={[
                    styles.stylePillText,
                    selectedStyle === s.key && styles.stylePillTextActive,
                  ]}
                >
                  {s.label}
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

          <TouchableOpacity
            style={[styles.generateBtn, loading && styles.generateBtnDisabled]}
            onPress={handleGenerate}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#000" />
            ) : (
              <MaterialCommunityIcons name="robot" size={20} color="#000" />
            )}
            <Text style={styles.generateBtnText}>Genera percorso</Text>
          </TouchableOpacity>

          <Text style={styles.hint}>
            L'AI analizzerà la tua richiesta, individuerà le tappe e calcolerà il
            percorso. I dati verranno caricati automaticamente nella proposta.
          </Text>
        </KeyboardAwareScrollViewCompat>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: Colors.text,
  },
  content: {
    padding: 20,
    gap: 0,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.text,
    marginTop: 16,
    marginBottom: 8,
  },
  input: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 14,
    color: Colors.text,
    fontSize: 15,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  textArea: {
    minHeight: 100,
    textAlignVertical: "top",
  },
  styleRow: {
    flexDirection: "row",
    gap: 10,
  },
  stylePill: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: "center",
  },
  stylePillActive: {
    backgroundColor: Colors.accent + "25",
    borderColor: Colors.accent,
  },
  stylePillText: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.textSecondary,
  },
  stylePillTextActive: {
    color: Colors.accent,
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 16,
    paddingVertical: 10,
  },
  loadingText: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  generateBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.accent,
    borderRadius: 12,
    paddingVertical: 14,
    marginTop: 20,
    gap: 8,
  },
  generateBtnDisabled: {
    opacity: 0.6,
  },
  generateBtnText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#000",
  },
  hint: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 14,
    lineHeight: 18,
    textAlign: "center",
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  inputFlex: {
    flex: 1,
  },
  micBtn: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 0,
  },
  micBtnActive: {
    borderColor: Colors.accent,
    backgroundColor: Colors.accent + "18",
  },
  micStatus: {
    fontSize: 12,
    color: Colors.accent,
    marginTop: 6,
  },
});
