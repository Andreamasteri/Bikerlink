import React, { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { DeviceMotion } from "expo-sensors";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Colors from "@/constants/colors";
import { useT } from "@/lib/language-context";
import { apiRequest } from "@/lib/query-client";

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface MountAxisCalibration {
  longAxis: "x" | "y" | "z";
  latAxis: "x" | "y" | "z";
  vertAxis: "x" | "y" | "z";
  longSign: 1 | -1;
  timestamp: number;
}

// ─── Storage helpers ──────────────────────────────────────────────────────────

export const MOUNT_CALIB_KEY = "@bikerlink/mount_axis_calibration_v1";

export async function loadMountCalibration(): Promise<MountAxisCalibration | null> {
  try {
    const raw = await AsyncStorage.getItem(MOUNT_CALIB_KEY);
    if (raw) return JSON.parse(raw) as MountAxisCalibration;
  } catch {
    // AsyncStorage failed — fall through to server
  }
  // Fallback: recupera dal server e ripristina in AsyncStorage
  try {
    const res = await apiRequest("GET", "/api/telemetry/calibration");
    const json = (await res.json()) as { calibration: MountAxisCalibration | null };
    if (json.calibration) {
      try {
        await AsyncStorage.setItem(MOUNT_CALIB_KEY, JSON.stringify(json.calibration));
      } catch {
        // ignora errori di scrittura locale
      }
      return json.calibration;
    }
  } catch {
    // rete non disponibile — fallback silenzioso
  }
  return null;
}

export async function saveMountCalibration(c: MountAxisCalibration): Promise<void> {
  await Promise.allSettled([
    AsyncStorage.setItem(MOUNT_CALIB_KEY, JSON.stringify(c)),
    apiRequest("PUT", "/api/telemetry/calibration", { calibration: c }),
  ]);
}

export async function clearMountCalibration(): Promise<void> {
  await Promise.allSettled([
    AsyncStorage.removeItem(MOUNT_CALIB_KEY),
    apiRequest("PUT", "/api/telemetry/calibration", { calibration: null }),
  ]);
}

// ─── Axis computation ─────────────────────────────────────────────────────────

export function computeAxisCalibration(
  gravity: { x: number; y: number; z: number } | null,
  accelSamples: { x: number; y: number; z: number }[]
): MountAxisCalibration {
  const defaultCalib: MountAxisCalibration = {
    longAxis: "y", latAxis: "x", vertAxis: "z", longSign: 1, timestamp: Date.now(),
  };
  if (!gravity || accelSamples.length < 5) return defaultCalib;

  const absG = { x: Math.abs(gravity.x), y: Math.abs(gravity.y), z: Math.abs(gravity.z) };
  const vertAxis: "x" | "y" | "z" =
    absG.x >= absG.y && absG.x >= absG.z ? "x" :
    absG.y >= absG.x && absG.y >= absG.z ? "y" : "z";

  const candidates = (["x", "y", "z"] as const).filter((a) => a !== vertAxis);
  const [candA, candB] = candidates;

  const axisStats = (axis: "x" | "y" | "z") => {
    const mean = accelSamples.reduce((acc, s) => acc + s[axis], 0) / accelSamples.length;
    const variance = accelSamples.reduce((acc, s) => acc + (s[axis] - mean) ** 2, 0) / accelSamples.length;
    return { rms: Math.sqrt(variance), mean };
  };

  const statsA = axisStats(candA);
  const statsB = axisStats(candB);
  const longAxis = statsA.rms >= statsB.rms ? candA : candB;
  const latAxis = longAxis === candA ? candB : candA;
  const longMean = longAxis === candA ? statsA.mean : statsB.mean;
  const longSign: 1 | -1 = longMean >= 0 ? 1 : -1;

  return { longAxis, latAxis, vertAxis, longSign, timestamp: Date.now() };
}

// ─── MountCalibWizard component ───────────────────────────────────────────────

type CalibWizardStep = "intro" | "still" | "accelerate" | "done";

export function MountCalibWizard({
  onComplete,
  onDismiss,
}: {
  onComplete: (calib: MountAxisCalibration) => void;
  onDismiss: () => void;
}) {
  const t = useT();
  const [step, setStep] = useState<CalibWizardStep>("intro");
  const [countdown, setCountdown] = useState(3);
  const [progressPct, setProgressPct] = useState(0);
  const [detectedCalib, setDetectedCalib] = useState<MountAxisCalibration | null>(null);

  const gravitySamplesRef = useRef<{ x: number; y: number; z: number }[]>([]);
  const accelSamplesRef = useRef<{ x: number; y: number; z: number }[]>([]);
  const gravityRef = useRef<{ x: number; y: number; z: number } | null>(null);
  const dmSubRef = useRef<{ remove: () => void } | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearSensors = () => {
    dmSubRef.current?.remove();
    dmSubRef.current = null;
    if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null; }
  };

  useEffect(() => () => clearSensors(), []);

  const startStillPhase = () => {
    gravitySamplesRef.current = [];
    setStep("still");
    setCountdown(3);
    setProgressPct(0);
    DeviceMotion.setUpdateInterval(100);
    dmSubRef.current = DeviceMotion.addListener((data) => {
      const ag = data.accelerationIncludingGravity;
      if (ag) {
        gravitySamplesRef.current.push({ x: ag.x ?? 0, y: ag.y ?? 0, z: ag.z ?? 0 });
      }
    });
    const startTime = Date.now();
    const DURATION = 3000;
    tickRef.current = setInterval(() => {
      const elapsed = Date.now() - startTime;
      setProgressPct(Math.min(elapsed / DURATION, 1));
      setCountdown(Math.max(1, Math.ceil((DURATION - elapsed) / 1000)));
      if (elapsed >= DURATION) {
        clearSensors();
        const smp = gravitySamplesRef.current;
        if (smp.length > 0) {
          const n = smp.length;
          gravityRef.current = {
            x: smp.reduce((a, s) => a + s.x, 0) / n,
            y: smp.reduce((a, s) => a + s.y, 0) / n,
            z: smp.reduce((a, s) => a + s.z, 0) / n,
          };
        }
        startAccelPhase();
      }
    }, 80);
  };

  const startAccelPhase = () => {
    accelSamplesRef.current = [];
    setStep("accelerate");
    setCountdown(3);
    setProgressPct(0);
    DeviceMotion.setUpdateInterval(100);
    dmSubRef.current = DeviceMotion.addListener((data) => {
      const ac = data.acceleration;
      if (ac) {
        accelSamplesRef.current.push({ x: ac.x ?? 0, y: ac.y ?? 0, z: ac.z ?? 0 });
      }
    });
    const startTime = Date.now();
    const DURATION = 3000;
    tickRef.current = setInterval(() => {
      const elapsed = Date.now() - startTime;
      setProgressPct(Math.min(elapsed / DURATION, 1));
      setCountdown(Math.max(1, Math.ceil((DURATION - elapsed) / 1000)));
      if (elapsed >= DURATION) {
        clearSensors();
        const calib = computeAxisCalibration(gravityRef.current, accelSamplesRef.current);
        setDetectedCalib(calib);
        setStep("done");
      }
    }, 80);
  };

  const axisLabel = (a: "x" | "y" | "z") => a.toUpperCase();

  return (
    <Modal visible animationType="slide" transparent presentationStyle="overFullScreen">
      <View style={calibStyles.overlay}>
        <View style={calibStyles.sheet}>
          {/* Header */}
          <View style={calibStyles.header}>
            <Ionicons name="compass-outline" size={22} color={Colors.accent} />
            <Text style={calibStyles.headerTitle}>{t("tracking.mountCalib.title")}</Text>
            <TouchableOpacity onPress={() => { clearSensors(); onDismiss(); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close" size={22} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {step === "intro" && (
            <View style={calibStyles.body}>
              <Ionicons name="bicycle-outline" size={48} color={Colors.accent} style={{ alignSelf: "center", marginBottom: 16 }} />
              <Text style={calibStyles.stepTitle}>{t("tracking.mountCalib.introTitle")}</Text>
              <Text style={calibStyles.stepDesc}>{t("tracking.mountCalib.introDesc")}</Text>
              <View style={calibStyles.stepsList}>
                <Text style={calibStyles.stepsItem}>{"1. " + t("tracking.mountCalib.step1")}</Text>
                <Text style={calibStyles.stepsItem}>{"2. " + t("tracking.mountCalib.step2")}</Text>
              </View>
              <TouchableOpacity style={calibStyles.primaryBtn} onPress={startStillPhase} activeOpacity={0.85}>
                <Text style={calibStyles.primaryBtnText}>{t("tracking.mountCalib.startBtn")}</Text>
              </TouchableOpacity>
            </View>
          )}

          {(step === "still" || step === "accelerate") && (
            <View style={calibStyles.body}>
              <Ionicons
                name={step === "still" ? "pause-circle-outline" : "speedometer-outline"}
                size={48}
                color={step === "still" ? Colors.warning : Colors.accentRed}
                style={{ alignSelf: "center", marginBottom: 16 }}
              />
              <Text style={calibStyles.stepTitle}>
                {step === "still" ? t("tracking.mountCalib.stillTitle") : t("tracking.mountCalib.accelTitle")}
              </Text>
              <Text style={calibStyles.stepDesc}>
                {step === "still" ? t("tracking.mountCalib.stillDesc") : t("tracking.mountCalib.accelDesc")}
              </Text>
              <View style={calibStyles.progressBg}>
                <View style={[calibStyles.progressFill, { width: `${Math.round(progressPct * 100)}%` }]} />
              </View>
              <Text style={calibStyles.countdown}>{countdown}s</Text>
            </View>
          )}

          {step === "done" && detectedCalib && (
            <View style={calibStyles.body}>
              <Ionicons name="checkmark-circle-outline" size={48} color={Colors.success} style={{ alignSelf: "center", marginBottom: 16 }} />
              <Text style={calibStyles.stepTitle}>{t("tracking.mountCalib.doneTitle")}</Text>
              <View style={calibStyles.resultBox}>
                <View style={calibStyles.resultRow}>
                  <Text style={calibStyles.resultLabel}>{t("tracking.mountCalib.longAxisLabel")}</Text>
                  <Text style={calibStyles.resultValue}>{axisLabel(detectedCalib.longAxis)}</Text>
                </View>
                <View style={calibStyles.resultRow}>
                  <Text style={calibStyles.resultLabel}>{t("tracking.mountCalib.latAxisLabel")}</Text>
                  <Text style={calibStyles.resultValue}>{axisLabel(detectedCalib.latAxis)}</Text>
                </View>
                <View style={calibStyles.resultRow}>
                  <Text style={calibStyles.resultLabel}>{t("tracking.mountCalib.vertAxisLabel")}</Text>
                  <Text style={calibStyles.resultValue}>{axisLabel(detectedCalib.vertAxis)}</Text>
                </View>
              </View>
              <Text style={calibStyles.stepDesc}>{t("tracking.mountCalib.doneDesc")}</Text>
              <TouchableOpacity style={calibStyles.primaryBtn} onPress={() => { saveMountCalibration(detectedCalib).catch(() => {}); onComplete(detectedCalib); }} activeOpacity={0.85}>
                <Text style={calibStyles.primaryBtnText}>{t("tracking.mountCalib.confirmBtn")}</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

export const calibStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.65)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 40,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerTitle: {
    flex: 1,
    fontFamily: "Inter_700Bold",
    fontSize: 16,
    color: Colors.text,
  },
  body: {
    paddingHorizontal: 22,
    paddingTop: 24,
    paddingBottom: 8,
  },
  stepTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 17,
    color: Colors.text,
    textAlign: "center",
    marginBottom: 10,
  },
  stepDesc: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 16,
  },
  stepsList: {
    backgroundColor: Colors.surfaceLight,
    borderRadius: 12,
    padding: 16,
    gap: 8,
    marginBottom: 24,
  },
  stepsItem: {
    fontFamily: "Inter_500Medium",
    fontSize: 14,
    color: Colors.text,
    lineHeight: 20,
  },
  primaryBtn: {
    backgroundColor: Colors.accent,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 4,
  },
  primaryBtnText: {
    fontFamily: "Inter_700Bold",
    fontSize: 15,
    color: "#ffffff",
  },
  progressBg: {
    height: 8,
    backgroundColor: Colors.border,
    borderRadius: 4,
    marginVertical: 16,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: Colors.accent,
    borderRadius: 4,
  },
  countdown: {
    fontFamily: "Inter_700Bold",
    fontSize: 36,
    color: Colors.text,
    textAlign: "center",
    marginTop: 4,
  },
  resultBox: {
    backgroundColor: Colors.surfaceLight,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    gap: 10,
  },
  resultRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  resultLabel: {
    fontFamily: "Inter_500Medium",
    fontSize: 14,
    color: Colors.textSecondary,
  },
  resultValue: {
    fontFamily: "Inter_700Bold",
    fontSize: 16,
    color: Colors.accent,
  },
});
