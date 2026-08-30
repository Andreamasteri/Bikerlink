import React, { createContext, useContext, useState, useEffect, useMemo } from "react";
import { useMotorcycleDetector } from "@/hooks/useMotorcycleDetector";
import { useTelemetry } from "@/hooks/useTelemetry";
import { loadTelemetryAlwaysActive, getTelemetryAlwaysActive } from "@/lib/telemetry-prefs";
import { loadMountCalibration } from "@/components/MountCalibWizard";
import { loadRelaxedMountMode } from "@/hooks/useMotorcycleDetector";
import { useAuth } from "@/lib/auth-context";
import { isTrackingActive, registerTrackingActiveCallback } from "@/lib/tracking-active";

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
  const userId = user?.id ?? null;
  const [alwaysActive, setAlwaysActive]   = useState(getTelemetryAlwaysActive());
  const [isCalibrated, setIsCalibrated]   = useState(false);
  const [relaxedMode, setRelaxedMode]     = useState(false);
  const [canonicalTrackingActive, setCanonicalTrackingActive] = useState(isTrackingActive());

  // ── Hydrate prefs on mount + re-hydrate when user changes ────────────────
  useEffect(() => {
    if (!user) return;
    loadTelemetryAlwaysActive().then(setAlwaysActive).catch(() => {});
    loadMountCalibration()
      .then((c) => setIsCalibrated(!!c))
      .catch(() => {});
    loadRelaxedMountMode().then(setRelaxedMode).catch(() => {});
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- intentional: depend on the primitive userId, not the whole user object (avoids re-running on unrelated user field changes)
  }, [userId]);

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
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- intentional: depend on the primitive userId, not the whole user object
  }, [userId]);

  useEffect(() => registerTrackingActiveCallback(setCanonicalTrackingActive), []);

  // ── General telemetry is primary and independent of optional lap modes. ───
  // Suppressed only while the canonical route tracker owns the telemetry lease.
  const isEnabled = !!user && alwaysActive && isCalibrated && !canonicalTrackingActive;

  const { isRiding } = useMotorcycleDetector({ enabled: isEnabled, relaxedMode });

  useTelemetry(isEnabled);

  const isAutoRiding = isRiding && isEnabled;

  const contextValue = useMemo(
    () => ({ isAutoRiding, isEnabled, isCalibrated, alwaysActive, relaxedMode }),
    [isAutoRiding, isEnabled, isCalibrated, alwaysActive, relaxedMode]
  );

  return (
    <AutoTelemetryContext.Provider value={contextValue}>
      {children}
    </AutoTelemetryContext.Provider>
  );
}

export function AutoTelemetryProvider({ children }: { children: React.ReactNode }) {
  return <AutoTelemetryInner>{children}</AutoTelemetryInner>;
}
