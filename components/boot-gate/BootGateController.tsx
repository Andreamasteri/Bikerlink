// Task #4979 — orchestratore del BootGate (Livello A interattivo).
//
// Tiene lo stato del bisect (step corrente, esiti, livello catena provider) e
// pilota:
//  - BootGateProviderChain : monta i provider uno alla volta (invisibile, dietro).
//  - BootGateScreen        : UI provider-free Sì/No/Salta (davanti).
//
// Ogni transizione emette un ping passivo (Livello B) così il server conosce
// l'ultimo checkpoint anche se la UI non riesce ad aggiornarsi.
//
// A boot completato, renderizza `renderApp()` — l'albero applicativo reale e
// identico a quello del percorso normale (passato come prop da _layout.tsx per
// evitare import circolari).
import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, StyleSheet, InteractionManager } from "react-native";
import * as Updates from "expo-updates";
import * as SplashScreen from "expo-splash-screen";
import { initSessionToken } from "@/lib/query-client";
import {
  BOOT_GATE_STEPS,
  PROVIDER_STEP_IDS,
  type BootStep,
} from "@/lib/boot-gate-steps";
import { pingBootGate } from "@/lib/boot-gate-ping";
import { BootGateProviderChain } from "@/components/boot-gate/BootGateProviderChain";
import {
  BootGateScreen,
  type BootStepResult,
} from "@/components/boot-gate/BootGateScreen";

interface BootGateControllerProps {
  reportClientError: (error: Error, componentStack: string) => void;
  renderApp: () => React.ReactNode;
}

// Executor reali per gli step `execution: "imperative"`. Devono essere
// idempotenti: il BootGate può ripetere lo stesso step dopo un "Ricomincia".
// Solo gli step elencati qui eseguono codice alla conferma "Sì"; gli step
// module-load/mount-hook NON sono qui apposta (il loro lavoro avviene altrove).
const IMPERATIVE_EXECUTORS: Record<string, () => Promise<void>> = {
  token_init: async () => {
    await initSessionToken();
  },
};

