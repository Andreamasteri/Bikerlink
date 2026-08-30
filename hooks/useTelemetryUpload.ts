/**
 * useTelemetryUpload — flush, distance-based upload, and buffer drain logic
 * extracted from useTelemetry to keep each file under the 600-line ratchet.
 *
 * Owns:
 *  - flush()                      — POST foreground buffer to server
 *  - maybeUploadByDistance()      — fire-and-forget 500 m upload trigger
 *  - drainAndFlushBackgroundBuffer() — drain AsyncStorage bg buffer on resume
 *  - persistUnsentSamples()       — save unsent samples on stop failure
 *  - drainUnsentStorage()         — recover samples from previous failed flush
 *  - checkpointBuffer()           — periodic crash-recovery checkpoint during ride
 *  - clearCrashRecovery()         — remove crash-recovery key on clean session stop
 *
 * Pure helpers (exported for direct testing):
 *  - writeCheckpoint()            — write crash-recovery key to AsyncStorage
 *  - removeCrashCheckpoint()      — remove crash-recovery key from AsyncStorage
 *  - drainRecoverableKeys()       — drain both UNSENT and CRASH_RECOVERY keys
 */
import { useRef, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { apiRequest, queryClient } from "@/lib/query-client";
import { drainBackgroundTelemetryBuffer } from "@/lib/background-telemetry-task";
import { applyDistanceUpload } from "@shared/tracking-fusion";
import type { TelemetrySample } from "@shared/tracking-fusion";

// ─── Constants (shared with useTelemetry) ─────────────────────────────────────
export const FLUSH_MAX_SAMPLES        = 200;
// The UI counter must not wait kilometres before becoming durable. 500 m keeps
// requests modest while making a live ride visible quickly.
export const UPLOAD_EVERY_KM          = 0.5;
export const UPLOAD_INTERVAL_MS       = 60_000;
export const STOP_RETRY_DELAY_MS      = 1_500;
export const BG_DRAIN_BUDGET_MS       = 12_000;
export const BG_DRAIN_REQUEST_TIMEOUT = 8_000;
export const UNSENT_PREFIX            = "@bikerlink/telemetry_unsent_";
export const CRASH_RECOVERY_PREFIX    = "@bikerlink/telemetry_crash_";
export const CHECKPOINT_INTERVAL_MS   = 30_000;

// ─── Stored payload shape ──────────────────────────────────────────────────────
interface StoredPayload {
  sessionId: string;
  samples:   TelemetrySample[];
}

// ─── Pure helpers (no React, fully testable) ───────────────────────────────────

/**
 * Write (or clear) the crash-recovery checkpoint for a session.
 * If `samples` is empty the key is removed to avoid replaying stale data.
 */
export async function writeCheckpoint(
  sessionId: string,
  samples: TelemetrySample[]
): Promise<void> {
  const key = `${CRASH_RECOVERY_PREFIX}${sessionId}`;
  try {
    if (samples.length === 0) {
      await AsyncStorage.removeItem(key);
    } else {
      await AsyncStorage.setItem(key, JSON.stringify({ sessionId, samples }));
    }
  } catch (e) {
    console.warn("[useTelemetry] checkpoint: errore scrittura crash-recovery (non bloccante)", e);
  }
}

/**
 * Remove the crash-recovery checkpoint for a session (called on clean stop or
 * when persistUnsentSamples takes over so only one key exists per session).
 */
export async function removeCrashCheckpoint(sessionId: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(`${CRASH_RECOVERY_PREFIX}${sessionId}`);
  } catch (e) {
    console.warn("[useTelemetry] removeCrashCheckpoint: errore rimozione chiave (non bloccante)", e);
  }
}

/**
 * Drain all recoverable keys (UNSENT + CRASH_RECOVERY) from AsyncStorage.
 * For each key the caller-supplied `postFn` is invoked; on any error the key
 * is still removed so we never block future sessions with unresolvable data.
 *
 * Returns the list of session IDs that were drained (for logging / testing).
 */
