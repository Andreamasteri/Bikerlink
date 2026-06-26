// Task #4979 — UI del BootGate, PROVIDER-FREE.
//
// Non usa nessun context dell'app (niente useColors/useTheme/useLanguage): i colori
// sono hardcoded scuri e SafeAreaView viene da react-native (non da
// safe-area-context, che richiederebbe un provider). Così questa schermata può
// renderizzare anche quando ZERO provider sono montati — è il suo scopo: restare
// visibile mentre si bisezione quale provider crasha.
import React from "react";
import {
  SafeAreaView,
  View,
  Text,
  Pressable,
  FlatList,
  ActivityIndicator,
  StyleSheet,
  Platform,
  type ListRenderItemInfo,
} from "react-native";
import type { BootStep } from "@/lib/boot-gate-steps";

export type BootStepResult = "yes" | "no" | "skip";

const C = {
  bg: "#0b0f14",
  card: "#161b22",
  cardActive: "#1c2733",
  border: "#30363d",
  text: "#e6edf3",
  sub: "#8b949e",
  yes: "#238636",
  no: "#da3633",
  skip: "#373e47",
  accent: "#58a6ff",
  warn: "#d29922",
};

interface BootGateScreenProps {
  steps: BootStep[];
  currentIndex: number;
  results: Record<string, BootStepResult>;
  stoppedStep: BootStep | null;
  busy: boolean;
  onYes: () => void;
  onNo: () => void;
  onSkip: () => void;
  onRestart: () => void;
}

// Spiega in modo veritiero cosa farà "Sì" su questo step, così l'utente sa se la
// conferma esegue davvero qualcosa o conferma solo un lavoro già avvenuto.
function yesEffectHint(step: BootStep): string {
  if (step.kind === "render") return "▶ Sì: conferma che React ha disegnato (nessuna azione).";
  if (step.kind === "provider") return "▶ Sì: monta questo provider e prosegue.";
  if (step.kind === "navigation") return "▶ Sì: monta l'app completa (passo finale).";
  switch (step.execution) {
    case "imperative":
      return "▶ Sì: esegue ORA questo passo, poi prosegue.";
    case "module-load":
      return "▶ Sì: questo passo è già avvenuto all'avvio — conferma e prosegue.";
    case "mount-hook":
      return "▶ Sì: questo passo parte al montaggio dell'app — conferma e prosegue.";
    default:
      return "▶ Sì: conferma e prosegue.";
  }
}

function statusGlyph(
  step: BootStep,
  index: number,
  currentIndex: number,
  results: Record<string, BootStepResult>,
  stopped: boolean,
): { glyph: string; color: string } {
  const r = results[step.id];
  if (r === "yes") return { glyph: "✓", color: C.yes };
  if (r === "no") return { glyph: "✕", color: C.no };
  if (r === "skip") return { glyph: "»", color: C.warn };
  if (!stopped && index === currentIndex) return { glyph: "▶", color: C.accent };
  return { glyph: "·", color: C.sub };
}

