import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Updates from "expo-updates";
import { lastEventId } from "@/lib/sentry";
import {
  testAuth,
  testApiCore,
  testApiRouting,
  testStorage,
  testPermissions,
  testMatchingPipeline,
  testChatPipeline,
  testOtaPipeline,
  testPushToken,
  testGpsReading,
  testRoutingReal,
  testHardwareSensors,
  testAdmin,
} from "./runner.sections";

// ── Types ────────────────────────────────────────────────────────────────────

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
  buildProfile: string;
  runAt: string;
}

export type ProgressCallback = (done: number, total: number, lastResult: DiagnosticTestResult) => void;

// ── Build capability detection ───────────────────────────────────────────────

export interface BuildCapabilities {
  isNative: boolean;
  isDiagnosticApk: boolean;
  buildProfile: string;
}

export function detectBuildCapabilities(): BuildCapabilities {
  const isNative =
    Platform.OS !== "web" &&
    Constants.appOwnership !== "expo";

  const envProfile =
    process.env.EXPO_PUBLIC_BUILD_PROFILE ??
    (Constants.expoConfig?.extra as Record<string, unknown> | undefined)?.buildProfile ??
    "";

  // EXPO_PUBLIC_BUILD_PROFILE viene baked al build EAS ma cancellato da ogni bundle
  // OTA → diventa "" dopo il primo OTA. Updates.channel invece sopravvive agli OTA
  // (è il canale su cui la build è stata pubblicata), quindi è il segnale affidabile
  // per riconoscere una diagnostic APK anche dopo aggiornamenti OTA successivi.
  const channel = (typeof Updates.channel === "string" ? Updates.channel : "") || "";

  const isDiagnosticApk =
    isNative && (envProfile === "diagnostic" || channel === "diagnostic");

  const buildProfile = isDiagnosticApk ? "diagnostic" : (isNative ? "standard" : "expo-go");

  return { isNative, isDiagnosticApk, buildProfile };
}

// ── Main runner ──────────────────────────────────────────────────────────────

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
    () => testHardwareSensors(caps.isNative),
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
    buildProfile: caps.buildProfile,
    runAt: new Date().toISOString(),
  };
}
