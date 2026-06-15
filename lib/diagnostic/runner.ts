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
    { name: "Motoclubs", path: "/api/motoclubs/discovery" },
    { name: "Events", path: "/api/eventi" },
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
  const allResults: DiagnosticTestResult[] = [];
  const start = Date.now();

  const sections: Array<() => Promise<DiagnosticTestResult[]>> = [
    testAuth,
    testApiCore,
    testApiRouting,
    testStorage,
    testPermissions,
  ];
  if (isAdmin) sections.push(testAdmin);

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
