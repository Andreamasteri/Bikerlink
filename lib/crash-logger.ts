import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppState, Platform } from "react-native";
import Constants from "expo-constants";
import * as Device from "expo-device";
import { apiRequest } from "@/lib/query-client";

const SESSION_KEY = "@bikerlink/crash_session";
const QUEUE_KEY = "@bikerlink/crash_queue";
const MAX_QUEUE = 100;
const MAX_QUEUE_LOW_RAM = 20;
const BATCH_SIZE = 50;
const RETRY_INTERVAL_MS = 5 * 60 * 1000;
const LOW_RAM_THRESHOLD_MB = 2048;

export type CrashType = "crash_system" | "crash_js" | "clean_close";

export interface CrashSessionMeta {
  sessionId: string;
  startedAt: string;
  clean: boolean;
  jsError?: { message: string; stack: string };
}

export interface CrashLogEntry {
  userId: string;
  sessionId: string;
  crashType: CrashType;
  appVersion: string | null;
  platform: string;
  osVersion: string | null;
  deviceModel: string | null;
  deviceBrand: string | null;
  totalMemoryMB: number | null;
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
    const model = Device.modelName;
    if (model) return model;
    const c = Platform.constants as Record<string, unknown>;
    if (typeof c?.Model === "string") return c.Model;
    return null;
  } catch {
    return null;
  }
}

function getDeviceBrand(): string | null {
  try {
    return Device.brand ?? null;
  } catch {
    return null;
  }
}

function getTotalMemoryMB(): number | null {
  try {
    const bytes = Device.totalMemory;
    if (typeof bytes === "number" && bytes > 0) {
      return Math.round(bytes / (1024 * 1024));
    }
    return null;
  } catch {
    return null;
  }
}

function getMaxQueue(): number {
  try {
    const mb = getTotalMemoryMB();
    if (mb !== null && mb < LOW_RAM_THRESHOLD_MB) return MAX_QUEUE_LOW_RAM;
  } catch {
    // fall through
  }
  return MAX_QUEUE;
}

let _currentSession: CrashSessionMeta | null = null;
let _currentUserId: string | null = null;
let _appStateSubscription: { remove: () => void } | null = null;
let _retryTimer: ReturnType<typeof setInterval> | null = null;
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
    const maxQ = getMaxQueue();
    const trimmed = queue.slice(-maxQ);
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(trimmed));
  } catch {
    // no-op: crash queue persistence is best-effort
  }
}

export async function enqueueCrashEntry(entry: CrashLogEntry): Promise<void> {
  const queue = await readQueue();
  queue.push(entry);
  await writeQueue(queue);
}

async function saveCurrentSession(): Promise<void> {
  if (!_currentSession) return;
  try {
    await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(_currentSession));
  } catch {
    // no-op: session metadata persistence is best-effort
  }
}

export async function markClean(): Promise<void> {
  if (!_currentSession || _currentSession.jsError) return;
  _currentSession.clean = true;
  await saveCurrentSession();
}

export async function markJsError(error: Error, stack?: string): Promise<void> {
  if (!_currentSession) return;
  const errMsg = ((error as Error).message ?? "").slice(0, 500);
  const errStack = (stack ?? error.stack ?? "").slice(0, 3000);
  _currentSession.jsError = { message: errMsg, stack: errStack };
  await saveCurrentSession();
  const entry: CrashLogEntry = {
    userId: _currentUserId ?? "unknown",
    sessionId: _currentSession.sessionId,
    crashType: "crash_js",
    appVersion: getAppVersion(),
    platform: Platform.OS,
    osVersion: getOsVersion(),
    deviceModel: getDeviceModel(),
    deviceBrand: getDeviceBrand(),
    totalMemoryMB: getTotalMemoryMB(),
    errorMessage: errMsg || null,
    stackTrace: errStack || null,
    sessionStartedAt: _currentSession.startedAt,
    sessionEndedAt: new Date().toISOString(),
  };
  await enqueueCrashEntry(entry);
}

export async function flushQueue(): Promise<void> {
  if (!_currentUserId) return;
  const uid = _currentUserId;
  try {
    const queue = await readQueue();
    const mine = queue.filter((e) => e.userId === uid);
    const others = queue.filter((e) => e.userId !== uid);
    let offset = 0;
    while (offset < mine.length) {
      const batch = mine.slice(offset, offset + BATCH_SIZE);
      await apiRequest("POST", "/api/crash-logs", { logs: batch });
      offset += BATCH_SIZE;
    }
    if (offset > 0) {
      await writeQueue(others);
    }
  } catch {
    // no-op: flush failure means logs remain in queue
  }
}

export async function initCrashLogger(userId: string): Promise<void> {
  if (_initialized) return;
  _initialized = true;
  _currentUserId = userId;

  let prevSession: CrashSessionMeta | null = null;
  try {
    const raw = await AsyncStorage.getItem(SESSION_KEY);
    if (raw) prevSession = JSON.parse(raw) as CrashSessionMeta;
  } catch {
    // no-op: previous session recovery is best-effort
  }

  if (prevSession) {
    const crashType: CrashType = prevSession.clean
      ? "clean_close"
      : prevSession.jsError
      ? "crash_js"
      : "crash_system";
    const existingQueue = await readQueue();
    const alreadyQueued = existingQueue.some(
      (e) => e.sessionId === prevSession.sessionId && e.crashType === crashType
    );
    if (!alreadyQueued) {
      const entry: CrashLogEntry = {
        userId,
        sessionId: prevSession.sessionId,
        crashType,
        appVersion: getAppVersion(),
        platform: Platform.OS,
        osVersion: getOsVersion(),
        deviceModel: getDeviceModel(),
        deviceBrand: getDeviceBrand(),
        totalMemoryMB: getTotalMemoryMB(),
        errorMessage: prevSession.jsError?.message ?? null,
        stackTrace: prevSession.jsError?.stack ?? null,
        sessionStartedAt: prevSession.startedAt,
        sessionEndedAt: null,
      };
      await enqueueCrashEntry(entry);
    }
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
      if (_currentSession && !_currentSession.clean && !_currentSession.jsError) {
        _currentSession.clean = true;
        await saveCurrentSession();
      }
    }
    if (state === "active") {
      if (_currentSession) {
        _currentSession.clean = false;
        await saveCurrentSession();
      }
      await flushQueue();
    }
  });

  if (_retryTimer) clearInterval(_retryTimer);
  _retryTimer = setInterval(() => {
    flushQueue().catch(() => {});
  }, RETRY_INTERVAL_MS);

  await flushQueue();
}

export function resetCrashLogger(): void {
  _initialized = false;
  _currentSession = null;
  _currentUserId = null;
  if (_appStateSubscription) {
    _appStateSubscription.remove();
    _appStateSubscription = null;
  }
  if (_retryTimer) {
    clearInterval(_retryTimer);
    _retryTimer = null;
  }
}