export function BootGateScreen({
  steps,
  currentIndex,
  results,
  stoppedStep,
  busy,
  onYes,
  onNo,
  onSkip,
  onRestart,
}: BootGateScreenProps) {
  const stopped = stoppedStep !== null;
  const currentStep = steps[currentIndex] ?? null;
  const total = steps.length;
  const doneCount = Object.keys(results).length;

  const renderRow = ({ item, index }: ListRenderItemInfo<BootStep>) => {
    const { glyph, color } = statusGlyph(item, index, currentIndex, results, stopped);
    const isCurrent = !stopped && index === currentIndex;
    const isCulprit = stopped && stoppedStep?.id === item.id;
    return (
      <View
        style={[
          styles.row,
          isCurrent && styles.rowActive,
          isCulprit && styles.rowCulprit,
        ]}
      >
        <Text style={[styles.rowGlyph, { color }]}>{glyph}</Text>
        <View style={styles.rowTextWrap}>
          <Text style={styles.rowLabel} numberOfLines={1}>
            {item.originalOrder}. {item.label}
          </Text>
          <Text style={styles.rowKind} numberOfLines={1}>
            {item.kind}
            {item.blocksBoot ? " · blocca boot" : ""}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.title}>🔬 BootGate — diagnostica avvio</Text>
        <Text style={styles.subtitle}>
          Passo {Math.min(currentIndex + 1, total)} di {total} · {doneCount} confermati
        </Text>
      </View>

      <FlatList
        data={steps}
        keyExtractor={(s) => s.id}
        renderItem={renderRow}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator
      />

      {stopped ? (
        <View style={[styles.panel, styles.panelStop]}>
          <Text style={styles.stopTitle}>⛔ Bug isolato qui</Text>
          <Text style={styles.stopStep}>{stoppedStep?.label}</Text>
          <Text style={styles.stopDesc}>{stoppedStep?.description}</Text>
          <Text style={styles.stopModule}>{stoppedStep?.module}</Text>
          <Text style={styles.stopHint}>
            Il server ha registrato questo punto come ultimo step fallito. Comunicalo
            all&apos;agente per la correzione mirata.
          </Text>
          <Pressable
            style={[styles.btn, styles.btnRestart]}
            onPress={onRestart}
            testID="boot-gate-restart"
          >
            <Text style={styles.btnText}>↻ Ricomincia</Text>
          </Pressable>
        </View>
      ) : currentStep ? (
        <View style={styles.panel}>
          <Text style={styles.panelLabel}>{currentStep.label}</Text>
          <Text style={styles.panelDesc}>{currentStep.description}</Text>
          <Text style={styles.panelEffect}>{yesEffectHint(currentStep)}</Text>
          <Text style={styles.panelQuestion}>L&apos;app funziona ancora?</Text>
          {busy ? (
            <ActivityIndicator color={C.accent} style={styles.busy} />
          ) : (
            <View style={styles.actions}>
              <Pressable
                style={[styles.btn, styles.btnYes]}
                onPress={onYes}
                testID="boot-gate-yes"
              >
                <Text style={styles.btnText}>Sì ✓</Text>
              </Pressable>
              {/* "Salta" ha senso solo per gli step action: saltare un provider
                  lascerebbe comunque montato il layer (i layer interni dipendono da
                  quelli esterni), quindi per provider/navigation/render è nascosto. */}
              {currentStep.kind === "action" ? (
                <Pressable
                  style={[styles.btn, styles.btnSkip]}
                  onPress={onSkip}
                  testID="boot-gate-skip"
                >
                  <Text style={styles.btnText}>Salta »</Text>
                </Pressable>
              ) : null}
              <Pressable
                style={[styles.btn, styles.btnNo]}
                onPress={onNo}
                testID="boot-gate-no"
              >
                <Text style={styles.btnText}>No ✕</Text>
              </Pressable>
            </View>
          )}
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: C.bg,
    paddingTop: Platform.OS === "android" ? 28 : 0,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
  },
  title: { color: C.text, fontSize: 18, fontWeight: "700" },
  subtitle: { color: C.sub, fontSize: 13, marginTop: 4 },
  list: { flex: 1 },
  listContent: { paddingHorizontal: 12, paddingVertical: 8 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    marginVertical: 2,
  },
  rowActive: { backgroundColor: C.cardActive },
  rowCulprit: { backgroundColor: "#3d1a1a" },
  rowGlyph: { width: 22, fontSize: 16, fontWeight: "700", textAlign: "center" },
  rowTextWrap: { flex: 1, marginLeft: 8 },
  rowLabel: { color: C.text, fontSize: 15 },
  rowKind: { color: C.sub, fontSize: 11, marginTop: 1 },
  panel: {
    backgroundColor: C.card,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.border,
    padding: 20,
    gap: 6,
  },
  panelStop: { backgroundColor: "#241015" },
  panelLabel: { color: C.text, fontSize: 17, fontWeight: "700" },
  panelDesc: { color: C.sub, fontSize: 14, lineHeight: 20 },
  panelEffect: { color: C.accent, fontSize: 12, lineHeight: 17, marginTop: 4 },
  panelQuestion: { color: C.text, fontSize: 15, fontWeight: "600", marginTop: 8 },
  actions: { flexDirection: "row", gap: 10, marginTop: 12 },
  btn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  btnYes: { backgroundColor: C.yes },
  btnSkip: { backgroundColor: C.skip },
  btnNo: { backgroundColor: C.no },
  btnRestart: { backgroundColor: C.accent, marginTop: 14 },
  btnText: { color: "#ffffff", fontSize: 16, fontWeight: "700" },
  busy: { marginTop: 16 },
  stopTitle: { color: C.no, fontSize: 16, fontWeight: "700" },
  stopStep: { color: C.text, fontSize: 18, fontWeight: "700", marginTop: 4 },
  stopDesc: { color: C.sub, fontSize: 14, lineHeight: 20, marginTop: 2 },
  stopModule: {
    color: C.warn,
    fontSize: 12,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    marginTop: 8,
  },
  stopHint: { color: C.sub, fontSize: 13, lineHeight: 19, marginTop: 10 },
});