export async function drainRecoverableKeys(
  postFn: (sessionId: string, samples: TelemetrySample[]) => Promise<void>
): Promise<string[]> {
  const drained: string[] = [];
  try {
    const keys = [...(await AsyncStorage.getAllKeys())] as string[];
    const recoverableKeys = keys.filter(
      (k) => k.startsWith(UNSENT_PREFIX) || k.startsWith(CRASH_RECOVERY_PREFIX)
    );
    for (const key of recoverableKeys) {
      const raw = await AsyncStorage.getItem(key);
      if (!raw) { await AsyncStorage.removeItem(key); continue; }
      let parsed: StoredPayload;
      try {
        parsed = JSON.parse(raw) as StoredPayload;
      } catch {
        await AsyncStorage.removeItem(key);
        continue;
      }
      if (!parsed.samples || parsed.samples.length === 0) {
        await AsyncStorage.removeItem(key);
        continue;
      }
      const isCrashKey = key.startsWith(CRASH_RECOVERY_PREFIX);
      try {
        await postFn(parsed.sessionId, parsed.samples);
        console.log(
          `[useTelemetry] startSession: drained ${parsed.samples.length} campioni ` +
          `${isCrashKey ? "(crash-recovery)" : "(unsent)"} dalla sessione ${parsed.sessionId}.`
        );
        drained.push(parsed.sessionId);
      } catch (e) {
        console.warn(
          `[useTelemetry] startSession: drain di ${parsed.samples.length} campioni ` +
          `${isCrashKey ? "(crash-recovery)" : "(unsent)"} fallito — dati persi definitivamente.`,
          e
        );
      }
      await AsyncStorage.removeItem(key);
    }
  } catch (e) {
    console.warn("[useTelemetry] drainRecoverableKeys: errore (non bloccante)", e);
  }
  return drained;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────
export function useTelemetryUpload(
  sessionIdRef: React.MutableRefObject<string | null>,
  bufferRef: React.MutableRefObject<TelemetrySample[]>,
  totalKmRef: React.MutableRefObject<number>,
  kmAtLastUploadRef: React.MutableRefObject<number>,
) {
  const isFlushing = useRef(false);

  // ── flush foreground buffer to server ───────────────────────────────────────
  const flush = useCallback(async (_force: boolean): Promise<boolean> => {
    if (isFlushing.current) return false;
    const buf = bufferRef.current;
    if (buf.length === 0) return false;

    const sessionId = sessionIdRef.current;
    if (!sessionId) return false;

    const toSend = bufferRef.current.splice(0, FLUSH_MAX_SAMPLES);
    isFlushing.current = true;

    try {
      await apiRequest("POST", "/api/telemetry/batch", {
        session_id:   sessionId,
        session_type: "ride",
        samples:      toSend,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/telemetry/stats"] });
      return true;
    } catch (err) {
      bufferRef.current = [...toSend, ...bufferRef.current];
      console.warn("[useTelemetry] flush failed, re-queued", err);
      return false;
    } finally {
      isFlushing.current = false;
    }
  }, [sessionIdRef, bufferRef]);

  // ── distance-based background upload ────────────────────────────────────────
  const maybeUploadByDistance = useCallback(() => {
    applyDistanceUpload(
      totalKmRef.current,
      kmAtLastUploadRef.current,
      () => flush(true),
      (at) => { kmAtLastUploadRef.current = at; },
      UPLOAD_EVERY_KM,
    );
  }, [flush, totalKmRef, kmAtLastUploadRef]);

  // ── drain AsyncStorage background buffer and flush to server ─────────────────
  const drainAndFlushBackgroundBuffer = useCallback(async () => {
    const bgSamples = await drainBackgroundTelemetryBuffer();
    if (bgSamples.length === 0) return;

    const sessionId = sessionIdRef.current;
    if (!sessionId) return;

    const deadline = Date.now() + BG_DRAIN_BUDGET_MS;
    let offset = 0;
    while (offset < bgSamples.length) {
      if (Date.now() > deadline) {
        console.warn("[useTelemetry] background buffer drain budget exceeded, deferring rest");
        break;
      }
      const chunk = bgSamples.slice(offset, offset + FLUSH_MAX_SAMPLES);
      offset += FLUSH_MAX_SAMPLES;
      try {
        await apiRequest("POST", "/api/telemetry/batch", {
          session_id:   sessionId,
          session_type: "ride",
          samples:      chunk,
        }, { timeoutMs: BG_DRAIN_REQUEST_TIMEOUT });
      } catch (err) {
        console.warn("[useTelemetry] background buffer flush failed", err);
        break;
      }
    }
  }, [sessionIdRef]);

  // ── persist unsent samples to AsyncStorage on flush failure ─────────────────
  const persistUnsentSamples = useCallback(async (
    sessionId: string,
    samples: TelemetrySample[]
  ) => {
    const key = `${UNSENT_PREFIX}${sessionId}`;
    try {
      await AsyncStorage.setItem(key, JSON.stringify({ sessionId, samples }));
      console.warn(
        `[useTelemetry] stop: ${samples.length} campioni persistiti in AsyncStorage (${key}) — saranno inviati alla prossima sessione.`
      );
    } catch (e) {
      console.warn(
        `[useTelemetry] stop: ${samples.length} campioni NON inviati — persist AsyncStorage fallito. Dati persi.`,
        e
      );
    }
  }, []);

  // ── checkpoint buffer to AsyncStorage (crash recovery) ───────────────────────
  const checkpointBuffer = useCallback(async () => {
    const sessionId = sessionIdRef.current;
    if (!sessionId) return;
    await writeCheckpoint(sessionId, bufferRef.current);
  }, [sessionIdRef, bufferRef]);

  // ── remove crash-recovery key after a clean session stop ────────────────────
  const clearCrashRecovery = useCallback(async (sessionId: string) => {
    await removeCrashCheckpoint(sessionId);
  }, []);

  // ── drain samples persisted by previous failed flush or crash ────────────────
  // Uses the pure drainRecoverableKeys helper — both UNSENT and CRASH_RECOVERY
  // keys are handled in a single pass to avoid dual-replay of the same session.
  const drainUnsentStorage = useCallback(async () => {
    const sessionId = sessionIdRef.current;
    await drainRecoverableKeys(async (sid, samples) => {
      await apiRequest("POST", "/api/telemetry/batch", {
        session_id:   sid,
        session_type: "ride",
        samples,
      });
      if (sessionId) {
        queryClient.invalidateQueries({ queryKey: ["/api/telemetry/stats"] });
      }
    });
  }, [sessionIdRef]);

  return {
    flush,
    maybeUploadByDistance,
    drainAndFlushBackgroundBuffer,
    persistUnsentSamples,
    checkpointBuffer,
    clearCrashRecovery,
    drainUnsentStorage,
  };
}
