// Task #2645 — Tour di 3 step al primo accesso a AI Console.
import React, { useState } from "react";
import { Modal, View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";

interface Props {
  visible: boolean;
  onDone: () => void;
}

const STEPS: Array<{ icon: keyof typeof Ionicons.glyphMap; title: string; body: string }> = [
  {
    icon: "chatbubble-ellipses",
    title: "Parla con l'AI",
    body: "Scrivi domande tecniche operative: stato sistema, report sospetti, anomalie, integrità DB. L'AI risponde con scope multipli e cita le entità.",
  },
  {
    icon: "list-circle",
    title: "Azioni proposte",
    body: "Nella colonna destra trovi la coda azioni da confermare. Niente viene eseguito senza il tuo OK — human-in-the-loop sempre attivo.",
  },
  {
    icon: "bookmark",
    title: "Knowledge base",
    body: "Pinna le risposte utili: diventano note condivise tra admin in 'Insight Pinnati'. Tap sull'icona bookmark accanto a un messaggio.",
  },
];

export default function OnboardingTour({ visible, onDone }: Props) {
  const colors = useColors();
  const [step, setStep] = useState(0);

  if (!visible) return null;
  const cur = STEPS[step];
  const isLast = step === STEPS.length - 1;

  return (
    <Modal visible animationType="fade" transparent onRequestClose={onDone}>
      <View style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={[styles.iconWrap, { backgroundColor: colors.accent }]}>
            <Ionicons name={cur.icon} size={32} color="#fff" />
          </View>
          <Text style={[styles.title, { color: colors.text }]}>{cur.title}</Text>
          <Text style={[styles.body, { color: colors.textSecondary }]}>{cur.body}</Text>

          <View style={styles.dots}>
            {STEPS.map((_, i) => (
              <View
                key={i}
                style={[
                  styles.dot,
                  { backgroundColor: i === step ? colors.accent : colors.border },
                ]}
              />
            ))}
          </View>

          <View style={styles.actions}>
            <TouchableOpacity onPress={onDone} style={styles.skipBtn}>
              <Text style={[styles.skipTxt, { color: colors.textSecondary }]}>Salta</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => (isLast ? onDone() : setStep(step + 1))}
              style={[styles.nextBtn, { backgroundColor: colors.accent }]}
            >
              <Text style={styles.nextTxt}>{isLast ? "Inizia" : "Avanti"}</Text>
              <Ionicons name={isLast ? "checkmark" : "arrow-forward"} size={16} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center", padding: 20 },
  card: { width: "100%", maxWidth: 380, padding: 24, borderRadius: 16, borderWidth: 1, alignItems: "center", gap: 12 },
  iconWrap: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center" },
  title: { fontFamily: "Inter_700Bold", fontSize: 18, textAlign: "center" },
  body: { fontFamily: "Inter_400Regular", fontSize: 13, lineHeight: 19, textAlign: "center" },
  dots: { flexDirection: "row", gap: 6, marginVertical: 8 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  actions: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", width: "100%", marginTop: 8 },
  skipBtn: { paddingVertical: 8, paddingHorizontal: 12 },
  skipTxt: { fontFamily: "Inter_500Medium", fontSize: 13 },
  nextBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 10, paddingHorizontal: 18, borderRadius: 22 },
  nextTxt: { color: "#fff", fontFamily: "Inter_700Bold", fontSize: 13 },
});
