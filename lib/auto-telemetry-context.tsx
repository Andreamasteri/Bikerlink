import React, { createContext, useContext, useState, useEffect } from "react";
import { useMotorcycleDetector } from "@/hooks/useMotorcycleDetector";
import { useTelemetry } from "@/hooks/useTelemetry";
import { loadTelemetryAlwaysActive, getTelemetryAlwaysActive } from "@/lib/telemetry-prefs";
import { loadMountCalibration } from "@/components/MountCalibWizard";
import { loadRelaxedMountMode } from "@/hooks/useMotorcycleDetector";
import { useAuth } from "@/lib/auth-context";
import {
  getManualTrackingActive,
  subscribeManualTracking,
} from "@/lib/manual-tracking-flag";

interface AutoTelemetryContextValue {
  isAutoRiding: boolean;
  isEnabled: boolean;
  isCalibrated: boolean;
  alwaysActive: boolean;
  relaxedMode: boolean;
}

const AutoTelemetryContext = createContext<AutoTelemetryContextValue>({
  isAutoRiding: false,
  isEnabled: false,
  isCalibrated: false,
  alwaysActive: false,
  relaxedMode: false,
});

export function useAutoTelemetry(): AutoTelemetryContextValue {
  return useContext(AutoTelemetryContext);
}

function AutoTelemetryInner({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [alwaysActive, setAlwaysActive]   = useState(getTelemetryAlwaysActive());
  const [isCalibrated, setIsCalibrated]   = useState(false);
  const [relaxedMode, setRelaxedMode]     = useState(false);
  const [manualActive, setManualActive]   = useState(getManualTrackingActive());

  // ── Hydrate prefs on mount + re-hydrate when user changes ────────────────
  useEffect(() => {
    if (!user) return;
    loadTelemetryAlwaysActive().then(setAlwaysActive).catch(() => {});
    loadMountCalibration()
      .then((c) => setIsCalibrated(!!c))
      .catch(() => {});
    loadRelaxedMountMode().then(setRelaxedMode).catch(() => {});
  }, [user?.id]);

  // ── Poll prefs every 4s so toggle changes in TelemetryPanel propagate ────
  useEffect(() => {
    if (!user) return;
    const id = setInterval(() => {
      setAlwaysActive(getTelemetryAlwaysActive());
      loadMountCalibration()
        .then((c) => setIsCalibrated(!!c))
        .catch(() => {});
      loadRelaxedMountMode().then(setRelaxedMode).catch(() => {});
    }, 4000);
    return () => clearInterval(id);
  }, [user]);

  // ── React immediately when manual tracking starts/stops ──────────────────
  useEffect(() => {
    return subscribeManualTracking(() => setManualActive(getManualTrackingActive()));
  }, []);

  // ── Auto-detect only when all conditions are met ─────────────────────────
  // Suppressed while manual route tracking is active (session_type='ride') to
  // avoid two concurrent ride sessions inflating km_collected.
  // Note: ideal_lap recording (useIdealLapRecorder) does NOT set manualActive,
  // so auto-telemetry correctly keeps running during Giro Ideale sessions.
  const isEnabled = !!user && alwaysActive && isCalibrated && !manualActive;

  const { isRiding } = useMotorcycleDetector({ enabled: isEnabled, relaxedMode });

  useTelemetry(isRiding && isEnabled);

  const isAutoRiding = isRiding && isEnabled;

  return (
    <AutoTelemetryContext.Provider value={{ isAutoRiding, isEnabled, isCalibrated, alwaysActive, relaxedMode }}>
      {children}
    </AutoTelemetryContext.Provider>
  );
}

export function AutoTelemetryProvider({ children }: { children: React.ReactNode }) {
  return <AutoTelemetryInner>{children}</AutoTelemetryInner>;
}
