import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppState, Platform } from "react-native";
import Constants from "expo-constants";
import { apiRequest } from "@/lib/query-client";

const SESSION_KEY = "@bikerlink/crash_session";
const QUEUE_KEY = "@bikerlink/crash_queue";
const MAX_QUEUE = 100;

export type CrashType = "crash_system" | "crash_js" | "clean_close";

export interface CrashSessionMeta {
  sessionId: string;
  startedAt: string;
  clean: boolean;
  jsError?: { message: string; stack: string };
}

export interface CrashLogEntry {
  sessionId: string;
  crashType: CrashType;
  appVersion: string | null;
  platform: string;
  osVersion: string | null;
  deviceModel: string | null;
  errorMessage: string | null;
  stackTrace: string | null;
  sessionStartedAt: string;
  sessionEndedAt: string | null;
}

function makeSessionId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}

function getAppVersion(): string | null {
  return Constants.expoConfig?.version ?? null;
}

function getOsVersion(): string | null {
  try {
    const c = Platform.constants as Record<string, unknown>;
    if (typeof c?.osVersion === "string") return c.osVersion;
    if (typeof c?.Release === "string") return c.Release;
    return null;
  } catch {
    return null;
  }
}

function getDeviceModel(): string | null {
  try {
    const c = Platform.constants as Record<string, unknown>;
    if (typeof c?.Model === "string") return c.Model;
    return null;
  } catch {
    return null;
  }
}

let _currentSession: CrashSessionMeta | null = null;
let _appStateSubscription: { remove: () => void } | null = null;
let _initialized = false;

async function readQueue(): Promise<CrashLogEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as CrashLogEntry[];
  } catch {
    return [];
  }
}

async function writeQueue(queue: CrashLogEntry[]): Promise<void> {
  try {
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue.slice(-MAX_QUEUE)));
  } catch {}
}

async function enqueue(entry: CrashLogEntry): Promise<void> {
  const queue = await readQueue();
  queue.push(entry);
  await writeQueue(queue);
}

async function saveCurrentSession(): Promise<void> {
  if (!_currentSession) return;
  try {
    await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(_currentSession));
  } catch {}
}

export async function markClean(): Promise<void> {
  if (!_currentSession) return;
  _currentSession.clean = true;
  await saveCurrentSession();
}

export async function markJsError(error: Error, stack?: string): Promise<void> {
  if (!_currentSession) return;
  _currentSession.clean = false;
  _currentSession.jsError = {
    message: (error.message ?? "").slice(0, 500),
    stack: (stack ?? error.stack ?? "").slice(0, 3000),
  };
  await saveCurrentSession();
}

export async function flushQueue(): Promise<void> {
  try {
    const queue = await readQueue();
    if (queue.length === 0) return;
    await apiRequest("POST", "/api/crash-logs", { logs: queue });
    await writeQueue([]);
  } catch {}
}

export async function initCrashLogger(userId: string): Promise<void> {
  if (_initialized) return;
  _initialized = true;

  let prevSession: CrashSessionMeta | null = null;
  try {
    const raw = await AsyncStorage.getItem(SESSION_KEY);
    if (raw) prevSession = JSON.parse(raw) as CrashSessionMeta;
  } catch {}

  if (prevSession && !prevSession.clean) {
    const crashType: CrashType = prevSession.jsError ? "crash_js" : "crash_system";
    const entry: CrashLogEntry = {
      sessionId: prevSession.sessionId,
      crashType,
      appVersion: getAppVersion(),
      platform: Platform.OS,
      osVersion: getOsVersion(),
      deviceModel: getDeviceModel(),
      errorMessage: prevSession.jsError?.message ?? null,
      stackTrace: prevSession.jsError?.stack ?? null,
      sessionStartedAt: prevSession.startedAt,
      sessionEndedAt: null,
    };
    await enqueue(entry);
  }

  _currentSession = {
    sessionId: makeSessionId(),
    startedAt: new Date().toISOString(),
    clean: false,
  };
  await saveCurrentSession();

  if (_appStateSubscription) {
    _appStateSubscription.remove();
    _appStateSubscription = null;
  }
  _appStateSubscription = AppState.addEventListener("change", async (state) => {
    if (state === "background" || state === "inactive") {
      await markClean();
    }
    if (state === "active") {
      if (_currentSession) {
        _currentSession.clean = false;
        await saveCurrentSession();
      }
    }
  });

  await flushQueue();
}

export function resetCrashLogger(): void {
  _initialized = false;
  _currentSession = null;
  if (_appStateSubscription) {
    _appStateSubscription.remove();
    _appStateSubscription = null;
  }
}
