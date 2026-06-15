// Task #2686 — Telemetria mappe lato client.
// Buffer in-memory; flush a /api/telemetry/maps ogni 30s o ogni 20 eventi.
// Coda offline persistita in AsyncStorage (TTL 24h) per re-invio.
import { useCallback, useEffect, useRef } from "react";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getApiUrl, authFetchHeaders } from "@/lib/query-client";
import { getTelemetryAlwaysActive } from "@/lib/telemetry-prefs";
import Constants from "expo-constants";

export type MapsEvent =
  | "map_init"
  | "map_init_failed"
  | "map_ready"
  | "map_destroy"
  | "webview_crash"
  | "render_frame"
  | "render_slow"
  | "tile_load_error"
  | "tile_load_ok"
  | "style_load_error"
  | "gps_acquire"
  | "gps_lost"
  | "gps_low_accuracy"
  | "routing_request"
  | "routing_success"
  | "routing_failed"
  | "routing_fallback"
  | "matching_request"
  | "matching_success"
  | "matching_failed"
  | "interaction_pan"
  | "interaction_zoom";

export interface MapsTelemetryPayload {
  event: MapsEvent;
  renderer?: "leaflet" | "maplibre" | "openlayers" | "native" | string;
  component?: string;
  engine?: string;
  durationMs?: number;
  errorMessage?: string;
  details?: Record<string, unknown>;
}

const FLUSH_INTERVAL_MS = 30_000;
const FLUSH_AT_EVENTS = 20;
const QUEUE_KEY = "@bikerlink/maps-telemetry-queue-v1";
const QUEUE_MAX = 500;
const QUEUE_TTL_MS = 24 * 60 * 60_000;

interface QueuedEvent extends MapsTelemetryPayload {
  ts: number;
  platform: "ios" | "android" | "web";
  appVersion?: string;
}

let buffer: QueuedEvent[] = [];
let _flushTimer: ReturnType<typeof setInterval> | null = null;
let started = false;
let inflight = false;

function appVersion(): string | undefined {
  return (Constants.expoConfig?.version as string | undefined) ?? undefined;
}

function platform(): "ios" | "android" | "web" {
  const p = Platform.OS;
  if (p === "ios" || p === "android" || p === "web") return p;
  return "web";
}

async function loadQueueFromStorage(): Promise<QueuedEvent[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as QueuedEvent[];
    const cutoff = Date.now() - QUEUE_TTL_MS;
    return Array.isArray(arr) ? arr.filter((e) => e.ts > cutoff).slice(-QUEUE_MAX) : [];
  } catch {
    return [];
  }
}

async function persistQueue(events: QueuedEvent[]): Promise<void> {
  try {
    if (events.length === 0) {
      await AsyncStorage.removeItem(QUEUE_KEY);
    } else {
      await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(events.slice(-QUEUE_MAX)));
    }
  } catch {
    // ignore
  }
}

async function flushNow(): Promise<void> {
  if (inflight) return;
  if (buffer.length === 0) {
    // anche se buffer vuoto, prova a svuotare la coda offline persistita
    const queued = await loadQueueFromStorage();
    if (queued.length === 0) return;
    buffer = queued;
    await persistQueue([]);
  }
  const batch = buffer.splice(0, Math.min(buffer.length, 50));
  inflight = true;
  try {
    const url = new URL("/api/telemetry/maps", getApiUrl()).toString();
    const resp = await fetch(url, {
      method: "POST",
      credentials: "include",
      headers: authFetchHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        events: batch.map((e) => ({
          event: e.event, renderer: e.renderer ?? null, component: e.component ?? null,
          engine: e.engine ?? null, durationMs: e.durationMs ?? null,
          errorMessage: e.errorMessage ?? null, platform: e.platform,
          appVersion: e.appVersion ?? null, details: e.details ?? null,
        })),
      }),
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  } catch {
    // requeue + persist (best-effort)
    const requeue = [...batch, ...buffer];
    buffer = [];
    await persistQueue(requeue);
  } finally {
    inflight = false;
  }
}

function ensureStarted(): void {
  if (started) return;
  started = true;
  // recover offline queue on startup
  loadQueueFromStorage().then((q) => {
    if (q.length > 0) {
      buffer.push(...q);
      void persistQueue([]);
    }
  });
  _flushTimer = setInterval(() => { void flushNow(); }, FLUSH_INTERVAL_MS);
  // unref non disponibile in RN — ok lasciare attivo
}

// Task #2686 — kill-switch lato client: se telemetry è disabilitato lato server,
// evitiamo del tutto buffering/flush per ridurre overhead di rete e batteria.
let telemetryEnabled = true;
let lastFlagCheck = 0;
const FLAG_CACHE_TTL_MS = 5 * 60_000;
async function refreshClientFlag(): Promise<void> {
  const now = Date.now();
  if (now - lastFlagCheck < FLAG_CACHE_TTL_MS) return;
  lastFlagCheck = now;
  try {
    const url = new URL("/api/telemetry/maps/flag", getApiUrl()).toString();
    const r = await fetch(url, { credentials: "include" });
    if (!r.ok) return;
    const j = (await r.json()) as { enabled?: boolean };
    if (typeof j.enabled === "boolean") telemetryEnabled = j.enabled;
  } catch {
    // best-effort: lascia stato precedente
  }
}

export function emitMapsTelemetry(payload: MapsTelemetryPayload): void {
  void refreshClientFlag();
  // Task #3115 — override "Telemetria sempre attiva": quando ON (default), ignora
  // il kill-switch server e continua a raccogliere senza interruzioni.
  if (!telemetryEnabled && !getTelemetryAlwaysActive()) return;
  ensureStarted();
  buffer.push({
    ...payload,
    ts: Date.now(),
    platform: platform(),
    appVersion: appVersion(),
  });
  if (buffer.length >= FLUSH_AT_EVENTS) {
    void flushNow();
  }
}

/**
 * Hook React. Pensato per essere chiamato all'interno di componenti mappa.
 * Ritorna un emitter stabile + un helper per misurare durate (init/render).
 */
export function useMapTelemetry(component: string, renderer?: MapsTelemetryPayload["renderer"]) {
  const componentRef = useRef(component);
  const rendererRef = useRef(renderer);
  componentRef.current = component;
  rendererRef.current = renderer;

  useEffect(() => {
    ensureStarted();
  }, []);

  const emit = useCallback((event: MapsEvent, extra?: Partial<MapsTelemetryPayload>) => {
    emitMapsTelemetry({
      event,
      component: componentRef.current,
      renderer: rendererRef.current,
      ...extra,
    });
  }, []);

  const measure = useCallback(<T,>(event: MapsEvent, fn: () => Promise<T> | T): Promise<T> => {
    const started = Date.now();
    return Promise.resolve()
      .then(() => fn())
      .then((v) => {
        emit(event, { durationMs: Date.now() - started });
        return v;
      })
      .catch((err: Error) => {
        emit(event, { durationMs: Date.now() - started, errorMessage: err.message?.slice(0, 200) });
        throw err;
      });
  }, [emit]);

  return { emit, measure };
}

/** Test-only helper. */
export function _flushMapsTelemetryForTests(): Promise<void> {
  return flushNow();
}
