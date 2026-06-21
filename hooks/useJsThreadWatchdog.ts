import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import { markAsyncError } from "@/lib/crash-logger";
import { sendStartupBeacon } from "@/lib/startup-beacon";

const TICK_INTERVAL_MS = 2000;
const FREEZE_THRESHOLD_MS = 5000;

/**
 * Watchdog per il JS thread: un setInterval che batte ogni 2s.
 * Se il tick arriva con gap > 5s, il JS thread era bloccato.
 * Logga su crash-logger + startup-beacon per rendere il freeze visibile
 * anche senza ErrorBoundary o Diagnostic Report.
 */
export function useJsThreadWatchdog(enabled: boolean = true) {
  const lastTickRef = useRef(Date.now());

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

      lastTickRef.current = now;
    }, TICK_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [enabled]);
}