export function BootGateController({
  reportClientError,
  renderApp,
}: BootGateControllerProps) {
  const steps = BOOT_GATE_STEPS;
  const [currentIndex, setCurrentIndex] = useState(0);
  const [results, setResults] = useState<Record<string, BootStepResult>>({});
  const [providerLevel, setProviderLevel] = useState(0);
  const [bootComplete, setBootComplete] = useState(false);
  const [stoppedIndex, setStoppedIndex] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  // resetKey forza il re-mount dell'ErrorBoundary della catena ad ogni
  // "Ricomincia", così un crash provider precedente non resta in stato error.
  const [resetKey, setResetKey] = useState(0);
  // Task #5065 — de-sincronizza il mount di NormalRootLayout dal commit in cui
  // bootComplete diventa true. Senza questo, lo Stack fresco monta nello stesso
  // tick del setState(bootComplete=true) → useLayoutEffect/setOptions di React
  // Navigation si scatenano a cascata → "Maximum update depth exceeded".
  // Con showApp ritardato di un frame (InteractionManager), il navigatore si
  // stabilizza prima che l'albero reale venga aggiunto.
  const [showApp, setShowApp] = useState(false);
  // Provider step in attesa di conferma di mount. L'esito (passed/stopped) è
  // deciso in modo asincrono: onLevelMounted (successo) o handleProviderError
  // (crash in render). Ref perché letto dentro callback senza dover ri-renderizzare.
  const pendingProviderRef = useRef<{
    stepId: string;
    index: number;
    level: number;
  } | null>(null);
  const appVersionRef = useRef(`rv${Updates.runtimeVersion || "?"}`);

  const stoppedStep = stoppedIndex !== null ? steps[stoppedIndex] ?? null : null;

  // Nascondi lo splash nativo appena il BootGate monta. Nel percorso normale ci
  // pensa useAppBootstrap (in NormalRootLayout), che però NON è montato finché il
  // bisect non è completo: senza questo, lo splash resterebbe sopra la UI del
  // BootGate rendendola invisibile/inaccessibile. È best-effort e idempotente.
  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});
  }, []);

  // Task #5065 — ritarda il mount di NormalRootLayout di un frame dopo che
  // bootComplete diventa true. InteractionManager.runAfterInteractions garantisce
  // che il navigatore si stabilizzi PRIMA che lo Stack fresco venga aggiunto,
  // spezzando la cascata useLayoutEffect → setOptions che causava il loop.
  useEffect(() => {
    if (!bootComplete) return;
    const handle = InteractionManager.runAfterInteractions(() => {
      setShowApp(true);
    });
    return () => handle.cancel();
  }, [bootComplete]);

  // Ping "reached" ad ogni nuovo step corrente.
  useEffect(() => {
    if (bootComplete || stoppedIndex !== null) return;
    const step = steps[currentIndex];
    if (!step) return;
    void pingBootGate(step.id, "reached", { appVersion: appVersionRef.current });
  }, [currentIndex, bootComplete, stoppedIndex, steps]);

  const finish = useCallback(() => {
    setBootComplete(true);
    void pingBootGate("app_mount", "passed", {
      appVersion: appVersionRef.current,
      note: "boot completo",
    });
  }, []);

  const advanceFrom = useCallback(
    (index: number) => {
      if (index + 1 >= steps.length) finish();
      else setCurrentIndex(index + 1);
    },
    [steps.length, finish],
  );

  // Esegue lo step action in modo VERITIERO secondo la sua classificazione
  // `execution` (single source of truth in lib/boot-gate-steps.ts) e restituisce
  // una nota su cosa è realmente accaduto, così il ping "passed" non mente mai.
  const runActionStep = useCallback(async (step: BootStep): Promise<string> => {
    switch (step.execution) {
      case "imperative": {
        // Esecuzione reale, imperativa e idempotente, alla conferma "Sì".
        const exec = IMPERATIVE_EXECUTORS[step.id];
        if (!exec) return "imperativo senza executor registrato";
        try {
          await exec();
          return "eseguito ora (imperativo)";
        } catch (e) {
          return `eseguito ora con errore: ${(e as Error)?.message ?? "sconosciuto"}`;
        }
      }
      case "module-load":
        // Il lavoro è già avvenuto come side-effect all'import di _layout.tsx.
        return "già eseguito a module-load (pre-render)";
      case "mount-hook":
        // Parte da un hook al mount dell'app reale: qui si conferma soltanto.
        return "parte dall'hook al mount dell'app reale";
      default:
        return "confermato";
    }
  }, []);

  // Auto-pass dello step "render": se vedi la lista, React ha già renderizzato.
  useEffect(() => {
    if (bootComplete || stoppedIndex !== null || busy) return;
    const step = steps[currentIndex];
    if (!step || step.kind !== "render" || results[step.id] !== undefined) return;
    void (async () => {
      await pingBootGate(step.id, "passed", { appVersion: appVersionRef.current });
      setResults((r) => ({ ...r, [step.id]: "yes" }));
      setCurrentIndex((i) => (i === currentIndex ? i + 1 : i));
    })();
  }, [currentIndex, bootComplete, stoppedIndex, busy, results, steps]);

  // SUCCESSO mount provider: chiamato dalla sentinella della catena SOLO quando
  // tutti i provider fino a `mountedLevel` sono montati senza lanciare. Conferma
  // lo step provider in attesa come "passed" e avanza. Mai un falso positivo:
  // se un provider crasha, la sentinella non monta e questo non parte.
  const handleLevelMounted = useCallback(
    (mountedLevel: number) => {
      const pending = pendingProviderRef.current;
      if (!pending || mountedLevel < pending.level) return;
      pendingProviderRef.current = null;
      void pingBootGate(pending.stepId, "passed", {
        appVersion: appVersionRef.current,
        note: "provider montato senza errori",
      });
      setResults((r) => ({ ...r, [pending.stepId]: "yes" }));
      setBusy(false);
      advanceFrom(pending.index);
    },
    [advanceFrom],
  );

  // CRASH provider: l'ErrorBoundary della catena cattura un errore di render.
  // La telemetria normale (crash logger / sentry) è già stata emessa dal boundary;
  // qui attribuiamo il crash allo step provider in attesa e ci fermiamo lì con un
  // ping "stopped" — così il bisect isola esattamente il provider colpevole.
  const handleProviderError = useCallback(
    (error: Error, componentStack: string) => {
      reportClientError(error, componentStack);
      const pending = pendingProviderRef.current;
      if (!pending) return;
      pendingProviderRef.current = null;
      setResults((r) => ({ ...r, [pending.stepId]: "no" }));
      setStoppedIndex(pending.index);
      setBusy(false);
      void pingBootGate(pending.stepId, "stopped", {
        appVersion: appVersionRef.current,
        note: `crash al mount del provider: ${error?.message ?? "sconosciuto"}`,
      });
    },
    [reportClientError],
  );

  const handleYes = useCallback(async () => {
    if (busy || bootComplete || stoppedIndex !== null) return;
    const index = currentIndex;
    const step = steps[index];
    if (!step) return;
    setBusy(true);
    // I provider tengono busy=true finché il mount non si risolve (passed/stopped
    // via handleLevelMounted/handleProviderError); gli altri step lo rilasciano qui.
    let keepBusy = false;
    try {
      await pingBootGate(step.id, "mounting", { appVersion: appVersionRef.current });
      if (step.kind === "provider") {
        // Avvia il mount incrementale del provider; NON pingare "passed" ora.
        // L'esito reale dipende dal fatto che monti senza crashare.
        const level = PROVIDER_STEP_IDS.indexOf(step.id) + 1;
        pendingProviderRef.current = { stepId: step.id, index, level };
        keepBusy = true;
        if (level > 0) setProviderLevel((p) => Math.max(p, level));
        return;
      }
      let note: string | undefined;
      if (step.kind === "action") {
        note = await runActionStep(step);
      } else if (step.kind === "navigation") {
        setResults((r) => ({ ...r, [step.id]: "yes" }));
        finish();
        return;
      } else if (step.kind === "render") {
        note = "render confermato dall'utente";
      }
      // Il ping "passed" riporta cosa è realmente accaduto: nessuna conferma mente.
      await pingBootGate(step.id, "passed", {
        appVersion: appVersionRef.current,
        note,
      });
      setResults((r) => ({ ...r, [step.id]: "yes" }));
      advanceFrom(index);
    } finally {
      if (!keepBusy) setBusy(false);
    }
  }, [
    busy,
    bootComplete,
    stoppedIndex,
    currentIndex,
    steps,
    runActionStep,
    advanceFrom,
    finish,
  ]);

  const handleSkip = useCallback(async () => {
    if (busy || bootComplete || stoppedIndex !== null) return;
    const index = currentIndex;
    const step = steps[index];
    if (!step) return;
    // "Salta" è offerto SOLO per gli step action (vedi BootGateScreen): saltare un
    // provider lascerebbe comunque montato il layer perché quelli interni ne
    // dipendono, quindi sarebbe disonesto. Per provider/navigation/render è no-op.
    if (step.kind !== "action") return;
    setBusy(true);
    try {
      await pingBootGate(step.id, "skipped", { appVersion: appVersionRef.current });
      setResults((r) => ({ ...r, [step.id]: "skip" }));
      advanceFrom(index);
    } finally {
      setBusy(false);
    }
  }, [busy, bootComplete, stoppedIndex, currentIndex, steps, advanceFrom]);

  const handleNo = useCallback(async () => {
    if (busy || bootComplete || stoppedIndex !== null) return;
    const index = currentIndex;
    const step = steps[index];
    if (!step) return;
    setResults((r) => ({ ...r, [step.id]: "no" }));
    setStoppedIndex(index);
    await pingBootGate(step.id, "stopped", {
      appVersion: appVersionRef.current,
      note: "utente: NON funziona",
    });
  }, [busy, bootComplete, stoppedIndex, currentIndex, steps]);

  const handleRestart = useCallback(() => {
    pendingProviderRef.current = null;
    setStoppedIndex(null);
    setResults({});
    setProviderLevel(0);
    setCurrentIndex(0);
    setBootComplete(false);
    setBusy(false);
    // Re-monta un ErrorBoundary pulito: senza questo, un crash provider precedente
    // resterebbe in stato error e la catena non rimonterebbe più i provider.
    setResetKey((k) => k + 1);
  }, []);

  if (bootComplete) {
    // showApp è ritardato di un frame (vedi useEffect sopra) per evitare il loop
    // useLayoutEffect/setOptions che si innesca quando NormalRootLayout monta nello
    // stesso tick in cui bootComplete diventa true. Mostriamo uno sfondo neutro
    // per il singolo frame di attesa; lo SplashScreen è già nascosto a questo punto.
    if (!showApp) return <View style={styles.root} />;
    return <>{renderApp()}</>;
  }

  return (
    <View style={styles.root}>
      <BootGateScreen
        steps={steps}
        currentIndex={currentIndex}
        results={results}
        stoppedStep={stoppedStep}
        busy={busy}
        onYes={handleYes}
        onNo={handleNo}
        onSkip={handleSkip}
        onRestart={handleRestart}
      />
      {/* Catena provider: in un container 0×0 così non occupa spazio visivo e
          non intercetta MAI i tocchi (su Android absoluteFill+pointerEvents="none"
          può comunque mangiare i tap del fratello sottostante). I provider React
          funzionano indipendentemente dalle dimensioni della loro View host. */}
      <View style={styles.hidden}>
        <BootGateProviderChain
          level={providerLevel}
          resetKey={resetKey}
          onError={handleProviderError}
          onLevelMounted={handleLevelMounted}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0b0f14" },
  hidden: { width: 0, height: 0, overflow: "hidden" },
});
