// Task #2698 — Onboarding tour minimale (slide tap-through). Salva flag in
// AsyncStorage. Richiamabile via action "start-onboarding-tour".
// NOTE: usa View+absoluteFillObject invece di Modal per evitare il crash
// "Maximum update depth exceeded" su Android. Modal cambia i system insets
// (status/nav bar animano) → SafeAreaProvider aggiorna → cascade setOptions
// React Navigation su tutti i Tabs.Screen → loop. View overlay NON tocca il
// system UI → nessun trigger insets → crash strutturalmente impossibile.
import React, { useEffect, useRef, useState } from "react";
import { View, Text, Pressable, StyleSheet, Animated, InteractionManager } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { useT } from "@/lib/language-context";
import { useAssistantEnabled } from "@/hooks/useAssistantEnabled";
import { markOnboardingShown, wasOnboardingShown } from "@/lib/ai-assistant/client-actions";
import { logAssistantClientEvent } from "@/lib/ai-assistant/telemetry-client";

const STEPS = [
  { titleKey: "aiAssistant.tour.step1.title", bodyKey: "aiAssistant.tour.step1.body",
    titleFallback: "Benvenuto su BikerLink", bodyFallback: "Ciao, sono Bowie, il tuo assistente virtuale: ti aiuto a navigare l'app e svolgere piccole azioni." },
  { titleKey: "aiAssistant.tour.step2.title", bodyKey: "aiAssistant.tour.step2.body",
    titleFallback: "Mappa & Match", bodyFallback: "Sulla mappa vedi i biker compatibili. Tocca un marker per vedere il profilo." },
  { titleKey: "aiAssistant.tour.step3.title", bodyKey: "aiAssistant.tour.step3.body",
    titleFallback: "Privacy", bodyFallback: "Da Profilo › Privacy puoi gestire fake position, ghost mode e visibilità." },
  { titleKey: "aiAssistant.tour.step4.title", bodyKey: "aiAssistant.tour.step4.body",
    titleFallback: "Chiedimi", bodyFallback: "Tocca il pulsante di Bowie in basso a sinistra per chiedermi qualsiasi cosa." },
];

export default function AssistantOnboardingTour() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const t = useT();
  const { onboardingEnabled } = useAssistantEnabled();
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!onboardingEnabled) return;
    let cancelled = false;
    void (async () => {
      const shown = await wasOnboardingShown();
      if (cancelled || shown) return;
      // Marca PRIMA di mostrare: se l'app crasha mentre il tour è visibile,
      // al prossimo boot il flag è già settato e il tour non ricompare (no vicious cycle).
      await markOnboardingShown();
      if (cancelled) return;
      InteractionManager.runAfterInteractions(() => {
        if (!cancelled) {
          setVisible(true);
          Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }).start();
          void logAssistantClientEvent("onboarding_started");
        }
      });
    })();
    return () => { cancelled = true; };
  }, [onboardingEnabled, fadeAnim]);

  if (!visible) return null;

  const close = async () => {
    Animated.timing(fadeAnim, { toValue: 0, duration: 150, useNativeDriver: true }).start(() => {
      setVisible(false);
    });
    await logAssistantClientEvent("onboarding_completed", { stepReached: step });
  };

  const cur = STEPS[step];
  const isLast = step === STEPS.length - 1;

  return (
    <Animated.View
      style={[StyleSheet.absoluteFill, styles.overlay, { opacity: fadeAnim, paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}
    >
      <View style={[styles.card, { backgroundColor: colors.surface }]} testID="assistant-onboarding-card">
        <View style={styles.headRow}>
          <Ionicons name="sparkles" size={22} color={colors.primary} />
          <Text style={[styles.stepBadge, { color: colors.textMuted ?? colors.textSecondary }]}>
            {step + 1}/{STEPS.length}
          </Text>
          <Pressable testID="assistant-onboarding-skip" onPress={close} hitSlop={10}>
            <Ionicons name="close" size={22} color={colors.text} />
          </Pressable>
        </View>
        <Text style={[styles.title, { color: colors.text }]}>{t(cur.titleKey) || cur.titleFallback}</Text>
        <Text style={[styles.body, { color: colors.text }]}>{t(cur.bodyKey) || cur.bodyFallback}</Text>
        <View style={styles.row}>
          {step > 0 && (
            <Pressable
              testID="assistant-onboarding-back"
              onPress={() => setStep(step - 1)}
              style={[styles.btnSecondary, { borderColor: colors.border }]}
            >
              <Text style={{ color: colors.text }}>{t("common.assistantBack") || "Indietro"}</Text>
            </Pressable>
          )}
          <Pressable
            testID="assistant-onboarding-next"
            onPress={() => isLast ? close() : setStep(step + 1)}
            style={[styles.btnPrimary, { backgroundColor: colors.primary }]}
          >
            <Text style={{ color: "#FFFFFF", fontWeight: "600" }}>
              {isLast ? (t("common.assistantDone") || "Inizia") : (t("common.assistantNext") || "Avanti")}
            </Text>
          </Pressable>
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: { backgroundColor: "rgba(0,0,0,0.6)", padding: 24, justifyContent: "center", zIndex: 9999 },
  card: { borderRadius: 16, padding: 20, gap: 12 },
  headRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  stepBadge: { flex: 1, fontSize: 12 },
  title: { fontSize: 20, fontWeight: "700" },
  body: { fontSize: 15, lineHeight: 21 },
  row: { flexDirection: "row", gap: 12, justifyContent: "flex-end", marginTop: 8 },
  btnPrimary: { paddingVertical: 10, paddingHorizontal: 18, borderRadius: 10 },
  btnSecondary: { paddingVertical: 10, paddingHorizontal: 18, borderRadius: 10, borderWidth: 1 },
});
