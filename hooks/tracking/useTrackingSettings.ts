import { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { UpdateProfile } from "../../components/tracking/tracking-utils";
import { getApiUrl } from "../../lib/query-client";

interface SensorSettings {
  globalEnabled: boolean;
  userEnabled: boolean;
}

export type TrackingStartMode = "manual" | "automatic";

async function fetchSensorSettings(): Promise<SensorSettings> {
  const res = await fetch(new URL("/api/telemetry/sensor-settings", getApiUrl()).toString(), {
    credentials: "include",
  });
  if (!res.ok) return { globalEnabled: false, userEnabled: false };
  return res.json();
}

export function useTrackingSettings() {
  const [profile, setProfile] = useState<UpdateProfile>("medium");
  const [countdownEnabled, setCountdownEnabled] = useState(false);
  const [countdownSec, setCountdownSec] = useState("10");
  const [startMode, setStartMode] = useState<TrackingStartMode>("manual");
  const [handsOffEnabled, setHandsOffEnabled] = useState(false);
  const [handsOffSpeedStr, setHandsOffSpeedStr] = useState("50");
  const [is0100Enabled, setIs0100Enabled] = useState(false);
  const [showMyRoute, setShowMyRoute] = useState(true);
  const [showMountCalibWizard, setShowMountCalibWizard] = useState(false);

  const { data: sensorSettings } = useQuery<SensorSettings>({
    queryKey: ["/api/telemetry/sensor-settings"],
    queryFn: fetchSensorSettings,
    staleTime: 60_000,
  });

  const sensorsEnabled = (sensorSettings?.globalEnabled ?? false) && (sensorSettings?.userEnabled ?? false);

  const profileRef = useRef<UpdateProfile>("medium");
  const handsOffEnabledRef = useRef(false);
  const handsOffSpeedRef = useRef(50);
  const is0100EnabledRef = useRef(false);
  const sensorsEnabledRef = useRef(false);
  const startModeRef = useRef<TrackingStartMode>("manual");

  useEffect(() => {
    sensorsEnabledRef.current = sensorsEnabled;
  }, [sensorsEnabled]);
  useEffect(() => {
    startModeRef.current = startMode;
  }, [startMode]);

  return {
    profile,
    setProfile,
    countdownEnabled,
    setCountdownEnabled,
    countdownSec,
    setCountdownSec,
    startMode,
    setStartMode,
    handsOffEnabled,
    setHandsOffEnabled,
    handsOffSpeedStr,
    setHandsOffSpeedStr,
    is0100Enabled,
    setIs0100Enabled,
    showMyRoute,
    setShowMyRoute,
    sensorsEnabled,
    showMountCalibWizard,
    setShowMountCalibWizard,
    profileRef,
    handsOffEnabledRef,
    handsOffSpeedRef,
    is0100EnabledRef,
    sensorsEnabledRef,
    startModeRef,
  };
}
