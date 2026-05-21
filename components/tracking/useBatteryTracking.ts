import { useState, useRef } from "react";
import { BatteryDrainStats, UpdateProfile } from "./tracking-utils";

export function useBatteryTracking() {
  const [batteryDrainStats, setBatteryDrainStats] = useState<BatteryDrainStats>({ easy: [], medium: [], race: [] });
  const [showBatteryStats, setShowBatteryStats] = useState(false);

  const rideStartBatteryLevelRef = useRef<number | null>(null);
  const rideStartBatteryTimeRef = useRef<number>(0);
  const rideBatteryProfileRef = useRef<UpdateProfile>("medium");

  return {
    batteryDrainStats,
    setBatteryDrainStats,
    showBatteryStats,
    setShowBatteryStats,
    rideStartBatteryLevelRef,
    rideStartBatteryTimeRef,
    rideBatteryProfileRef,
  };
}
