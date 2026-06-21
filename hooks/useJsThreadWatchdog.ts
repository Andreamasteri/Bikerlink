import { useEffect, useRef } from "react";
import { AppState, Platform } from "react-native";
import { markAsyncError } from "@/lib/crash-logger";
import { sendStartupBeacon } from "@/lib/startup-beacon";

const TICK_INTERVAL_MS = 2000;
const FREEZE_THRESHOLD_MS = 3000;
export const HEAP_PRESSURE_RATIO = 0.8;
// Isteresi: il warning heap si riarma solo quando l'uso scende sotto 72%
// (0.8 * 0.9), per non oscillare attorno alla soglia ad ogni tick.
export const HEAP_REARM_RATIO = HEAP_PRESSURE_RATIO * 0.9;

interface PerfWithMemory {
  memory?: {
    usedJSHeapSize?: number;
    jsHeapSizeLimit?: number;
  };
}

/**
 * Risultato dell'ispezione heap per un singolo tick.
 *
 * - `action: "warn"` → ratio ha superato HEAP_PRESSURE_RATIO e heapWarned era
 *   false; il chiamante deve emettere l'allarme e impostare heapWarned=true.
 * - `action: "rearm"` → ratio è sceso sotto HEAP_REARM_RATIO; il chiamante
 *   deve reimpostare heapWarned=false.
 * - `action: "none"` → nessuna transizione (ratio nella fascia neutra o non
 *   disponibile).
 */
export type HeapCheckResult =
  | { action: "warn"; ratioPercent: number; usedMb: number; limitMb: number }
  | { action: "rearm" }
  | { action: "none" };

/**
 * Legge `performance.memory` (disponibile solo su alcuni runtime — raro in
 * Hermes) e calcola la transizione di stato per il watchdog heap.
 *
 * È una funzione pura rispetto all'input `heapWarned`: non muta nulla, non
 * chiama markAsyncError, non dipende da React. Esportata per i test.
 *
 * @param heapWarned - valore corrente di heapWarnedRef.current
 */
export function checkHeapPressure(heapWarned: boolean): HeapCheckResult {
  try {
    const mem = (globalThis as { performance?: PerfWithMemory }).performance?.memory;
    const used = mem?.usedJSHeapSize;
    const limit = mem?.jsHeapSizeLimit;
    if (typeof used !== "number" || typeof limit !== "number" || limit <= 0) {
      return { action: "none" };
    }
    const ratio = used / limit;
    if (ratio > HEAP_PRESSURE_RATIO && !heapWarned) {
      const usedMb = Math.round(used / (1024 * 1024));
      const limitMb = Math.round(limit / (1024 * 1024));
      return { action: "warn", ratioPercent: Math.round(ratio * 100), usedMb, limitMb };
    }
    if (ratio < HEAP_REARM_RATIO) {
      return { action: "rearm" };
    }
    return { action: "none" };
  } catch {
    // no-op: la probe heap è best-effort, non deve mai lanciare
    return { action: "none" };
  }
}

/**
 * Watchdog per il JS thread + pressione di memoria.
 *
 * 1. JS thread freeze: un setInterval che batte ogni 2s. Se il tick arriva con
 *    gap > 3s, il JS thread era bloccato → `js_thread_freeze`.
 * 2. Memory pressure (Android/runtime): se `performance.memory` è disponibile
 *    (raro in Hermes, presente in alcuni runtime) e l'heap JS supera l'80% del
 *    limite → `memory_pressure` (una sola volta per superamento, con isteresi).
 * 3. Memory pressure (iOS/OS): l'evento AppState `memoryWarning` viene inoltrato
 *    al crash-logger come `memory_pressure`.
 *
 * Tutto va su crash-logger + startup-beacon per rendere freeze e OOM visibili
 * anche senza ErrorBoundary o Diagnostic Report.
 */
export function useJsThreadWatchdog(enabled: boolean = true) {
  const lastTickRef = useRef(Date.now());
  const heapWarnedRef = useRef(false);

  useEffect(() => {
    if (!enabled || Platform.OS === "web") return;

    lastTickRef.current = Date.now();

    const interval = setInterval(() => {
      const now = Date.now();
      const gap = now - lastTickRef.current;

      if (gap > FREEZE_THRESHOLD_MS) {
        const freezeEstimateMs = gap - TICK_INTERVAL_MS;
        markAsyncError(
          "js_thread_freeze",
          new Error(
            `JS thread bloccato ~${Math.round(freezeEstimateMs / 1000)}s (gap=${gap}ms)`
          )
        ).catch(() => {});
        sendStartupBeacon("js_thread_freeze_detected", {
          gapMs: gap,
          freezeEstimateMs,
        });
      }

      const heapResult = checkHeapPressure(heapWarnedRef.current);
      if (heapResult.action === "warn") {
        heapWarnedRef.current = true;
        markAsyncError(
          "memory_pressure",
          new Error(
            `JS heap ${heapResult.ratioPercent}% (${heapResult.usedMb}/${heapResult.limitMb}MB)`
          )
        ).catch(() => {});
        sendStartupBeacon("memory_pressure_detected", {
          source: "js_heap",
          usedMb: heapResult.usedMb,
          limitMb: heapResult.limitMb,
          ratio: Math.round(heapResult.ratioPercent) / 100,
        });
      } else if (heapResult.action === "rearm") {
        heapWarnedRef.current = false;
      }

      lastTickRef.current = now;
    }, TICK_INTERVAL_MS);

    // iOS (e talvolta Android) emette "memoryWarning" via AppState quando il
    // sistema è sotto pressione di memoria: lo inoltriamo al crash-logger.
    const memSub = AppState.addEventListener("memoryWarning", () => {
      markAsyncError("memory_pressure", new Error("OS memoryWarning")).catch(() => {});
      sendStartupBeacon("memory_pressure_detected", { source: "os_warning" });
    });

    return () => {
      clearInterval(interval);
      memSub.remove();
    };
  }, [enabled]);
}
