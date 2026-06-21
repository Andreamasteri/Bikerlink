/**
 * useTelemetryUpload — flush, distance-based upload, and buffer drain logic
 * extracted from useTelemetry to keep each file under the 600-line ratchet.
 *
 * Owns:
 *  - flush()                      — POST foreground buffer to server
 *  - maybeUploadByDistance()      — fire-and-forget 5-km upload trigger
 *  - drainAndFlushBackgroundBuffer() — drain AsyncStorage bg buffer on resume
 *  - persistUnsentSamples()       — save unsent samples on stop failure
 *  - drainUnsentStorage()         — recover samples from previous failed flush
 */
import { useRef, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { apiRequest, queryClient } from "@/lib/query-client";
import { drainBackgroundTelemetryBuffer } from "@/lib/background-telemetry-task";
import { applyDistanceUpload } from "@shared/tracking-fusion";
import type { TelemetrySample } from "@shared/tracking-fusion";

// ─── Constants (shared with useTelemetry) ─────────────────────────────────────
export const FLUSH_MAX_SAMPLES        = 200;
export const UPLOAD_EVERY_KM          = 5;
export const STOP_RETRY_DELAY_MS      = 1_500;
export const BG_DRAIN_BUDGET_MS       = 12_000;
export const BG_DRAIN_REQUEST_TIMEOUT = 8_000;
export const UNSENT_PREFIX            = "@bikerlink/telemetry_unsent_";

// ─── Hook ─────────────────────────────────────────────────────────────────────
export function useTelemetryUpload(
  sessionIdRef: React.MutableRefObject<string | null>,
  bufferRef: React.MutableRefObject<TelemetrySample[]>,
  totalKmRef: React.MutableRefObject<number>,
  kmAtLastUploadRef: React.MutableRefObject<number>,
) {
  const isFlushing = useRef(false);

  // ── flush foreground buffer to server ───────────────────────────────────────
  // Returns true when a batch was actually sent, false otherwise (already
  // flushing, empty buffer, no session, or POST failed). The boolean lets the
  // distance-based uploader advance its marker ONLY on a real success.
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
  // Fire-and-forget: uploads every UPLOAD_EVERY_KM km travelled. Never blocks
  // sampling; the marker only advances on success so a failed upload is retried
  // at the next sample.
  const maybeUploadByDistance = useCallback(() => {
    applyDistanceUpload(
      totalKmRef.current,
      kmAtLastUploadRef.current,
      () => flush(true),
      (at) => { kmAtLastUploadRef.current = at; },
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

  // ── drain samples persisted by a previous failed finishSession flush ─────────
  const drainUnsentStorage = useCallback(async () => {
    try {
      const keys = [...(await AsyncStorage.getAllKeys())] as string[];
      const unsentKeys = keys.filter((k) => k.startsWith(UNSENT_PREFIX));
      for (const key of unsentKeys) {
        const raw = await AsyncStorage.getItem(key);
        if (!raw) { await AsyncStorage.removeItem(key); continue; }
        let parsed: { sessionId: string; samples: TelemetrySample[] };
        try {
          parsed = JSON.parse(raw) as { sessionId: string; samples: TelemetrySample[] };
        } catch {
          await AsyncStorage.removeItem(key);
          continue;
        }
        if (!parsed.samples || parsed.samples.length === 0) {
          await AsyncStorage.removeItem(key);
          continue;
        }
        try {
          await apiRequest("POST", "/api/telemetry/batch", {
            session_id:   parsed.sessionId,
            session_type: "ride",
            samples:      parsed.samples,
          });
          console.log(
            `[useTelemetry] startSession: drained ${parsed.samples.length} campioni non inviati dalla sessione precedente (${parsed.sessionId}).`
          );
        } catch (e) {
          console.warn(
            `[useTelemetry] startSession: drain di ${parsed.samples.length} campioni fallito — dati persi definitivamente.`,
            e
          );
        }
        await AsyncStorage.removeItem(key);
      }
    } catch (e) {
      console.warn("[useTelemetry] drainUnsentStorage: errore (non bloccante)", e);
    }
  }, []);

  return {
    flush,
    maybeUploadByDistance,
    drainAndFlushBackgroundBuffer,
    persistUnsentSamples,
    drainUnsentStorage,
  };
}
