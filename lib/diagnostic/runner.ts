import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import * as Device from "expo-device";
import { getApiUrl, authFetchHeaders } from "@/lib/query-client";
import { lastEventId } from "@/lib/sentry";

export type DiagnosticStatus = "PASS" | "FAIL" | "WARN" | "SKIP";

export interface DiagnosticTestResult {
  section: string;
  name: string;
  status: DiagnosticStatus;
  message?: string;
  durationMs: number;
}

export interface DiagnosticSummary {
  totalTests: number;
  passed: number;
  failed: number;
  warned: number;
  skipped: number;
  durationMs: number;
}

export interface DiagnosticReport {
  results: DiagnosticTestResult[];
  summary: DiagnosticSummary;
  sentryEventId?: string;
  appVersion: string;
  platform: string;
  deviceModel: string;
  runAt: string;
}

export type ProgressCallback = (done: number, total: number, lastResult: DiagnosticTestResult) => void;

// ── Build capability detection ───────────────────────────────────────────────

export interface BuildCapabilities {
  isNative: boolean;
  isDiagnosticApk: boolean;
}

export function detectBuildCapabilities(): BuildCapabilities {
  const isNative =
    Platform.OS !== "web" &&
    Constants.appOwnership !== "expo";

  const buildProfile =
    process.env.EXPO_PUBLIC_BUILD_PROFILE ??
    (Constants.expoConfig?.extra as Record<string, unknown> | undefined)?.buildProfile ??
    "";

  const isDiagnosticApk = isNative && buildProfile === "diagnostic";

  return { isNative, isDiagnosticApk };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function runWithTimeout<T>(fn: () => Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout after ${timeoutMs}ms`)), timeoutMs);
    fn().then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); }
    );
  });
}

async function runTest(
  section: string,
  name: string,
  fn: () => Promise<{ status: DiagnosticStatus; message?: string }>,
  timeoutMs = 8000
): Promise<DiagnosticTestResult> {
  const start = Date.now();
  try {
    const result = await runWithTimeout(fn, timeoutMs);
    return { section, name, status: result.status, message: result.message, durationMs: Date.now() - start };
  } catch (err) {
    return { section, name, status: "FAIL", message: err instanceof Error ? err.message : String(err), durationMs: Date.now() - start };
  }
}

async function pingApi(path: string, expectArrayOrObject = false): Promise<{ status: DiagnosticStatus; message?: string }> {
  const url = new URL(path, getApiUrl()).toString();
  const res = await fetch(url, { headers: authFetchHeaders(), credentials: "include" });
  if (!res.ok) return { status: "FAIL", message: `HTTP ${res.status}` };
  if (expectArrayOrObject) {
    const data = await res.json();
    if (typeof data !== "object" || data === null) return { status: "WARN", message: "Risposta inattesa" };
  }
  return { status: "PASS" };
}

// ── SECTION: AUTH ───────────────────────────────────────────────────────────

async function testAuth(): Promise<DiagnosticTestResult[]> {
  const section = "AUTH";
  return Promise.all([
    runTest(section, "Sessione valida (/api/users/me)", async () => {
      const res = await fetch(new URL("/api/users/me", getApiUrl()).toString(), {
        headers: authFetchHeaders(), credentials: "include",
      });
      if (res.status === 401) return { status: "FAIL", message: "Non autenticato" };
      if (!res.ok) return { status: "FAIL", message: `HTTP ${res.status}` };
      const data = await res.json();
      if (!data?.id) return { status: "WARN", message: "Risposta mancante di id" };
      return { status: "PASS" };
    }),
    runTest(section, "Token Bearer presente", async () => {
      const { getSessionToken } = await import("@/lib/query-client");
      const token = getSessionToken();
      if (!token) return { status: "WARN", message: "Nessun token Bearer in cache" };
      return { status: "PASS" };
    }),
  ]);
}

// ── SECTION: API CORE ───────────────────────────────────────────────────────

async function testApiCore(): Promise<DiagnosticTestResult[]> {
  const section = "API Core";
  const endpoints: Array<{ name: string; path: string }> = [
    { name: "Friends", path: "/api/friends" },
    { name: "Conversations", path: "/api/chat/conversations" },
    { name: "Motoclubs", path: "/api/motoclubs" },
    { name: "Events", path: "/api/events" },
    { name: "Road Hazards", path: "/api/road-hazards" },
    { name: "Sprints", path: "/api/sprints" },
  ];
  return Promise.all(
    endpoints.map(({ name, path }) =>
      runTest(section, name, () => pingApi(path, true), 5000)
    )
  );
}

// ── SECTION: API MAP & ROUTING ──────────────────────────────────────────────

async function testApiRouting(): Promise<DiagnosticTestResult[]> {
  const section = "Mappe & Routing";
  return Promise.all([
    runTest(section, "Valhalla disponibile", async () => {
      const url = new URL("/api/settings/valhalla-available", getApiUrl()).toString();
      const res = await fetch(url, { headers: authFetchHeaders(), credentials: "include" });
      if (!res.ok) return { status: "WARN", message: `HTTP ${res.status}` };
      const data = await res.json();
      if (data?.available === false) return { status: "WARN", message: "Valhalla non disponibile" };
      return { status: "PASS" };
    }, 5000),
    runTest(section, "Nominatim geocoding", async () => {
      const url = new URL("/api/routing/nominatim/search?q=Roma&limit=1", getApiUrl()).toString();
      const res = await fetch(url, { headers: authFetchHeaders(), credentials: "include" });
      if (!res.ok) return { status: "WARN", message: `HTTP ${res.status}` };
      return { status: "PASS" };
    }, 6000),
    runTest(section, "Tile proxy", async () => {
      const url = new URL("/api/maps/tile-proxy-check", getApiUrl()).toString();
      const res = await fetch(url, { headers: authFetchHeaders(), credentials: "include" });
      if (!res.ok) return { status: "WARN", message: `HTTP ${res.status}` };
      return { status: "PASS" };
    }, 5000),
  ]);
}

// ── SECTION: MATCHING ────────────────────────────────────────────────────────

async function testMatchingPipeline(isAdmin: boolean): Promise<DiagnosticTestResult[]> {
  const section = "Pipeline Matching";
  const tests: Array<() => Promise<DiagnosticTestResult>> = [
    () => runTest(section, "GET /api/matches", async () => {
      const url = new URL("/api/matches", getApiUrl()).toString();
      const res = await fetch(url, { headers: authFetchHeaders(), credentials: "include" });
      if (!res.ok) return { status: "FAIL", message: `HTTP ${res.status}` };
      const data = await res.json();
      if (typeof data !== "object" || data === null) return { status: "WARN", message: "Risposta inattesa" };
      return { status: "PASS" };
    }, 6000),
  ];
  if (isAdmin) {
    tests.push(() => runTest(section, "GET /api/match-health (admin)", async () => {
      const url = new URL("/api/match-health", getApiUrl()).toString();
      const res = await fetch(url, { headers: authFetchHeaders(), credentials: "include" });
      if (res.status === 403) return { status: "SKIP", message: "Non admin" };
      if (!res.ok) return { status: "FAIL", message: `HTTP ${res.status}` };
      const data = await res.json();
      if (typeof data !== "object" || data === null) return { status: "WARN", message: "Risposta inattesa" };
      return { status: "PASS" };
    }, 6000));
  }
  return Promise.all(tests.map(t => t()));
}

// ── SECTION: CHAT ────────────────────────────────────────────────────────────

async function testChatPipeline(): Promise<DiagnosticTestResult[]> {
  const section = "Pipeline Chat";
  return Promise.all([
    runTest(section, "Chat endpoint vivo (POST /api/chat/conversations)", async () => {
      const url = new URL("/api/chat/conversations", getApiUrl()).toString();
      const res = await fetch(url, {
        method: "POST",
        headers: { ...authFetchHeaders(), "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({}),
      });
      if (res.status === 502 || res.status === 503) {
        return { status: "FAIL", message: `Server non raggiungibile: HTTP ${res.status}` };
      }
      return { status: "PASS", message: `HTTP ${res.status}` };
    }, 6000),
    runTest(section, "WebSocket diagnostico — ping/response", async () => {
      if (Platform.OS === "web") return { status: "SKIP", message: "Test WS non disponibile su web" };
      return new Promise<{ status: DiagnosticStatus; message?: string }>((resolve) => {
        const apiUrl = getApiUrl();
        const wsUrl = apiUrl.replace(/^https?:\/\//, (m) => m === "https://" ? "wss://" : "ws://") + "/ws/diagnostic";
        let settled = false;
        const settle = (result: { status: DiagnosticStatus; message?: string }) => {
          if (!settled) { settled = true; resolve(result); }
        };
        const outerTimer = setTimeout(() => {
          try { ws?.close(); } catch { /* noop */ }
          settle({ status: "WARN", message: "Timeout connessione WS (5s)" });
        }, 5000);
        let ws: WebSocket;
        try {
          ws = new WebSocket(wsUrl);
          ws.onopen = () => {
            try { ws.send(JSON.stringify({ type: "ping" })); } catch { /* noop */ }
            const pingTimer = setTimeout(() => {
              clearTimeout(outerTimer);
              try { ws.close(); } catch { /* noop */ }
              settle({ status: "PASS", message: "Connessione aperta (ping inviato)" });
            }, 2000);
            ws.onmessage = () => {
              clearTimeout(outerTimer);
              clearTimeout(pingTimer);
              try { ws.close(); } catch { /* noop */ }
              settle({ status: "PASS", message: "Connessione aperta, risposta ricevuta" });
            };
          };
          ws.onerror = () => {
            clearTimeout(outerTimer);
            settle({ status: "WARN", message: "Connessione WS fallita" });
          };
          ws.onclose = (e) => {
            clearTimeout(outerTimer);
            if (!settled) settle({ status: e.wasClean ? "PASS" : "WARN", message: e.wasClean ? "Chiusura pulita" : "Chiusura non pulita" });
          };
        } catch (e) {
          clearTimeout(outerTimer);
          settle({ status: "WARN", message: e instanceof Error ? e.message : "Errore WS" });
        }
      });
    }, 7000),
  ]);
}

// ── SECTION: OTA ─────────────────────────────────────────────────────────────

async function testOtaPipeline(isAdmin: boolean): Promise<DiagnosticTestResult[]> {
  const section = "Pipeline OTA";
  const tests: Array<() => Promise<DiagnosticTestResult>> = [
    () => runTest(section, "Confronto OTA bundled vs applicata", async () => {
      try {
        const { APPLIED_OTA_NUMBER, OTA_BUNDLED_COUNT } = await import("@/constants/buildInfo");
        const { loadAppliedOtaNumber } = await import("@/lib/otaStorage");
        const stored = await loadAppliedOtaNumber();
        const bundled = APPLIED_OTA_NUMBER ?? OTA_BUNDLED_COUNT;
        const applied = stored ?? bundled;
        if (bundled !== null && applied !== null && bundled !== applied) {
          return { status: "WARN", message: `Bundled OTA ${bundled} ≠ applicata ${applied}` };
        }
        return { status: "PASS" };
      } catch {
        return { status: "SKIP", message: "Informazioni OTA non disponibili" };
      }
    }, 3000),
  ];
  if (isAdmin) {
    tests.push(() => runTest(section, "GET /api/admin/ota/releases (admin)", async () => {
      const url = new URL("/api/admin/ota/releases", getApiUrl()).toString();
      const res = await fetch(url, { headers: authFetchHeaders(), credentials: "include" });
      if (res.status === 403) return { status: "SKIP", message: "Non admin" };
      if (!res.ok) return { status: "FAIL", message: `HTTP ${res.status}` };
      const data = await res.json();
      if (!Array.isArray(data)) return { status: "WARN", message: "Risposta non è un array" };
      return { status: "PASS", message: `${data.length} release` };
    }, 6000));
  }
  return Promise.all(tests.map(t => t()));
}

// ── SECTION: PUSH NOTIFICATIONS ─────────────────────────────────────────────

async function testPushToken(): Promise<DiagnosticTestResult[]> {
  const section = "Push Notifications";
  return [
    await runTest(section, "Push token registrato", async () => {
      if (Platform.OS === "web") return { status: "SKIP", message: "Web non supportato" };
      const url = new URL("/api/users/me", getApiUrl()).toString();
      const res = await fetch(url, { headers: authFetchHeaders(), credentials: "include" });
      if (!res.ok) return { status: "WARN", message: `Non recuperabile: HTTP ${res.status}` };
      const data = await res.json();
      const pushToken = data?.profile?.expoPushToken ?? data?.expoPushToken ?? null;
      if (!pushToken) return { status: "WARN", message: "Push token non registrato nel profilo" };
      return { status: "PASS" };
    }, 5000),
  ];
}

// ── SECTION: GPS ─────────────────────────────────────────────────────────────

async function testGpsReading(): Promise<DiagnosticTestResult[]> {
  const section = "GPS";
  if (Platform.OS === "web") {
    return [{ section, name: "Lettura GPS reale", status: "SKIP", message: "Solo dispositivo nativo", durationMs: 0 }];
  }
  return [
    await runTest(section, "Lettura GPS reale (getCurrentPosition)", async () => {
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status !== "granted") {
        return { status: "SKIP", message: `Permesso GPS non concesso (${status})` };
      }
      // Use internal timeout to distinguish WARN (timeout) from FAIL (error)
      const GPS_TIMEOUT_MS = 6000;
      const TIMEOUT_SENTINEL = "GPS_TIMEOUT";
      try {
        const loc = await new Promise<Location.LocationObject>((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error(TIMEOUT_SENTINEL)), GPS_TIMEOUT_MS);
          Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
            .then(l => { clearTimeout(timer); resolve(l); })
            .catch(e => { clearTimeout(timer); reject(e); });
        });
        if (!loc?.coords) return { status: "WARN", message: "Nessuna posizione ricevuta" };
        return { status: "PASS", message: `lat=${loc.coords.latitude.toFixed(4)}, lon=${loc.coords.longitude.toFixed(4)}` };
      } catch (e) {
        if (e instanceof Error && e.message === TIMEOUT_SENTINEL) {
          return { status: "WARN", message: "Timeout GPS (6s) — fix non ottenuto" };
        }
        throw e;
      }
    }, 8000),
  ];
}

// ── SECTION: ROUTING REALE ───────────────────────────────────────────────────

async function testRoutingReal(): Promise<DiagnosticTestResult[]> {
  const section = "Routing Reale";
  return [
    await runTest(section, "Calcolo percorso Valhalla (Milano → Monza)", async () => {
      const url = new URL("/api/routing/route", getApiUrl()).toString();
      const body = {
        locations: [
          { lat: 45.4654, lon: 9.1866 },
          { lat: 45.5845, lon: 9.2745 },
        ],
        costing: "motorcycle",
        engine: "valhalla",
      };
      const res = await fetch(url, {
        method: "POST",
        headers: { ...authFetchHeaders(), "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (res.status === 502 || res.status === 503) {
        return { status: "WARN", message: "Valhalla non raggiungibile" };
      }
      if (!res.ok) return { status: "WARN", message: `HTTP ${res.status}` };
      const data = await res.json();
      const hasRoute = data?.trip?.legs?.length > 0 || data?.routes?.length > 0 || data?.route;
      if (!hasRoute) return { status: "WARN", message: "Risposta senza percorso" };
      return { status: "PASS" };
    }, 10000),
  ];
}

// ── SECTION: SENSORI HARDWARE ────────────────────────────────────────────────

async function testHardwareSensors(isDiagnosticApk: boolean, isNative: boolean): Promise<DiagnosticTestResult[]> {
  const section = "Sensori Hardware";

  if (!isNative) {
    return [
      { section, name: "Accelerometro", status: "SKIP", message: "Solo dispositivo nativo", durationMs: 0 },
      { section, name: "Pedometro (iOS)", status: "SKIP", message: "Solo dispositivo nativo", durationMs: 0 },
    ];
  }
  if (!isDiagnosticApk) {
    return [
      { section, name: "Accelerometro", status: "SKIP", message: "Solo APK diagnostica", durationMs: 0 },
      { section, name: "Pedometro (iOS)", status: "SKIP", message: "Solo APK diagnostica", durationMs: 0 },
    ];
  }

  const results: DiagnosticTestResult[] = [];

  results.push(
    await runTest(section, "Accelerometro (1s campionamento)", async () => {
      try {
        const Accelerometer = (await import("expo-sensors")).Accelerometer;
        const isAvailable = await Accelerometer.isAvailableAsync();
        if (!isAvailable) return { status: "SKIP", message: "Accelerometro non disponibile" };
        return new Promise<{ status: DiagnosticStatus; message?: string }>((resolve) => {
          let received = false;
          const sub = Accelerometer.addListener(() => {
            if (!received) {
              received = true;
              sub.remove();
              resolve({ status: "PASS" });
            }
          });
          Accelerometer.setUpdateInterval(100);
          setTimeout(() => {
            sub.remove();
            resolve(received
              ? { status: "PASS" }
              : { status: "WARN", message: "Nessun campione ricevuto in 1s" }
            );
          }, 1000);
        });
      } catch {
        return { status: "SKIP", message: "expo-sensors non disponibile" };
      }
    }, 5000)
  );

  results.push(
    await runTest(section, "Pedometro (iOS)", async () => {
      if (Platform.OS !== "ios") {
        return { status: "SKIP", message: "Solo iOS" };
      }
      try {
        const Pedometer = (await import("expo-sensors")).Pedometer;
        const isAvailable = await Pedometer.isAvailableAsync();
        if (!isAvailable) return { status: "WARN", message: "Pedometro non disponibile su questo dispositivo" };
        return { status: "PASS" };
      } catch {
        return { status: "SKIP", message: "expo-sensors/Pedometer non disponibile" };
      }
    }, 5000)
  );

  return results;
}

// ── SECTION: ADMIN (solo admin) ─────────────────────────────────────────────

async function testAdmin(): Promise<DiagnosticTestResult[]> {
  const section = "Admin";
  return Promise.all([
    runTest(section, "System probe", async () => {
      const url = new URL("/api/admin/system-probe", getApiUrl()).toString();
      const res = await fetch(url, { headers: authFetchHeaders(), credentials: "include" });
      if (res.status === 403) return { status: "SKIP", message: "Non admin" };
      if (!res.ok) return { status: "FAIL", message: `HTTP ${res.status}` };
      return { status: "PASS" };
    }, 5000),
  ]);
}

// ── SECTION: PERMISSIONS ────────────────────────────────────────────────────

async function testPermissions(): Promise<DiagnosticTestResult[]> {
  if (Platform.OS === "web") {
    return [{ section: "Permessi", name: "Tutti i permessi", status: "SKIP", message: "Web non supportato", durationMs: 0 }];
  }
  const section = "Permessi";
  return Promise.all([
    runTest(section, "Posizione GPS", async () => {
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status === "granted") return { status: "PASS" };
      if (status === "denied") return { status: "WARN", message: "Permesso negato" };
      return { status: "WARN", message: `Stato: ${status}` };
    }, 5000),
    runTest(section, "Camera", async () => {
      try {
        const CameraModule = await import("expo-camera");
        const permFn = (CameraModule as Record<string, unknown>)["getCameraPermissionsAsync"] as (() => Promise<{ status: string }>) | undefined;
        if (!permFn) return { status: "SKIP", message: "API non disponibile" };
        const { status } = await permFn();
        if (status === "granted") return { status: "PASS" };
        return { status: "WARN", message: `Stato: ${status}` };
      } catch {
        return { status: "SKIP", message: "expo-camera non disponibile" };
      }
    }, 5000),
    runTest(section, "Notifiche", async () => {
      const { status } = await Notifications.getPermissionsAsync();
      if (status === "granted") return { status: "PASS" };
      return { status: "WARN", message: `Stato: ${status}` };
    }, 5000),
  ]);
}

// ── SECTION: STORAGE ─────────────────────────────────────────────────────────

async function testStorage(): Promise<DiagnosticTestResult[]> {
  const section = "Storage";
  return Promise.all([
    runTest(section, "AsyncStorage R/W/D", async () => {
      const key = "@bikerlink/diag_test";
      await AsyncStorage.setItem(key, "ok");
      const val = await AsyncStorage.getItem(key);
      await AsyncStorage.removeItem(key);
      if (val !== "ok") return { status: "FAIL", message: "Valore errato" };
      return { status: "PASS" };
    }, 5000),
    runTest(section, "SecureStore R/W", async () => {
      if (Platform.OS === "web") return { status: "SKIP", message: "Web" };
      const key = "bikerlink_diag_test";
      await SecureStore.setItemAsync(key, "ok");
      const val = await SecureStore.getItemAsync(key);
      await SecureStore.deleteItemAsync(key);
      if (val !== "ok") return { status: "FAIL", message: "Valore errato" };
      return { status: "PASS" };
    }, 5000),
  ]);
}

// ── MAIN RUNNER ──────────────────────────────────────────────────────────────

export async function runAllTests(
  options: { isAdmin?: boolean; onProgress?: ProgressCallback } = {}
): Promise<DiagnosticReport> {
  const { isAdmin = false, onProgress } = options;
  const caps = detectBuildCapabilities();
  const allResults: DiagnosticTestResult[] = [];
  const start = Date.now();

  const sections: Array<() => Promise<DiagnosticTestResult[]>> = [
    testAuth,
    testApiCore,
    testApiRouting,
    testStorage,
    testPermissions,
    () => testMatchingPipeline(isAdmin),
    testChatPipeline,
    () => testOtaPipeline(isAdmin),
    testPushToken,
    testGpsReading,
    testRoutingReal,
    () => testHardwareSensors(caps.isDiagnosticApk, caps.isNative),
  ];
  if (isAdmin) {
    sections.push(testAdmin);
  }

  let done = 0;
  const estimated = sections.length * 3;

  for (const sectionFn of sections) {
    const results = await sectionFn();
    for (const r of results) {
      allResults.push(r);
      done++;
      onProgress?.(done, Math.max(done, estimated), r);
    }
  }

  const sentryEventId = await lastEventId();

  const summary: DiagnosticSummary = {
    totalTests: allResults.length,
    passed: allResults.filter(r => r.status === "PASS").length,
    failed: allResults.filter(r => r.status === "FAIL").length,
    warned: allResults.filter(r => r.status === "WARN").length,
    skipped: allResults.filter(r => r.status === "SKIP").length,
    durationMs: Date.now() - start,
  };

  return {
    results: allResults,
    summary,
    sentryEventId: sentryEventId || undefined,
    appVersion: Constants.expoConfig?.version ?? "?",
    platform: Platform.OS,
    deviceModel: Device.modelName ?? Device.deviceName ?? "?",
    runAt: new Date().toISOString(),
  };
}
